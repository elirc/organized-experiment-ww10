/**
 * What this file does: Switches the current cookie-backed demo session to the selected user.
 * What calls it: `src/components/common/session-switcher.tsx`.
 * What it calls: `src/lib/validation/session-schemas.ts` and `src/services/session-service.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Doing the user lookup in the component and writing the cookie manually in the browser.
 */
import { createRouteHandler } from "@/lib/http/route-handler";
import { loginSchema } from "@/lib/validation/session-schemas";
import { sessionService } from "@/services/session-service";

export const POST = createRouteHandler({
  allowAnonymous: true,
  async handler({ request }) {
    const body = loginSchema.parse(await request.json());
    const result = await sessionService.createLoginCookie(body.userId);

    return new Response(
      JSON.stringify({
        session: result.user,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": result.cookie,
        },
      },
    );
  },
});
