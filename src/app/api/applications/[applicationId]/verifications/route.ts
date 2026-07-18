/**
 * What this file does: Creates or updates the internal verification request for an application.
 * What calls it: `src/components/applications/application-detail-client.tsx`.
 * What it calls: `src/lib/validation/workflow-schemas.ts` and the command service.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Combining internal request creation and provider result ingestion into one opaque route.
 */
import { createRouteHandler } from "@/lib/http/route-handler";
import { requestVerificationSchema } from "@/lib/validation/workflow-schemas";
import { applicationCommandService } from "@/services/application-command-service";

export const POST = createRouteHandler<{ applicationId: string }>({
  permission: "application:manage-verifications",
  async handler({ context, request, session }) {
    const { applicationId } = await context.params;
    const body = requestVerificationSchema.parse(await request.json());

    const application = await applicationCommandService.requestVerification(
      session!,
      applicationId,
      body,
    );

    return Response.json({
      application,
    });
  },
});
