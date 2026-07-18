/**
 * What this file does: Adds an underwriting condition to the application workflow.
 * What calls it: `src/components/applications/application-detail-client.tsx`.
 * What it calls: `src/lib/validation/workflow-schemas.ts` and the command service.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Treating conditions as UI-only checklist items instead of workflow inputs that can block
 * approval and disbursement.
 */
import { createRouteHandler } from "@/lib/http/route-handler";
import { createConditionSchema } from "@/lib/validation/workflow-schemas";
import { applicationCommandService } from "@/services/application-command-service";

export const POST = createRouteHandler<{ applicationId: string }>({
  permission: "application:manage-conditions",
  async handler({ context, request, session }) {
    const { applicationId } = await context.params;
    const body = createConditionSchema.parse(await request.json());

    const application = await applicationCommandService.createCondition(
      session!,
      applicationId,
      body,
    );

    return Response.json({
      application,
    });
  },
});
