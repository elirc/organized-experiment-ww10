/**
 * What this file does: Wraps route handlers with consistent session loading, permission checks,
 * and error translation so the API layer stays thin.
 * What calls it: Every route under `src/app/api/`.
 * What it calls: `src/lib/auth/session.ts`, `src/lib/auth/permissions.ts`, and
 * `src/lib/errors/app-error.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Repeating `try/catch`, session parsing, and role checks in every route file until half the
 * endpoints drift into inconsistent status codes and error shapes.
 */
import { ZodError } from "zod";

import type { AppSession, Permission } from "@/lib/auth/permissions";
import { assertPermission } from "@/lib/auth/permissions";
import { getSessionFromRequest } from "@/lib/auth/session";
import { AppError, isAppError } from "@/lib/errors/app-error";

export type AppRouteContext<TParams extends Record<string, string> = Record<string, string>> = {
  params: Promise<TParams>;
};

type RouteHandlerArgs<TParams extends Record<string, string>> = {
  request: Request;
  context: AppRouteContext<TParams>;
  session: AppSession | null;
};

type CreateRouteHandlerOptions<TParams extends Record<string, string>> = {
  permission?: Permission;
  allowAnonymous?: boolean;
  handler: (args: RouteHandlerArgs<TParams>) => Promise<Response>;
  resolveSession?: (request: Request) => Promise<AppSession | null>;
};

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: "Validation failed.",
        issues: error.flatten(),
      },
      { status: 400 },
    );
  }

  if (isAppError(error)) {
    return Response.json(
      {
        error: error.message,
        details: error.details,
      },
      { status: error.status },
    );
  }

  console.error(error);

  return Response.json(
    {
      error: "Internal server error.",
    },
    { status: 500 },
  );
}

export function createRouteHandler<TParams extends Record<string, string> = Record<string, string>>(
  options: CreateRouteHandlerOptions<TParams>,
) {
  const resolveSession = options.resolveSession ?? getSessionFromRequest;

  return async (request: Request, context: AppRouteContext<TParams>) => {
    try {
      const session = await resolveSession(request);

      if (!options.allowAnonymous && !session) {
        throw new AppError(401, "A valid session is required.");
      }

      if (options.permission) {
        assertPermission(session, options.permission);
      }

      return await options.handler({
        request,
        context,
        session,
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

// SENIOR NOTE: Tests hit this wrapper directly because it's the narrowest place where we can
// prove an endpoint rejects unauthorized callers with the correct status code.
