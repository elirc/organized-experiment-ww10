/**
 * What this file does: Signs and verifies the cookie-backed session token, then resolves it to
 * a database-backed `AppSession`.
 * What calls it: `src/lib/http/route-handler.ts`, `src/services/session-service.ts`,
 * and the login/session API routes.
 * What it calls: `src/repositories/user-repository.ts` and Node's `crypto`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Trusting the user ID directly from a cookie without any signature check, which turns session
 * impersonation into a copy-paste exercise.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type { AppSession } from "@/lib/auth/permissions";
import { unauthorized } from "@/lib/errors/app-error";
import { userRepository } from "@/repositories/user-repository";

export const SESSION_COOKIE_NAME = "ww10_session";

function getSessionSecret() {
  return process.env.APP_SESSION_SECRET ?? "dev-only-demo-secret";
}

function createSignature(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

export function encodeSessionCookieValue(userId: string) {
  const signature = createSignature(userId);
  return `${userId}.${signature}`;
}

export function decodeSessionCookieValue(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  const [userId, signature] = rawValue.split(".");
  if (!userId || !signature) {
    return null;
  }

  const expected = createSignature(userId);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  return userId;
}

export async function getSessionFromRequest(request: Request): Promise<AppSession | null> {
  const cookieHeader = request.headers.get("cookie");
  const sessionCookie = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));

  const rawValue = sessionCookie?.split("=")[1];
  const userId = decodeSessionCookieValue(rawValue);

  if (!userId) {
    return null;
  }

  const user = await userRepository.findById(userId);
  if (!user) {
    return null;
  }

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
  };
}

export async function requireSession(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    throw unauthorized();
  }

  return session;
}

export function createSessionCookieHeader(userId: string) {
  const value = encodeSessionCookieValue(userId);
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax`;
}

export function createExpiredSessionCookieHeader() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// SENIOR NOTE: Session parsing should stay tiny and boring. If this file starts containing
// role logic or database-side access rules, the auth boundary becomes much harder to audit.
