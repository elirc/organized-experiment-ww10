import { describe, expect, test } from "vitest";

import { createRouteHandler } from "@/lib/http/route-handler";

describe("auth and permission enforcement", () => {
  test("borrower cannot call an underwriter-protected endpoint", async () => {
    // This catches the production bug class where a route forgets to enforce its permission
    // boundary and accidentally exposes an underwriting action to borrowers.
    const handler = createRouteHandler({
      permission: "application:record-decision",
      resolveSession: async () => ({
        user: {
          id: "user-1",
          fullName: "Priya Borrower",
          email: "borrower@example.com",
          role: "BORROWER",
        },
      }),
      async handler() {
        return Response.json({ ok: true });
      },
    });

    const response = await handler(new Request("http://localhost/api/test"), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("BORROWER"),
    });
  });
});
