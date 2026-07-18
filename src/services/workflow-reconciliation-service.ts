/**
 * What this file does: Recomputes the canonical application stage from the current aggregate
 * instead of trusting the order in which async verification and condition events arrived.
 * What calls it: `src/services/application-command-service.ts`.
 * What it calls: No I/O; this is pure decision logic.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Mutating the stage directly from each event handler, which makes stale provider events capable
 * of undoing newer work or skipping required review states.
 */
import type {
  ApplicationStage,
  ConditionStatus,
  DecisionOutcome,
  VerificationStatus,
  VerificationType,
} from "@prisma/client";

type WorkflowSnapshot = {
  currentStage: ApplicationStage;
  decisionOutcome: DecisionOutcome;
  intakeCompletedAt: Date | null;
  approvedAt: Date | null;
  deniedAt: Date | null;
  disbursedAt: Date | null;
  servicingHandedOffAt: Date | null;
  verifications: Array<{
    type: VerificationType;
    status: VerificationStatus;
  }>;
  conditions: Array<{
    title: string;
    status: ConditionStatus;
  }>;
};

type WorkflowEvaluation = {
  nextStage: ApplicationStage;
  reason: string;
};

const requiredVerificationTypes: VerificationType[] = [
  "CREDIT_PULL",
  "DOCUMENT_CHECK",
  "EMPLOYMENT_CHECK",
];

export function reconcileWorkflow(snapshot: WorkflowSnapshot): WorkflowEvaluation {
  if (snapshot.decisionOutcome === "DECLINED" || snapshot.deniedAt) {
    return {
      nextStage: "DENIED",
      reason: "Application declined by underwriting decision.",
    };
  }

  if (snapshot.servicingHandedOffAt) {
    return {
      nextStage: "SERVICING_HANDOFF",
      reason: "Disbursed loan package transferred to servicing.",
    };
  }

  if (snapshot.disbursedAt) {
    return {
      nextStage: "DISBURSEMENT",
      reason: "Loan has been funded and is awaiting servicing transfer.",
    };
  }

  if (!snapshot.intakeCompletedAt) {
    return {
      nextStage: "INTAKE",
      reason: "Borrower intake package is still being prepared.",
    };
  }

  const verificationByType = new Map(
    snapshot.verifications.map((verification) => [verification.type, verification.status]),
  );

  const failedVerification = snapshot.verifications.find(
    (verification) => verification.status === "FAILED",
  );

  if (
    failedVerification ||
    requiredVerificationTypes.some((type) => !verificationByType.has(type)) ||
    requiredVerificationTypes.some((type) => verificationByType.get(type) !== "PASSED")
  ) {
    return {
      nextStage: "VERIFICATION",
      reason: failedVerification
        ? `${failedVerification.type} returned a failed result and needs manual review.`
        : "Required third-party verification results are still outstanding.",
    };
  }

  if (snapshot.decisionOutcome === "PENDING" || snapshot.decisionOutcome === "REFER") {
    return {
      nextStage: "CREDIT_DECISIONING",
      reason:
        snapshot.decisionOutcome === "REFER"
          ? "Underwriter referred the file for additional decisioning."
          : "Verification is complete and the file is ready for credit decisioning.",
    };
  }

  const failedCondition = snapshot.conditions.find((condition) => condition.status === "FAILED");
  if (failedCondition) {
    return {
      nextStage: "CONDITIONS",
      reason: `${failedCondition.title} failed after approval and rolled the file back into conditions.`,
    };
  }

  const unresolvedConditions = snapshot.conditions.filter(
    (condition) => condition.status === "OPEN",
  );

  if (unresolvedConditions.length > 0) {
    return {
      nextStage: "CONDITIONS",
      reason: "Approved file still has open closing conditions.",
    };
  }

  if (snapshot.decisionOutcome === "APPROVED" || snapshot.approvedAt) {
    return {
      nextStage: "APPROVED",
      reason: "All required checks and conditions are complete for approval.",
    };
  }

  return {
    nextStage: snapshot.currentStage,
    reason: "Workflow state unchanged.",
  };
}

export function assertCanSubmitApplication(currentStage: ApplicationStage) {
  if (currentStage !== "INTAKE") {
    throw new Error("Only intake-stage applications can be submitted.");
  }
}

export function assertCanDisburse(evaluation: WorkflowEvaluation) {
  if (evaluation.nextStage !== "APPROVED") {
    throw new Error("Application must be in APPROVED state before disbursement.");
  }
}

// SENIOR NOTE: This module must stay pure. Once it starts fetching from the database or reading
// request objects, it becomes impossible to test stale-event and rollback scenarios reliably.
