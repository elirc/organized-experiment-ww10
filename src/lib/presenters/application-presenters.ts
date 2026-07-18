/**
 * What this file does: Normalizes Prisma records into JSON-friendly response shapes for the UI.
 * What calls it: Query and command services.
 * What it calls: No database code; only object mapping.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Returning raw Prisma records with decimals and Date objects directly to the browser, then
 * fighting serialization bugs and inconsistent response shapes in the UI.
 */
import { type Prisma } from "@prisma/client";

import {
  applicationDetailInclude,
  applicationSummaryInclude,
} from "@/repositories/application-repository";

type ApplicationSummaryRecord = Prisma.LoanApplicationGetPayload<{
  include: typeof applicationSummaryInclude;
}>;

type ApplicationDetailRecord = Prisma.LoanApplicationGetPayload<{
  include: typeof applicationDetailInclude;
}>;

function serializeAmount(value: { toString(): string }) {
  return value.toString();
}

function mapParty(party: ApplicationDetailRecord["parties"][number]) {
  return {
    id: party.id,
    role: party.role,
    firstName: party.firstName,
    lastName: party.lastName,
    email: party.email,
    annualIncome: serializeAmount(party.annualIncome),
    userId: party.userId,
  };
}

export function presentApplicationSummary(application: ApplicationSummaryRecord) {
  const primaryApplicant = application.parties.find((party) => party.role === "PRIMARY");

  return {
    publicId: application.publicId,
    productType: application.productType,
    purpose: application.purpose,
    requestedAmount: serializeAmount(application.requestedAmount),
    stage: application.stage,
    decisionOutcome: application.decisionOutcome,
    stageReason: application.stageReason,
    updatedAt: application.updatedAt.toISOString(),
    assignedOfficer: application.assignedOfficer,
    primaryApplicant: primaryApplicant
      ? {
          fullName: `${primaryApplicant.firstName} ${primaryApplicant.lastName}`,
          email: primaryApplicant.email,
        }
      : null,
  };
}

export function presentApplicationDetail(application: ApplicationDetailRecord) {
  return {
    publicId: application.publicId,
    stage: application.stage,
    decisionOutcome: application.decisionOutcome,
    stageReason: application.stageReason,
    productType: application.productType,
    purpose: application.purpose,
    requestedAmount: serializeAmount(application.requestedAmount),
    stateVersion: application.stateVersion,
    intakeCompletedAt: application.intakeCompletedAt?.toISOString() ?? null,
    approvedAt: application.approvedAt?.toISOString() ?? null,
    deniedAt: application.deniedAt?.toISOString() ?? null,
    disbursedAt: application.disbursedAt?.toISOString() ?? null,
    servicingHandedOffAt: application.servicingHandedOffAt?.toISOString() ?? null,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    createdBy: application.createdBy,
    assignedOfficer: application.assignedOfficer,
    parties: application.parties.map(mapParty),
    verifications: application.verifications.map((verification) => ({
      id: verification.id,
      type: verification.type,
      status: verification.status,
      providerReference: verification.providerReference,
      providerSequence: verification.providerSequence,
      summary: verification.summary,
      startedAt: verification.startedAt?.toISOString() ?? null,
      completedAt: verification.completedAt?.toISOString() ?? null,
    })),
    conditions: application.conditions.map((condition) => ({
      id: condition.id,
      title: condition.title,
      description: condition.description,
      status: condition.status,
      dueAt: condition.dueAt?.toISOString() ?? null,
      resolvedAt: condition.resolvedAt?.toISOString() ?? null,
      createdBy: condition.createdBy,
      resolvedBy: condition.resolvedBy,
    })),
    transitions: application.transitions.map((transition) => ({
      id: transition.id,
      fromStage: transition.fromStage,
      toStage: transition.toStage,
      reason: transition.reason,
      triggeredBySystem: transition.triggeredBySystem,
      triggeredBy: transition.triggeredBy,
      createdAt: transition.createdAt.toISOString(),
    })),
    externalEvents: application.externalEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      providerSequence: event.providerSequence,
      providerStatus: event.providerStatus,
      summary: event.summary,
      appliedToWorkflow: event.appliedToWorkflow,
      receivedOutOfOrder: event.receivedOutOfOrder,
      occurredAt: event.occurredAt.toISOString(),
      receivedAt: event.receivedAt.toISOString(),
      payload: event.payload,
    })),
    auditLogs: application.auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      summary: log.summary,
      actor: log.actor,
      createdAt: log.createdAt.toISOString(),
    })),
  };
}
