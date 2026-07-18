import { describe, expect, test } from "vitest";

import {
  assertCanDisburse,
  reconcileWorkflow,
} from "@/services/workflow-reconciliation-service";

describe("workflow transition safety", () => {
  test("application cannot disburse while an approval condition is still open", () => {
    // This catches the exact class of workflow regression where operations can fund a file that
    // was approved subject to conditions but not actually cleared to close.
    const evaluation = reconcileWorkflow({
      currentStage: "CONDITIONS",
      decisionOutcome: "APPROVED",
      intakeCompletedAt: new Date(),
      approvedAt: new Date(),
      deniedAt: null,
      disbursedAt: null,
      servicingHandedOffAt: null,
      verifications: [
        { type: "CREDIT_PULL", status: "PASSED" },
        { type: "DOCUMENT_CHECK", status: "PASSED" },
        { type: "EMPLOYMENT_CHECK", status: "PASSED" },
      ],
      conditions: [{ title: "Collect paystub", status: "OPEN" }],
    });

    expect(evaluation.nextStage).toBe("CONDITIONS");
    expect(() => assertCanDisburse(evaluation)).toThrow(
      "Application must be in APPROVED state before disbursement.",
    );
  });
});
