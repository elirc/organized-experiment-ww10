/**
 * What this file does: Releases an approved loan into disbursement.
 * What calls it: `src/components/applications/application-detail-client.tsx`.
 * What it calls: `src/services/application-command-service.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Skipping the approval/conditions guard and letting operations disburse a loan that is not clear.
 */
import { createRouteHandler } from "@/lib/http/route-handler";
import { applicationCommandService } from "@/services/application-command-service";

export const POST = createRouteHandler<{ applicationId: string }>({
  permission: "application:disburse",
  async handler({ context, session }) {
    const { applicationId } = await context.params;
    const application = await applicationCommandService.disburseApplication(
      session!,
      applicationId,
    );

    return Response.json({
      application,
    });
  },
});
