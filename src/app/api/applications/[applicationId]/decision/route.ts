/**
 * What this file does: Records the underwriter decision and lets the workflow recompute stage.
 * What calls it: `src/components/applications/application-detail-client.tsx`.
 * What it calls: `src/lib/validation/workflow-schemas.ts` and the command service.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Storing the decision outcome but forgetting to move the application into `DENIED`,
 * `CONDITIONS`, or `APPROVED` based on the full aggregate.
 */
import { createRouteHandler } from "@/lib/http/route-handler";
import { decisionSchema } from "@/lib/validation/workflow-schemas";
import { applicationCommandService } from "@/services/application-command-service";

export const POST = createRouteHandler<{ applicationId: string }>({
  permission: "application:record-decision",
  async handler({ context, request, session }) {
    const { applicationId } = await context.params;
    const body = decisionSchema.parse(await request.json());

    const application = await applicationCommandService.recordDecision(
      session!,
      applicationId,
      body,
    );

    return Response.json({
      application,
    });
  },
});
