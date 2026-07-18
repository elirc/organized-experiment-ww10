/**
 * What this file does: Resolves or fails an underwriting condition.
 * What calls it: `src/components/applications/application-detail-client.tsx`.
 * What it calls: `src/lib/validation/workflow-schemas.ts` and the command service.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Updating only the condition row and forgetting the application might need to roll back stages.
 */
import { createRouteHandler } from "@/lib/http/route-handler";
import { resolveConditionSchema } from "@/lib/validation/workflow-schemas";
import { applicationCommandService } from "@/services/application-command-service";

export const POST = createRouteHandler<{ conditionId: string }>({
  permission: "application:manage-conditions",
  async handler({ context, request, session }) {
    const { conditionId } = await context.params;
    const body = resolveConditionSchema.parse(await request.json());

    const application = await applicationCommandService.resolveCondition(
      session!,
      conditionId,
      body,
    );

    return Response.json({
      application,
    });
  },
});
