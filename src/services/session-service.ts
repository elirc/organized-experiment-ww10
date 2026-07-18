/**
 * What this file does: Handles demo login selection and session payload assembly for the UI.
 * What calls it: Session API routes.
 * What it calls: `src/repositories/user-repository.ts` and `src/lib/auth/session.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Returning raw database rows from the auth endpoint instead of shaping a clear session payload
 * that the UI can depend on without knowing persistence details.
 */
import { createSessionCookieHeader } from "@/lib/auth/session";
import { notFound } from "@/lib/errors/app-error";
import { userRepository } from "@/repositories/user-repository";

export const sessionService = {
  async buildSessionEnvelope(sessionUserId: string | null) {
    const [currentUser, demoUsers] = await Promise.all([
      sessionUserId ? userRepository.findById(sessionUserId) : Promise.resolve(null),
      userRepository.listDemoUsers(),
    ]);

    return {
      session: currentUser,
      demoUsers,
    };
  },

  async createLoginCookie(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw notFound("Requested demo user was not found.");
    }

    return {
      user,
      cookie: createSessionCookieHeader(user.id),
    };
  },
};
