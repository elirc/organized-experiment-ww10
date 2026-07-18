/**
 * What this file does: Returns the current session plus the available demo users for switching.
 * What calls it: `src/hooks/use-session.ts`.
 * What it calls: `src/lib/http/route-handler.ts` and `src/services/session-service.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Coupling the UI directly to auth storage details instead of giving it a stable session payload.
 */
import { createRouteHandler } from "@/lib/http/route-handler";
import { sessionService } from "@/services/session-service";

export const GET = createRouteHandler({
  allowAnonymous: true,
  async handler({ session }) {
    const payload = await sessionService.buildSessionEnvelope(session?.user.id ?? null);

    return Response.json(payload);
  },
});
