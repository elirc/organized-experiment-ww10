import { describe, expect, test } from "vitest";

import { buildApplicationVisibilityWhere } from "@/repositories/application-repository";

describe("data isolation", () => {
  test("borrower visibility filter scopes reads to linked application parties", () => {
    // This catches the production leak where a borrower query forgets its ownership predicate and
    // starts listing unrelated applications from the pipeline.
    const where = buildApplicationVisibilityWhere({
      user: {
        id: "borrower-123",
        fullName: "Priya Borrower",
        email: "borrower@example.com",
        role: "BORROWER",
      },
    });

    expect(where).toEqual({
      parties: {
        some: {
          userId: "borrower-123",
        },
      },
    });
  });
});
