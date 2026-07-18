/**
 * What this file does: Returns a single application detail view scoped by the current session.
 * What calls it: `src/hooks/use-application-detail.ts`.
 * What it calls: `src/services/application-query-service.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Loading by ID without the visibility scope, which would let borrowers enumerate other files.
 */
import { createRouteHandler } from "@/lib/http/route-handler";
import { applicationQueryService } from "@/services/application-query-service";

export const GET = createRouteHandler<{ applicationId: string }>({
  async handler({ context, session }) {
    const { applicationId } = await context.params;
    const application = await applicationQueryService.getApplicationDetail(session!, applicationId);

    return Response.json({
      application,
    });
  },
});
