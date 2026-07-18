/**
 * What this file does: Simulates a provider callback that lands an async verification result.
 * What calls it: `src/components/applications/application-detail-client.tsx`.
 * What it calls: Zod validation and the workflow command service.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Trusting the event order and updating the state machine without checking provider sequencing.
 */
import { createRouteHandler } from "@/lib/http/route-handler";
import { externalEventSchema } from "@/lib/validation/workflow-schemas";
import { applicationCommandService } from "@/services/application-command-service";

export const POST = createRouteHandler<{ applicationId: string }>({
  permission: "application:manage-verifications",
  async handler({ context, request, session }) {
    const { applicationId } = await context.params;
    const body = externalEventSchema.parse(await request.json());

    const application = await applicationCommandService.ingestExternalVerificationEvent(
      session!,
      applicationId,
      body,
    );

    return Response.json({
      application,
    });
  },
});
