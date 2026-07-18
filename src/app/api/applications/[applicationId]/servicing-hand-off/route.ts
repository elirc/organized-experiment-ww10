/**
 * What this file does: Transfers a disbursed file into the servicing queue.
 * What calls it: `src/components/applications/application-detail-client.tsx`.
 * What it calls: `src/services/application-command-service.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Letting servicing hand-off happen before disbursement, which breaks the pipeline order.
 */
import { createRouteHandler } from "@/lib/http/route-handler";
import { applicationCommandService } from "@/services/application-command-service";

export const POST = createRouteHandler<{ applicationId: string }>({
  permission: "application:handoff-servicing",
  async handler({ context, session }) {
    const { applicationId } = await context.params;
    const application = await applicationCommandService.handoffToServicing(
      session!,
      applicationId,
    );

    return Response.json({
      application,
    });
  },
});
