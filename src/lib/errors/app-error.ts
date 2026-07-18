/**
 * What this file does: Defines the shared application error type and helpers used by routes,
 * services, and auth guards to fail with explicit HTTP statuses.
 * What calls it: Route wrappers in `src/lib/http/route-handler.ts`, permission checks in
 * `src/lib/auth/permissions.ts`, and domain services in `src/services/*`.
 * What it calls: No downstream modules; this is a leaf utility.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Throwing raw `Error` objects from business logic, which loses the status code and makes
 * authorization, validation, and not-found failures indistinguishable at the API boundary.
 */
export class AppError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function notFound(message: string) {
  return new AppError(404, message);
}

export function forbidden(message: string) {
  return new AppError(403, message);
}

export function unauthorized(message = "A valid session is required.") {
  return new AppError(401, message);
}

export function badRequest(message: string, details?: unknown) {
  return new AppError(400, message, details);
}
