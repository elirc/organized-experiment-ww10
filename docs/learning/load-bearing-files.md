# Load-Bearing Files

These are the files where a small mistake becomes a security hole or a wrong loan state rather than a visible bug. Each entry lists callers (verified by import search), what breaks, a likely junior mistake, and one current weakness with a line reference.

## `src/lib/http/route-handler.ts` (95 lines)

- **What it does:** It wraps every route in one sequence: session, 401, permission, handler, error mapping.
- **What calls it:** All twelve files under `src/app/api/`, and `tests/auth-permissions.test.ts`.
- **What it calls:** `getSessionFromRequest`, `assertPermission`, `isAppError`, and `ZodError` from `zod`.
- **What breaks if wrong:** If `permission` were checked after the handler, or skipped when `allowAnonymous` is set, the matrix would stop protecting anything.
- **Likely junior mistake:** Re-implementing try/catch per route, so error shapes drift. Here `ZodError` returns `{ error, issues }` and `AppError` returns `{ error, details }` (`:36-54`). Those are two different keys for "details" that the client has to know about.
- **Current weakness:** Prisma errors (unique or foreign-key violations) fall through to a generic 500 (`:56-63`). A duplicate `publicId` and a bad party `userId` look identical to a crash.

## `src/lib/auth/session.ts` (101 lines)

- **What it does:** It signs and verifies `userId.hmac` cookies and resolves the user.
- **What calls it:** `route-handler.ts:15`, `session-service.ts:9`.
- **What it calls:** `node:crypto`, `userRepository`.
- **What breaks if wrong:** A missing HMAC check makes any user id a valid cookie. A non-constant-time compare leaks signature bytes through timing.
- **Likely junior mistake:** Comparing signatures with `===`. This file uses `timingSafeEqual` correctly, with a length guard (`:43-46`).
- **Current weakness:** It falls back to a hard-coded secret (`:20`), and the token never expires (`:27-30`, `:91-94`).

## `src/lib/auth/permissions.ts` (96 lines)

- **What it does:** It holds the role matrix and `canReadApplication`.
- **What calls it:** `route-handler.ts`, `application-command-service.ts`, and, for the `AppSession` type only, `session.ts`, `application-repository.ts`, and `application-query-service.ts`.
- **What it calls:** `forbidden`, `unauthorized`.
- **What breaks if wrong:** Borrowers could reach underwriting or funding actions, or see other borrowers' files through a command.
- **Likely junior mistake:** Treating ownership as a UI concern.
- **Current weakness:** `canReadApplication` (`:78-83`) and the repository predicate disagree on `createdById`, and `session:assume-demo-user` is never enforced.

## `src/repositories/application-repository.ts` (250 lines)

- **What it does:** It runs every application query and holds the visibility predicate.
- **What calls it:** `application-command-service.ts`, `application-query-service.ts`, `tests/data-isolation.test.ts`.
- **What it calls:** `src/lib/db/prisma.ts`.
- **What breaks if wrong:** If `buildApplicationVisibilityWhere` returned `{}` for borrowers, every borrower would see every application, in both the list and the detail view.
- **Likely junior mistake:** Copy-pasting the borrower filter into a new endpoint instead of calling the function.
- **Current weakness:** The by-id methods (`findWorkflowAggregateById`, `findConditionById`, `updateCondition`, and others) are unfiltered by design. `resolveCondition` relies on remembering to call `canReadApplication` afterwards (`application-command-service.ts:488-500`). A new command that forgets this has no safety net.

## `src/services/workflow-reconciliation-service.ts` (152 lines)

- **What it does:** It maps facts to a stage through an ordered rule list.
- **What calls it:** `application-command-service.ts`, `tests/workflow-transition.test.ts`.
- **What it calls:** Nothing. It is pure.
- **What breaks if wrong:** Every stage in the system. A reordered rule silently changes policy for every application at its next write.
- **Likely junior mistake:** Setting `stage` inside each command.
- **Current weakness:** `DENIED` outranks funding (`:48-53` before `:55-67`), and the guard in `recordDecision` does not prevent post-funding declines. Whether "declined after funding" is valid policy is not stated anywhere.

## `src/services/application-command-service.ts` (606 lines)

- **What it does:** It implements nine write commands, each in its own transaction with an audit log and a reconcile.
- **What calls it:** Ten of the thirteen handlers. The three that do not are the two session routes and `GET /api/applications/:id`.
- **What it calls:** The repository, presenters, the reconciler, `createApplicationPublicId`, and `prisma.$transaction`.
- **What breaks if wrong:** If a write and its transition or audit log committed separately, history would diverge from state.
- **Likely junior mistake:** Writing the fact and the transition in separate `await`s outside a transaction.
- **Current weaknesses:**
  - Guard reads happen before the transaction (see the guided reading path, step 6).
  - `stateVersion` is never compared.
  - External events with equal sequences re-apply (`:347`).

## `src/lib/validation/workflow-schemas.ts` (50 lines)

- **What it does:** It defines the contracts for verification, event, decision, and condition requests.
- **What calls it:** The verifications, external-events, decision, conditions, and resolve routes.
- **What it calls:** `zod` and Prisma enums.
- **What breaks if wrong:** If `PENDING` were allowed on decisions, a caller could reset a decided file back to `CREDIT_DECISIONING` (rule 6).
- **Current weakness:** No cross-field check between `type` and `eventType`.

## `src/components/applications/application-detail-client.tsx` (543 lines)

- **What it does:** It renders one control per command and the timelines (transitions, events, audit log).
- **What calls it:** `src/app/applications/[applicationId]/page.tsx`.
- **What it calls:** The hooks in `use-application-detail.ts` and `use-session.ts`.
- **What breaks if wrong:** Nothing security-relevant, because the server re-checks. But wrong `can*` flags (`:82-91`) produce buttons that always 403.
- **Current weakness:** It has a duplicated, already-drifted permission matrix.

## `prisma/schema.prisma` (223 lines)

- **What it does:** It defines 8 models, 9 enums, one composite unique, and indexes.
- **What calls it:** `prisma generate` (output consumed through `@prisma/client`), `db push`, and the seed.
- **What breaks if wrong:** Dropping `@@unique([applicationId, type])` would break the `upsert` in `createVerificationRequest`, because Prisma needs a unique `where`, and it would allow duplicate verification rows that the reconciler's `Map` (`workflow-reconciliation-service.ts:76-78`) would silently collapse.
- **Likely junior mistake:** Omitting `providerSequence` or `ApplicationParty.userId` because they look optional.

## Exercises

1. **Goal:** Rank these files by blast radius if a single line were deleted.
   **Check:** Compare deleting `route-handler.ts:79-81` (every permission is gone), `application-repository.ts:82-91` (borrower isolation is gone), and `workflow-reconciliation-service.ts:107-113` (failed conditions no longer roll back). Name the HTTP requests that would change behavior in each case.
2. **Goal:** Verify the "what calls it" lists.
   **Check:** Search `src/` and `tests/` for each module path (for example `@/lib/auth/permissions`), and compare the results with the file headers. The header of `permissions.ts` lists "query services". Confirm that `application-query-service.ts` imports only the `AppSession` type from it.
