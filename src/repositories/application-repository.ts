/**
 * What this file does: Owns every Prisma query for loan applications, including the visibility
 * filter that prevents borrower and servicing users from seeing records outside their scope.
 * What calls it: `src/services/application-query-service.ts` and
 * `src/services/application-command-service.ts`.
 * What it calls: `src/lib/db/prisma.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Building query filters ad hoc in each service, which almost guarantees one read path will miss
 * the ownership predicate and leak cross-account data.
 */
import { type Prisma, type PrismaClient, type ApplicationStage } from "@prisma/client";

import type { AppSession } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const userSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
} as const;

export const applicationSummaryInclude = {
  parties: {
    orderBy: { createdAt: "asc" },
  },
  assignedOfficer: {
    select: userSelect,
  },
} as const satisfies Prisma.LoanApplicationInclude;

export const applicationDetailInclude = {
  createdBy: {
    select: userSelect,
  },
  assignedOfficer: {
    select: userSelect,
  },
  parties: {
    orderBy: { createdAt: "asc" },
  },
  verifications: {
    orderBy: { type: "asc" },
  },
  conditions: {
    orderBy: [{ createdAt: "desc" }],
    include: {
      createdBy: {
        select: userSelect,
      },
      resolvedBy: {
        select: userSelect,
      },
    },
  },
  transitions: {
    orderBy: { createdAt: "desc" },
    include: {
      triggeredBy: {
        select: userSelect,
      },
    },
  },
  externalEvents: {
    orderBy: { receivedAt: "desc" },
  },
  auditLogs: {
    orderBy: { createdAt: "desc" },
    include: {
      actor: {
        select: userSelect,
      },
    },
  },
} as const satisfies Prisma.LoanApplicationInclude;

export function buildApplicationVisibilityWhere(
  session: AppSession,
): Prisma.LoanApplicationWhereInput {
  if (session.user.role === "BORROWER") {
    // Borrowers only ever see applications where they are explicitly linked as a party.
    return {
      parties: {
        some: {
          userId: session.user.id,
        },
      },
    };
  }

  if (session.user.role === "SERVICING_AGENT") {
    // Servicing should not see pre-funding files; that keeps pre-close borrower data out of the
    // servicing queue until operations has actually disbursed the loan.
    return {
      stage: {
        in: ["DISBURSEMENT", "SERVICING_HANDOFF"] satisfies ApplicationStage[],
      },
    };
  }

  return {};
}

export const applicationRepository = {
  listVisibleSummaries(session: AppSession) {
    return prisma.loanApplication.findMany({
      where: buildApplicationVisibilityWhere(session),
      include: applicationSummaryInclude,
      orderBy: [{ updatedAt: "desc" }],
    });
  },

  findVisibleDetailByPublicId(session: AppSession, publicId: string) {
    return prisma.loanApplication.findFirst({
      where: {
        publicId,
        ...buildApplicationVisibilityWhere(session),
      },
      include: applicationDetailInclude,
    });
  },

  findWorkflowAggregateByPublicId(db: DatabaseClient, publicId: string) {
    return db.loanApplication.findUnique({
      where: { publicId },
      include: {
        parties: true,
        verifications: true,
        conditions: true,
      },
    });
  },

  findWorkflowAggregateById(db: DatabaseClient, applicationId: string) {
    return db.loanApplication.findUnique({
      where: { id: applicationId },
      include: {
        parties: true,
        verifications: true,
        conditions: true,
      },
    });
  },

  loadApplicationDetailById(db: DatabaseClient, applicationId: string) {
    return db.loanApplication.findUniqueOrThrow({
      where: { id: applicationId },
      include: applicationDetailInclude,
    });
  },

  createApplication(db: DatabaseClient, data: Prisma.LoanApplicationCreateInput) {
    return db.loanApplication.create({
      data,
      include: applicationDetailInclude,
    });
  },

  createVerificationRequest(
    db: DatabaseClient,
    applicationId: string,
    data: Omit<Prisma.VerificationRequestUncheckedCreateInput, "applicationId">,
  ) {
    return db.verificationRequest.upsert({
      where: {
        applicationId_type: {
          applicationId,
          type: data.type,
        },
      },
      create: {
        ...data,
        applicationId,
      },
      update: {
        providerReference: data.providerReference,
        startedAt: data.startedAt,
      },
    });
  },

  updateVerificationRequest(
    db: DatabaseClient,
    verificationId: string,
    data: Prisma.VerificationRequestUpdateInput,
  ) {
    return db.verificationRequest.update({
      where: { id: verificationId },
      data,
    });
  },

  createExternalEvent(
    db: DatabaseClient,
    data: Prisma.ExternalWorkflowEventUncheckedCreateInput,
  ) {
    return db.externalWorkflowEvent.create({
      data,
    });
  },

  createCondition(db: DatabaseClient, data: Prisma.UnderwritingConditionUncheckedCreateInput) {
    return db.underwritingCondition.create({
      data,
    });
  },

  findConditionById(db: DatabaseClient, conditionId: string) {
    return db.underwritingCondition.findUnique({
      where: { id: conditionId },
      include: {
        application: {
          include: {
            parties: true,
            verifications: true,
            conditions: true,
          },
        },
      },
    });
  },

  updateCondition(
    db: DatabaseClient,
    conditionId: string,
    data: Prisma.UnderwritingConditionUpdateInput,
  ) {
    return db.underwritingCondition.update({
      where: { id: conditionId },
      data,
    });
  },

  createTransition(db: DatabaseClient, data: Prisma.ApplicationTransitionUncheckedCreateInput) {
    return db.applicationTransition.create({
      data,
    });
  },

  createAuditLog(db: DatabaseClient, data: Prisma.AuditLogUncheckedCreateInput) {
    return db.auditLog.create({
      data,
    });
  },
};

// SENIOR NOTE: `buildApplicationVisibilityWhere()` is a load-bearing boundary. If someone
// "temporarily" bypasses it for a convenience endpoint, the borrower isolation guarantee is gone.
