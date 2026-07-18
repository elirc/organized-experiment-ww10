/**
 * What this file does: Lists visible applications for the current session and creates new ones.
 * What calls it: `src/hooks/use-applications.ts`.
 * What it calls: Query and command services plus the shared route wrapper.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Reusing a single route for reads and writes but letting both branches grow their own business
 * logic until the file becomes the accidental service layer.
 */
import { createRouteHandler } from "@/lib/http/route-handler";
import { createApplicationSchema } from "@/lib/validation/application-schemas";
import { applicationCommandService } from "@/services/application-command-service";
import { applicationQueryService } from "@/services/application-query-service";

export const GET = createRouteHandler({
  async handler({ session }) {
    const applications = await applicationQueryService.listApplications(session!);

    return Response.json({
      applications,
    });
  },
});

export const POST = createRouteHandler({
  permission: "application:create",
  async handler({ request, session }) {
    const body = createApplicationSchema.parse(await request.json());
    const application = await applicationCommandService.createApplication(session!, body);

    return Response.json(
      {
        application,
      },
      { status: 201 },
    );
  },
});
