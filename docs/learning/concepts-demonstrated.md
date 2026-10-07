# Concepts Demonstrated

For each concept: where it lives, how this code does it, the risk if done badly, where this code falls short, and a **Check**.

## Service layer (command/query split)

**Where to look:** `src/services/application-command-service.ts` (writes) and `src/services/application-query-service.ts` (reads).
**How it works:** Command methods take `(session, publicId, input)` and own the whole unit of work: visibility, guards, transaction, audit, reconcile, present. Query methods only filter and present.
**Risk if wrong:** Business rules leak into routes, and two endpoints enforce the same rule differently.
**Where it falls short:** Some rules still sit in the wrong layer. `submitApplication` re-checks roles (`:239-241`) in a way that contradicts the matrix.
**Check:** Count the commands. Answer: nine, in `applicationCommandService` (`:151-603`).

## Repository pattern with injectable client

**Where to look:** `src/repositories/application-repository.ts`.
**How it works:** Most methods take `db: DatabaseClient` (`PrismaClient | Prisma.TransactionClient`, `:16`), so one function works with or without a transaction. Include presets (`applicationSummaryInclude`, `applicationDetailInclude`, `:25-77`) keep the response shape in one place, and the `satisfies Prisma.LoanApplicationInclude` clause type-checks them.
**Risk if wrong:** Duplicated filters drift, and one endpoint leaks.
**Where it falls short:** Commands still call `tx.loanApplication.update(...)` and `tx.verificationRequest.findUnique/create(...)` directly (`application-command-service.ts:124`, `:250`, `:321-343`, `:413`, `:554`, `:583`), bypassing the repository.
**Check:** List the direct `tx.` Prisma calls in the command service that are not wrapped by a repository method. Search for `tx\.` and exclude the repository calls.

## Zod validation boundary

**Where to look:** `src/lib/validation/workflow-schemas.ts`, `application-schemas.ts`, `session-schemas.ts`.
**How it works:** Handlers call `.parse()`, and a `ZodError` becomes 400 `{ error: "Validation failed.", issues: error.flatten() }` (`src/lib/http/route-handler.ts:36-44`). Enum schemas come straight from Prisma enums (`z.enum(VerificationType)`), so the API and the database cannot drift. `.exclude(...)` narrows enums per command.
**Risk if wrong:** Malformed requests reach transactions and fail late.
**Where it falls short:** No cross-field rules, a free-form party `userId`, and `requestedAmount` has no upper bound beyond the `Decimal(12,2)` column, which overflows into a database error and a 500.
**Check:** Find the request field whose value the UI sends but the server never reads. Answer: `confirmReady`. It is checked by the schema (`application-schemas.ts:30`), but its value is discarded (`submit/route.ts:16`).

## Auth and session flow

**Where to look:** `src/lib/auth/session.ts`.
**How it works:** A stateless signed cookie carries the user id. The user row is re-read on every request, so role changes apply immediately.
**Risk if wrong:** Impersonation.
**Where it falls short:** The login endpoint performs impersonation by design (anonymous `userId` login). Tokens never expire, there is no logout route, and the secret has a public default. See `docs/architecture/auth-and-permissions.md`.
**Check:** Find the helper that would log a user out, and confirm that no route calls it. Answer: `createExpiredSessionCookieHeader` (`session.ts:96-98`).

## Role-based access control

**Where to look:** `src/lib/auth/permissions.ts:34-68`, applied in `route-handler.ts:79-81`.
**How it works:** Each route declares one permission in its options object. The wrapper asserts it before the handler runs.
**Risk if wrong:** Borrowers trigger funding.
**Where it falls short:** The read routes declare nothing, so `application:view-pipeline` is decorative. The UI keeps its own copy of the matrix, and it has drifted.
**Check:** For each of the five roles, list the routes it can call successfully. Compare your list with the button-enable flags at `application-detail-client.tsx:82-91`.

## Status and state transitions (derived state)

**Where to look:** `src/services/workflow-reconciliation-service.ts:47-137` and `reconcileAndPersistStage` (`application-command-service.ts:104-149`).
**How it works:** Stage is a function of facts. After every fact write, the aggregate is reloaded *inside the same transaction*, re-derived, and an `ApplicationTransition` is written only if the stage or reason changed (`:118-121`).
**Risk if wrong:** Stage drifts from reality, and async events reorder history.
**Where it falls short:** The guards that decide whether a command is allowed run before the transaction. Rule order makes post-funding declines possible. There is no optimistic locking.
**Check:** Find what happens to transitions when only the *reason* changes. Answer: a transition row is still written with `fromStage === toStage` (`:118-121`). The decision flow triggers this when it overwrites `stageReason`.

## Audit logging

**Where to look:** `createLifecycleAuditLog` (`application-command-service.ts:85-102`).
**How it works:** Every command writes one `AuditLog` row inside its transaction, with a fixed `entityType: "LoanApplication"` and a free-text `action`.
**Risk if wrong:** No record of who funded a loan.
**Where it falls short:** `action` is an unconstrained string, not an enum. The seed and runtime disagree on `entityId` (public id vs cuid). The external-event audit row names the human who clicked as the actor, even when the event is "from the provider".
**Check:** List all `action` strings written at runtime. Search for `createLifecycleAuditLog(`. You should find nine: `APPLICATION_CREATED`, `APPLICATION_SUBMITTED`, `VERIFICATION_REQUESTED`, `EXTERNAL_EVENT_RECEIVED`, `DECISION_RECORDED`, `CONDITION_CREATED`, `CONDITION_RESOLVED`, `APPLICATION_DISBURSED`, and `SERVICING_HANDOFF` (`application-command-service.ts:226-594`). The seed adds `SERVICING_PREPARED` (`prisma/seed.ts:186`), which no code writes.

## Async workflow design (sequence-guarded events)

**Where to look:** `ingestExternalVerificationEvent` (`application-command-service.ts:304-394`).
**How it works:** Each verification type keeps a `providerSequence` high-water mark. Older events are stored with `appliedToWorkflow: false` and `receivedOutOfOrder: true`. Newer or equal events overwrite the verification.
**Risk if wrong:** A stale `FAILED` overwrites a newer `PASSED` and un-approves a loan.
**Where it falls short:**
- Equal sequences re-apply.
- There is no row lock, so concurrent events race.
- There is no idempotency key.
- The "provider" is a logged-in loan officer, not an authenticated integration.
**Check:** Find the line where an equal sequence is treated as fresh. Answer: `:347` (`>=`).

## Data isolation without multi-tenancy

**Where to look:** `buildApplicationVisibilityWhere` (`src/repositories/application-repository.ts:79-104`).
**How it works:** Borrowers are limited by party link, servicing agents by stage, and everyone else sees everything.
**Risk if wrong:** Borrower A sees Borrower B's income.
**Where it falls short:** The check exists in two forms that disagree. Party `userId` is caller-controlled at creation.
**Check:** Explain how a borrower could give a second borrower access to an application. Answer: set `coApplicant.userId` to the second borrower's id (`application-schemas.ts:18`, `application-command-service.ts:210`). Ids are discoverable from `GET /api/session`.

## React Query as the UI data boundary

**Where to look:** `src/hooks/use-application-detail.ts`.
**How it works:** There is one named hook per command, and `useWorkflowMutation` (`:103-123`) centralizes POST plus invalidation.
**Risk if wrong:** Stale screens after a write.
**Where it falls short:** It refetches even though the response already contains the new detail. It also invalidates a `["condition", id]` key that no query defines (`:181`).
**Check:** Find the query keys that are actually defined. Search for `queryKey:` in `src/hooks/`. `useApplicationDetailQuery` (`:125-131`) and `useApplicationsQuery` define the two application keys that the workflow mutations invalidate.
