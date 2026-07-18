/**
 * What this file does: Provides read-side application use cases and hides repository details
 * from routes and UI-facing API handlers.
 * What calls it: `src/app/api/applications/route.ts` and
 * `src/app/api/applications/[applicationId]/route.ts`.
 * What it calls: `src/repositories/application-repository.ts` and
 * `src/lib/presenters/application-presenters.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Returning Prisma models directly from routes, which ties the API contract to the database
 * schema and makes later refactors far more painful than they need to be.
 */
import type { AppSession } from "@/lib/auth/permissions";
import { notFound } from "@/lib/errors/app-error";
import {
  presentApplicationDetail,
  presentApplicationSummary,
} from "@/lib/presenters/application-presenters";
import { applicationRepository } from "@/repositories/application-repository";

export const applicationQueryService = {
  async listApplications(session: AppSession) {
    const applications = await applicationRepository.listVisibleSummaries(session);

    return applications.map(presentApplicationSummary);
  },

  async getApplicationDetail(session: AppSession, publicId: string) {
    const application = await applicationRepository.findVisibleDetailByPublicId(session, publicId);
    if (!application) {
      throw notFound("Application not found.");
    }

    return presentApplicationDetail(application);
  },
};
