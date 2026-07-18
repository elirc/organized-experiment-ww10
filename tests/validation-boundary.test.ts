import { describe, expect, test } from "vitest";

import { createApplicationSchema } from "@/lib/validation/application-schemas";

describe("validation boundary", () => {
  test("createApplicationSchema rejects malformed borrower input", () => {
    // This catches the bug where bad client payloads slip past the API boundary and cause
    // repository-level errors or partial writes.
    const result = createApplicationSchema.safeParse({
      productType: "CONVENTIONAL",
      purpose: "short",
      requestedAmount: -1,
      primaryApplicant: {
        firstName: "P",
        lastName: "",
        email: "not-an-email",
        annualIncome: 0,
      },
    });

    expect(result.success).toBe(false);
  });
});
