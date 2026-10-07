# Architecture Overview

LedgerFlow Lending models one loan-origination pipeline. Every write follows the same path:

```
route (createRouteHandler: session -> permission) -> Zod parse -> command service
  -> ensureReadableApplication (visibility) -> prisma.$transaction(
       fact write -> audit log -> reconcileAndPersistStage (pure reconciler + transition row)
     ) -> presenter -> JSON
```

Reads follow `route -> query service -> repository (visibility filter) -> presenter`.

The design choice that matters most: **commands write facts, never stages.** Commands set timestamps such as `intakeCompletedAt`, `approvedAt`, and `disbursedAt`, plus `decisionOutcome`, verification rows, and condition rows. `reconcileWorkflow()` (`src/services/workflow-reconciliation-service.ts:47-137`) then derives `stage` from those facts. Find the stage write in the command service: it exists in exactly one place, `reconcileAndPersistStage()` (`src/services/application-command-service.ts:124-133`).

## Top-level layers

- **`src/app/api/`** has twelve route files exporting thirteen handlers (the README lists them). Each is 18-37 lines. None contains business logic.
- **`src/app/` pages**: `/` (`src/app/page.tsx` renders the dashboard) and `/applications/[applicationId]` (`src/app/applications/[applicationId]/page.tsx`).
- **`src/lib/`**:
  - `http/route-handler.ts`: the request wrapper. It loads the session, enforces the permission, and translates errors. It is the only error-to-HTTP mapping in the app (`:35-64`).
  - `auth/session.ts`: HMAC cookie encode and decode, plus user lookup.
  - `auth/permissions.ts`: the role matrix and `canReadApplication()`.
  - `validation/*.ts`: three Zod files.
  - `db/prisma.ts`: a singleton `PrismaClient` over a `pg` `Pool`, cached on `globalThis` outside production.
  - `presenters/application-presenters.ts`: shapes Prisma rows into JSON, for example `Decimal` to string (`:24-26`).
  - `utils/public-id.ts`: generates `APP-####` ids.
  - `errors/app-error.ts`: the `AppError(status, message)` class and its helpers.
- **`src/services/`**:
  - `application-command-service.ts` (606 lines): every write.
  - `application-query-service.ts` (35 lines): list and detail.
  - `workflow-reconciliation-service.ts` (152 lines): pure stage logic.
  - `session-service.ts`: demo login and the session envelope.
- **`src/repositories/`**: `application-repository.ts` (all application queries plus the visibility predicate) and `user-repository.ts`. Every application repository method except the two visibility-filtered reads takes a `db: DatabaseClient` first argument (`application-repository.ts:16`), so the same method works inside a transaction.
- **`src/hooks/` and `src/components/`**: React Query hooks wrap every endpoint. `src/components/applications/application-detail-client.tsx` (543 lines) is the workflow console.
- **`prisma/`**: `schema.prisma` (8 models, 9 enums) and `seed.ts`. `prisma.config.ts` at the root configures the Prisma 7 CLI.

## Walkthrough: one command end to end

`POST /api/conditions/:conditionId/resolve` with `{ status: "FAILED", resolutionNote }` on an approved file:

1. `src/app/api/conditions/[conditionId]/resolve/route.ts:12-28`. `createRouteHandler` (`src/lib/http/route-handler.ts:71-91`) resolves the session from the cookie (`:73`), returns 401 if it is missing (`:75-77`), and calls `assertPermission(session, "application:manage-conditions")` (`:79-81`). Only then does the handler run `resolveConditionSchema.parse` (`resolve/route.ts:16`). The permission check happens before parsing, so a borrower gets 403 even for a malformed body.
2. `applicationCommandService.resolveCondition()` (`src/services/application-command-service.ts:475-541`):
   - loads the condition and its application **without** the visibility filter (`findConditionById`, `:483`);
   - re-checks visibility with `canReadApplication` (`:488-500`);
   - refuses a `FAILED` result on funded files (`:502-508`).
3. Transaction (`:510-538`):
   - `updateCondition` sets the status, `resolvedAt`, and `resolvedBy`;
   - `createLifecycleAuditLog("CONDITION_RESOLVED")`;
   - `reconcileAndPersistStage()` (`:104-149`) loads the aggregate, builds a snapshot (`buildWorkflowSnapshot`, `:36-60`), and calls `reconcileWorkflow`. The `FAILED` condition hits `:107-113` and returns `CONDITIONS`. Because the stage changed, it updates `stage`, `stageReason`, and `stateVersion + 1` (`:124-133`), then writes an `ApplicationTransition` (`:135-145`).
4. `presentApplicationDetail()` shapes the reloaded detail (`loadApplicationDetailById`, `src/repositories/application-repository.ts:147-152`), and the route returns `{ application }` with status 200.

## Why the layers matter, and where they leak

- **The wrapper centralizes authN and authZ.** A route cannot forget the session check unless it opts in with `allowAnonymous`. Only the two session routes do.
- **The reconciler is pure.** It imports only types from `@prisma/client` (`workflow-reconciliation-service.ts:10-16`), so `tests/workflow-transition.test.ts` can exercise it with plain objects.
- **Leak 1: validation outside the reconciler.** Some stage guards live in the command service and read the *stored* stage, not a reconciled one. Examples: `handoffToServicing` checks `visibleApplication.stage !== "DISBURSEMENT"` (`application-command-service.ts:578`), and `resolveCondition` checks `condition.application.stage` (`:504-505`). Both values were read before the transaction opened.
- **Leak 2: visibility is implemented twice.** The repository filter (`buildApplicationVisibilityWhere`) and `canReadApplication()` (`src/lib/auth/permissions.ts:70-93`) disagree for borrowers. The repository requires a party link. The helper also accepts `createdById`. See `docs/architecture/auth-and-permissions.md`.
- **Leak 3: the client has its own permission rules.** `application-detail-client.tsx:82-91` enables Submit for `LOAN_OFFICER` and verification controls for `UNDERWRITER`. The server matrix grants neither (`permissions.ts:35-46`), so those buttons always produce 403.

## Exercises

1. **Goal:** Prove that no command writes `stage` directly.
   **Check:** Search `src/` for `stage:` inside `update` calls. The only hit in `application-command-service.ts` is `:127`, inside `reconcileAndPersistStage`. The seed sets `stage: "CONDITIONS"` directly (`prisma/seed.ts:77`), which is the one sanctioned bypass.
2. **Goal:** Find every handler that skips the permission check, and say why each is safe or not.
   **Check:** Look for `createRouteHandler({` calls with no `permission:`. You should find `GET /api/session`, `POST /api/session/login`, `GET /api/applications`, and `GET /api/applications/:id`. The two GETs rely on the visibility filter. The session routes are the auth hole described in `auth-and-permissions.md`.
3. **Goal:** Trace how a `Decimal` amount reaches the browser.
   **Check:** `createApplication` wraps the number in `new Prisma.Decimal(...)` (`application-command-service.ts:179`). The column is `@db.Decimal(12, 2)` (`prisma/schema.prisma:94`). `serializeAmount` turns it into a string (`application-presenters.ts:24-26`). The client receives `"425000"`, not a number.
