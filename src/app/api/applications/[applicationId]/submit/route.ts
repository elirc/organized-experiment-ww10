/**
 * What this file does: Moves an intake-stage application into submission and verification.
 * What calls it: `src/components/applications/application-detail-client.tsx`.
 * What it calls: `src/services/application-command-service.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Letting the UI set the stage directly instead of routing the action through a workflow command.
 */
import { createRouteHandler } from "@/lib/http/route-handler";
import { submitApplicationSchema } from "@/lib/validation/application-schemas";
import { applicationCommandService } from "@/services/application-command-service";

export const POST = createRouteHandler<{ applicationId: string }>({
  permission: "application:submit",
  async handler({ context, request, session }) {
    const { applicationId } = await context.params;
    submitApplicationSchema.parse(await request.json());

    const application = await applicationCommandService.submitApplication(
      session!,
      applicationId,
    );

    return Response.json({
      application,
    });
  },
});
