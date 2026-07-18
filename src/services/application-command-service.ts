/**
 * What this file does: Owns all write-side workflow commands for loan applications, including
 * stage transitions, async verification ingestion, rollback logic, and audit history writes.
 * What calls it: Mutation routes under `src/app/api/applications/**` and `src/app/api/conditions/**`.
 * What it calls: Repositories, presenters, Prisma transactions, and the workflow reconciler.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Letting routes perform direct Prisma writes for each action, which makes transition rules,
 * auditing, and rollback handling inconsistent across endpoints.
 */
import {
  type ConditionStatus,
  type DecisionOutcome,
  type ExternalEventType,
  type LoanProductType,
  Prisma,
  type PrismaClient,
  type VerificationStatus,
  type VerificationType,
} from "@prisma/client";

import type { AppSession } from "@/lib/auth/permissions";
import { canReadApplication } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { badRequest, forbidden, notFound } from "@/lib/errors/app-error";
import { presentApplicationDetail } from "@/lib/presenters/application-presenters";
import { createApplicationPublicId } from "@/lib/utils/public-id";
import { applicationRepository } from "@/repositories/application-repository";
import {
  assertCanDisburse,
  assertCanSubmitApplication,
  reconcileWorkflow,
} from "@/services/workflow-reconciliation-service";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

function buildWorkflowSnapshot(
  application: Awaited<ReturnType<typeof applicationRepository.findWorkflowAggregateById>>,
) {
  if (!application) {
    throw notFound("Application not found.");
  }

  return {
    currentStage: application.stage,
    decisionOutcome: application.decisionOutcome,
    intakeCompletedAt: application.intakeCompletedAt,
    approvedAt: application.approvedAt,
    deniedAt: application.deniedAt,
    disbursedAt: application.disbursedAt,
    servicingHandedOffAt: application.servicingHandedOffAt,
    verifications: application.verifications.map((verification) => ({
      type: verification.type,
      status: verification.status,
    })),
    conditions: application.conditions.map((condition) => ({
      title: condition.title,
      status: condition.status,
    })),
  };
}

async function ensureReadableApplication(session: AppSession, publicId: string) {
  const application = await applicationRepository.findVisibleDetailByPublicId(session, publicId);
  if (!application) {
    throw notFound("Application not found.");
  }

  const partyUserIds = application.parties
    .map((party) => party.userId)
    .filter((userId): userId is string => Boolean(userId));

  if (
    !canReadApplication(session, {
      createdById: application.createdById,
      partyUserIds,
      stage: application.stage,
    })
  ) {
    throw forbidden("You are not allowed to access this application.");
  }

  return application;
}

async function createLifecycleAuditLog(
  tx: DatabaseClient,
  applicationId: string,
  actorUserId: string,
  action: string,
  summary: string,
  metadata?: Prisma.InputJsonValue,
) {
  await applicationRepository.createAuditLog(tx, {
    applicationId,
    actorUserId,
    action,
    entityType: "LoanApplication",
    entityId: applicationId,
    summary,
    metadata,
  });
}

async function reconcileAndPersistStage(
  tx: DatabaseClient,
  applicationId: string,
  publicId: string,
  actorUserId: string | null,
) {
  const aggregate = await applicationRepository.findWorkflowAggregateById(tx, applicationId);
  if (!aggregate) {
    throw notFound("Application not found.");
  }

  const snapshot = buildWorkflowSnapshot(aggregate);
  const evaluation = reconcileWorkflow(snapshot);

  if (
    evaluation.nextStage !== aggregate.stage ||
    evaluation.reason !== aggregate.stageReason
  ) {
    const previousStage = aggregate.stage;

    await tx.loanApplication.update({
      where: { id: applicationId },
      data: {
        stage: evaluation.nextStage,
        stageReason: evaluation.reason,
        stateVersion: {
          increment: 1,
        },
      },
    });

    await applicationRepository.createTransition(tx, {
      applicationId,
      fromStage: previousStage,
      toStage: evaluation.nextStage,
      reason: evaluation.reason,
      triggeredById: actorUserId ?? undefined,
      triggeredBySystem: actorUserId === null,
      metadata: {
        publicId,
      },
    });
  }

  return applicationRepository.loadApplicationDetailById(tx, applicationId);
}

export const applicationCommandService = {
  async createApplication(
    session: AppSession,
    input: {
      productType: LoanProductType;
      purpose: string;
      requestedAmount: number;
      primaryApplicant: {
        firstName: string;
        lastName: string;
        email: string;
        annualIncome: number;
        userId?: string;
      };
      coApplicant?: {
        firstName: string;
        lastName: string;
        email: string;
        annualIncome: number;
        userId?: string;
      };
    },
  ) {
    const created = await prisma.$transaction(async (tx) => {
      const application = await applicationRepository.createApplication(tx, {
        publicId: createApplicationPublicId(),
        productType: input.productType,
        purpose: input.purpose,
        requestedAmount: new Prisma.Decimal(input.requestedAmount),
        stageReason: "Borrower intake started and required disclosures are pending.",
        createdBy: {
          connect: {
            id: session.user.id,
          },
        },
        assignedOfficer:
          session.user.role === "LOAN_OFFICER"
            ? {
                connect: {
                  id: session.user.id,
                },
              }
            : undefined,
        parties: {
          create: [
            {
              role: "PRIMARY",
              userId:
                input.primaryApplicant.userId ??
                (session.user.role === "BORROWER" ? session.user.id : undefined),
              firstName: input.primaryApplicant.firstName,
              lastName: input.primaryApplicant.lastName,
              email: input.primaryApplicant.email,
              annualIncome: new Prisma.Decimal(input.primaryApplicant.annualIncome),
            },
            ...(input.coApplicant
              ? [
                  {
                    role: "CO_APPLICANT" as const,
                    userId: input.coApplicant.userId,
                    firstName: input.coApplicant.firstName,
                    lastName: input.coApplicant.lastName,
                    email: input.coApplicant.email,
                    annualIncome: new Prisma.Decimal(input.coApplicant.annualIncome),
                  },
                ]
              : []),
          ],
        },
      });

      await createLifecycleAuditLog(
        tx,
        application.id,
        session.user.id,
        "APPLICATION_CREATED",
        `Application ${application.publicId} created by ${session.user.fullName}.`,
      );

      return application;
    });

    return presentApplicationDetail(created);
  },

  async submitApplication(session: AppSession, publicId: string) {
    const visibleApplication = await ensureReadableApplication(session, publicId);

    if (session.user.role !== "BORROWER" && session.user.role !== "LOAN_OFFICER") {
      throw forbidden("Only borrowers and loan officers can submit intake packages.");
    }

    try {
      assertCanSubmitApplication(visibleApplication.stage);
    } catch (error) {
      throw badRequest((error as Error).message);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.loanApplication.update({
        where: { id: visibleApplication.id },
        data: {
          intakeCompletedAt: new Date(),
        },
      });

      await createLifecycleAuditLog(
        tx,
        visibleApplication.id,
        session.user.id,
        "APPLICATION_SUBMITTED",
        `Application ${publicId} submitted into verification.`,
      );

      return reconcileAndPersistStage(tx, visibleApplication.id, publicId, session.user.id);
    });

    return presentApplicationDetail(updated);
  },

  async requestVerification(
    session: AppSession,
    publicId: string,
    input: {
      type: VerificationType;
      providerReference?: string;
    },
  ) {
    const visibleApplication = await ensureReadableApplication(session, publicId);

    const updated = await prisma.$transaction(async (tx) => {
      await applicationRepository.createVerificationRequest(tx, visibleApplication.id, {
        type: input.type,
        providerReference: input.providerReference,
        status: "PENDING",
        providerSequence: 0,
        startedAt: new Date(),
      });

      await createLifecycleAuditLog(
        tx,
        visibleApplication.id,
        session.user.id,
        "VERIFICATION_REQUESTED",
        `${input.type} requested for ${publicId}.`,
      );

      return reconcileAndPersistStage(tx, visibleApplication.id, publicId, session.user.id);
    });

    return presentApplicationDetail(updated);
  },

  async ingestExternalVerificationEvent(
    session: AppSession,
    publicId: string,
    input: {
      type: VerificationType;
      eventType: ExternalEventType;
      status: VerificationStatus;
      providerSequence: number;
      providerReference?: string;
      summary: string;
      occurredAt: string;
      payload: Record<string, unknown>;
    },
  ) {
    const visibleApplication = await ensureReadableApplication(session, publicId);

    const updated = await prisma.$transaction(async (tx) => {
      let verification = await tx.verificationRequest.findUnique({
        where: {
          applicationId_type: {
            applicationId: visibleApplication.id,
            type: input.type,
          },
        },
      });

      if (!verification) {
        verification = await tx.verificationRequest.create({
          data: {
            applicationId: visibleApplication.id,
            type: input.type,
            status: input.status,
            providerReference: input.providerReference,
            providerSequence: input.providerSequence,
            summary: input.summary,
            startedAt: new Date(input.occurredAt),
            completedAt: new Date(input.occurredAt),
            lastPayload: input.payload as Prisma.InputJsonValue,
          },
        });
      }

      const isOutOfOrder = input.providerSequence < verification.providerSequence;
      const shouldApply = input.providerSequence >= verification.providerSequence;

      await applicationRepository.createExternalEvent(tx, {
        applicationId: visibleApplication.id,
        verificationRequestId: verification.id,
        eventType: input.eventType,
        providerSequence: input.providerSequence,
        providerStatus: input.status,
        summary: input.summary,
        payload: input.payload as Prisma.InputJsonValue,
        occurredAt: new Date(input.occurredAt),
        appliedToWorkflow: shouldApply,
        receivedOutOfOrder: isOutOfOrder,
      });

      if (shouldApply) {
        await applicationRepository.updateVerificationRequest(tx, verification.id, {
          status: input.status,
          providerReference: input.providerReference,
          providerSequence: input.providerSequence,
          summary: input.summary,
          completedAt: new Date(input.occurredAt),
          lastPayload: input.payload as Prisma.InputJsonValue,
        });
      }

      await createLifecycleAuditLog(
        tx,
        visibleApplication.id,
        session.user.id,
        "EXTERNAL_EVENT_RECEIVED",
        `${input.type} result ${input.status} received for ${publicId}.`,
        {
          outOfOrder: isOutOfOrder,
          providerSequence: input.providerSequence,
        },
      );

      return reconcileAndPersistStage(
        tx,
        visibleApplication.id,
        publicId,
        shouldApply ? null : session.user.id,
      );
    });

    return presentApplicationDetail(updated);
  },

  async recordDecision(
    session: AppSession,
    publicId: string,
    input: {
      outcome: Exclude<DecisionOutcome, "PENDING">;
      reason: string;
    },
  ) {
    const visibleApplication = await ensureReadableApplication(session, publicId);
    const aggregate = await applicationRepository.findWorkflowAggregateByPublicId(prisma, publicId);
    const evaluation = reconcileWorkflow(buildWorkflowSnapshot(aggregate));

    if (evaluation.nextStage === "VERIFICATION") {
      throw badRequest("All required verification checks must pass before decisioning.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.loanApplication.update({
        where: { id: visibleApplication.id },
        data: {
          decisionOutcome: input.outcome,
          approvedAt: input.outcome === "APPROVED" ? new Date() : null,
          deniedAt: input.outcome === "DECLINED" ? new Date() : null,
          stageReason: input.reason,
        },
      });

      await createLifecycleAuditLog(
        tx,
        visibleApplication.id,
        session.user.id,
        "DECISION_RECORDED",
        `${input.outcome} decision recorded for ${publicId}.`,
        {
          reason: input.reason,
        },
      );

      return reconcileAndPersistStage(tx, visibleApplication.id, publicId, session.user.id);
    });

    return presentApplicationDetail(updated);
  },

  async createCondition(
    session: AppSession,
    publicId: string,
    input: {
      title: string;
      description: string;
      dueAt?: string;
    },
  ) {
    const visibleApplication = await ensureReadableApplication(session, publicId);

    const updated = await prisma.$transaction(async (tx) => {
      await applicationRepository.createCondition(tx, {
        applicationId: visibleApplication.id,
        title: input.title,
        description: input.description,
        status: "OPEN",
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        createdById: session.user.id,
      });

      await createLifecycleAuditLog(
        tx,
        visibleApplication.id,
        session.user.id,
        "CONDITION_CREATED",
        `${input.title} added to ${publicId}.`,
      );

      return reconcileAndPersistStage(tx, visibleApplication.id, publicId, session.user.id);
    });

    return presentApplicationDetail(updated);
  },

  async resolveCondition(
    session: AppSession,
    conditionId: string,
    input: {
      status: Exclude<ConditionStatus, "OPEN">;
      resolutionNote: string;
    },
  ) {
    const condition = await applicationRepository.findConditionById(prisma, conditionId);
    if (!condition) {
      throw notFound("Condition not found.");
    }

    const partyUserIds = condition.application.parties
      .map((party) => party.userId)
      .filter((userId): userId is string => Boolean(userId));

    if (
      !canReadApplication(session, {
        createdById: condition.application.createdById,
        partyUserIds,
        stage: condition.application.stage,
      })
    ) {
      throw forbidden("You are not allowed to access this application.");
    }

    if (
      input.status === "FAILED" &&
      (condition.application.stage === "DISBURSEMENT" ||
        condition.application.stage === "SERVICING_HANDOFF")
    ) {
      throw badRequest("A funded loan cannot be rolled back into conditions.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      await applicationRepository.updateCondition(tx, conditionId, {
        status: input.status,
        resolvedAt: new Date(),
        resolvedBy: {
          connect: {
            id: session.user.id,
          },
        },
      });

      await createLifecycleAuditLog(
        tx,
        condition.application.id,
        session.user.id,
        "CONDITION_RESOLVED",
        `${condition.title} marked ${input.status}.`,
        {
          resolutionNote: input.resolutionNote,
        },
      );

      return reconcileAndPersistStage(
        tx,
        condition.application.id,
        condition.application.publicId,
        session.user.id,
      );
    });

    return presentApplicationDetail(updated);
  },

  async disburseApplication(session: AppSession, publicId: string) {
    const visibleApplication = await ensureReadableApplication(session, publicId);
    const aggregate = await applicationRepository.findWorkflowAggregateByPublicId(prisma, publicId);

    try {
      assertCanDisburse(reconcileWorkflow(buildWorkflowSnapshot(aggregate)));
    } catch (error) {
      throw badRequest((error as Error).message);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.loanApplication.update({
        where: { id: visibleApplication.id },
        data: {
          disbursedAt: new Date(),
        },
      });

      await createLifecycleAuditLog(
        tx,
        visibleApplication.id,
        session.user.id,
        "APPLICATION_DISBURSED",
        `${publicId} moved into disbursement.`,
      );

      return reconcileAndPersistStage(tx, visibleApplication.id, publicId, session.user.id);
    });

    return presentApplicationDetail(updated);
  },

  async handoffToServicing(session: AppSession, publicId: string) {
    const visibleApplication = await ensureReadableApplication(session, publicId);

    if (visibleApplication.stage !== "DISBURSEMENT") {
      throw badRequest("Only disbursed loans can be handed off to servicing.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.loanApplication.update({
        where: { id: visibleApplication.id },
        data: {
          servicingHandedOffAt: new Date(),
        },
      });

      await createLifecycleAuditLog(
        tx,
        visibleApplication.id,
        session.user.id,
        "SERVICING_HANDOFF",
        `${publicId} transferred to servicing.`,
      );

      return reconcileAndPersistStage(tx, visibleApplication.id, publicId, session.user.id);
    });

    return presentApplicationDetail(updated);
  },
};

// SENIOR NOTE: Every workflow mutation goes through a transaction because stage changes,
// audit logs, and external-event bookkeeping must commit together or not at all.
