/**
 * What this file does: Centralizes the role matrix and the ownership rules for application
 * access so routes can delegate authorization decisions instead of scattering checks in handlers.
 * What calls it: `src/lib/http/route-handler.ts`, query services, and command services.
 * What it calls: `src/lib/errors/app-error.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Checking only the user's role and forgetting record ownership, which is how borrower-facing
 * products accidentally leak another borrower's application data.
 */
import type { ApplicationStage, UserRole } from "@prisma/client";

import { forbidden, unauthorized } from "@/lib/errors/app-error";

export type AppSession = {
  user: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
  };
};

export type Permission =
  | "session:assume-demo-user"
  | "application:create"
  | "application:view-pipeline"
  | "application:submit"
  | "application:manage-verifications"
  | "application:record-decision"
  | "application:manage-conditions"
  | "application:disburse"
  | "application:handoff-servicing";

const rolePermissions: Record<UserRole, Permission[]> = {
  BORROWER: ["application:create", "application:submit"],
  LOAN_OFFICER: [
    "application:create",
    "application:view-pipeline",
    "application:manage-verifications",
    "application:manage-conditions",
  ],
  UNDERWRITER: [
    "application:view-pipeline",
    "application:record-decision",
    "application:manage-conditions",
  ],
  OPERATIONS_MANAGER: [
    "application:view-pipeline",
    "application:disburse",
    "application:handoff-servicing",
    "session:assume-demo-user",
  ],
  SERVICING_AGENT: ["application:view-pipeline"],
};

export function hasPermission(session: AppSession, permission: Permission) {
  return rolePermissions[session.user.role].includes(permission);
}

export function assertPermission(session: AppSession | null, permission: Permission) {
  if (!session) {
    throw unauthorized();
  }

  if (!hasPermission(session, permission)) {
    throw forbidden(`Role ${session.user.role} cannot perform ${permission}.`);
  }
}

export function canReadApplication(
  session: AppSession,
  application: {
    createdById: string;
    partyUserIds: string[];
    stage: ApplicationStage;
  },
) {
  if (session.user.role === "BORROWER") {
    return (
      application.createdById === session.user.id ||
      application.partyUserIds.includes(session.user.id)
    );
  }

  if (session.user.role === "SERVICING_AGENT") {
    return (
      application.stage === "DISBURSEMENT" ||
      application.stage === "SERVICING_HANDOFF"
    );
  }

  return true;
}

// SENIOR NOTE: Keep role permissions and record-level ownership checks in the same module.
// Splitting them across routes and services is how authorization drift sneaks in over time.
