# Guided Reading Path

Twelve stops, from the request boundary inward and then out to the UI. Each stop ends with a **Check** you can answer with the file open. The two big files are `src/services/application-command-service.ts` (606 lines) and `src/components/applications/application-detail-client.tsx` (543). Everything else is under 300 lines.

Most files open with a "What this file does / What calls it / What it calls / junior mistake" header and end with a `SENIOR NOTE`. Treat both as claims to verify. For example, `src/lib/auth/permissions.ts:4` says query services call it, but `src/services/application-query-service.ts` imports only the `AppSession` type from it (`:12`) and calls none of its functions.

## Step 1: `src/lib/http/route-handler.ts`

**Why read this:** Authentication, authorization, and error translation all happen here, for every route.
**What to look for:** The order inside the returned function (`:71-91`): session, then the 401, then the permission check, then the handler, then the catch. Also the `resolveSession` injection point (`:32`, `:69`), which exists so tests can supply a fake session.
**What to trace:** `getSessionFromRequest` (`src/lib/auth/session.ts:53-80`), `assertPermission` (`src/lib/auth/permissions.ts:60-68`), `isAppError` (`src/lib/errors/app-error.ts:23-25`).
**What a junior would likely miss:** The handler receives `session: AppSession | null`. Every non-anonymous route uses `session!` because the wrapper guarantees a session unless `allowAnonymous` is set. That guarantee is a convention the type system does not enforce.
**Check:** Name the two routes that pass `allowAnonymous: true`, and what each exposes. Answer: `src/app/api/session/route.ts:12` (the user list) and `src/app/api/session/login/route.ts:13` (identity assumption).

## Step 2: `src/lib/auth/session.ts`

**Why read this:** It shows how a user id becomes a trusted identity.
**What to look for:** The HMAC encode and decode (`:23-51`), hand-written cookie parsing (`:54-60`), and the cookie header builders (`:91-98`).
**What to trace:** `userRepository.findById` (`src/repositories/user-repository.ts:20-25`).
**What a junior would likely miss:** The cookie value never changes for a given user and secret. There is no expiry and nothing to revoke.
**Check:** Find what happens with a cookie value containing two dots, like `abc.def.ghi`. Answer: `split(".")` at `:37` takes only the first two parts, `abc` and `def`. The HMAC of `abc` will not equal `def`, so the result is `null`.

## Step 3: `src/lib/auth/permissions.ts`

**Why read this:** It holds the role matrix and the record-level rule.
**What to look for:** `rolePermissions` (`:34-54`), `assertPermission` (`:60-68`), and `canReadApplication` (`:70-93`).
**What to trace:** `route-handler.ts:80`, `application-command-service.ts:73`, `:493`.
**What a junior would likely miss:** `canReadApplication` and the repository's visibility filter are two implementations of one rule, and they disagree for borrowers (`createdById`).
**Check:** List the permissions no route ever declares. Answer: `application:view-pipeline` and `session:assume-demo-user`.

## Step 4: `src/repositories/application-repository.ts`

**Why read this:** It contains the query shapes and the visibility predicate.
**What to look for:** `buildApplicationVisibilityWhere` (`:79-104`), the two include presets (`:25-77`), and which methods take `db: DatabaseClient` (everything from `:125` on).
**What to trace:** Callers in both services.
**What a junior would likely miss:** Only `listVisibleSummaries` and `findVisibleDetailByPublicId` apply the predicate. Every by-id method is unfiltered, and callers must check visibility first.
**Check:** Find the upsert that makes "request verification twice" safe. Answer: `createVerificationRequest` (`:161-182`). On conflict it updates only `providerReference` and `startedAt`, and it keeps the existing status and sequence.

## Step 5: `src/services/workflow-reconciliation-service.ts`

**Why read this:** It is the pure state machine.
**What to look for:** The rule order in `reconcileWorkflow` (`:47-137`) and the two assert helpers (`:139-149`).
**What to trace:** Called only from `application-command-service.ts` (lines 116, 244, 406, 548) and `tests/workflow-transition.test.ts`.
**What a junior would likely miss:** The order **is** the policy. Moving the `DENIED` rule below the `disbursedAt` rule would change what a late decline does to a funded loan.
**Check:** Write down the stage for this snapshot: intake done, all three verifications `PASSED`, `decisionOutcome: "REFER"`, one `FAILED` condition. Answer: `CREDIT_DECISIONING`, because rule 6 (`:97-105`) fires before the condition rules.

## Step 6: `src/services/application-command-service.ts`

**Why read this:** Every write lives here.
**What to look for:** `ensureReadableApplication` (`:62-83`), `reconcileAndPersistStage` (`:104-149`), and the nine commands, especially `ingestExternalVerificationEvent` (`:304-394`) and `recordDecision` (`:396-438`).
**What to trace:** Repository calls, `createLifecycleAuditLog` (`:85-102`), and the reconciler.
**What a junior would likely miss:** Several guards read state **before** `prisma.$transaction` opens: `recordDecision` `:405-410`, `resolveCondition` `:502-508`, `disburseApplication` `:545-551`, `handoffToServicing` `:578`. The transaction protects atomicity of the writes, not the decision to make them.
**Check:** Find the command that does not call `reconcileAndPersistStage`. Answer: `createApplication`.

## Step 7: `src/services/application-query-service.ts`

**Why read this:** It is the read side in 35 lines.
**What to look for:** `listApplications` (`:21-25`) and `getApplicationDetail` (`:27-34`). Both delegate filtering to the repository and shaping to presenters.
**What to trace:** `src/app/api/applications/route.ts:16`, `src/app/api/applications/[applicationId]/route.ts:14`.
**What a junior would likely miss:** Neither read route declares a permission. The repository predicate is the only gate.
**Check:** Say what a servicing agent's list returns right after seeding. Answer: an empty array. `APP-1001` is in `CONDITIONS`.

## Step 8: `src/lib/validation/workflow-schemas.ts`

**Why read this:** It defines the contracts for the risky commands.
**What to look for:** `.exclude(["PENDING"])` on decisions (`:37`), `.exclude(["OPEN"])` on resolutions (`:48`), and `providerSequence: int().min(1)` (`:29`).
**What to trace:** The four workflow routes that parse these schemas.
**What a junior would likely miss:** No cross-field rules. `type` and `eventType` can disagree.
**Check:** Find the schema whose parsed result is thrown away. Answer: `submitApplicationSchema` in `submit/route.ts:16`. The result is not assigned. It works purely as a guard.

## Step 9: `src/app/api/applications/[applicationId]/external-events/route.ts`

**Why read this:** It is a typical thin route at 28 lines.
**What to look for:** The permission is declared in the options object (`:13`), the parse happens inside the handler (`:16`), and the service call passes `session!` (`:18-22`).
**What to trace:** `createRouteHandler`, `externalEventSchema`, `ingestExternalVerificationEvent`.
**What a junior would likely miss:** This is a "provider callback" that only a logged-in loan officer can call. A real integration would need its own authentication (a signature or shared secret), not a user role.
**Check:** Find the `params` handling. Answer: `await context.params` (`:15`). In Next 16, route params arrive as a Promise.

## Step 10: `src/components/dashboard/dashboard-client.tsx`

**Why read this:** It shows the list view and the role switcher.
**What to look for:** `useSessionQuery`, `useApplicationsQuery`, the session switcher, and the unconditional `<CreateApplicationForm>` (`:76`).
**What to trace:** `src/hooks/use-session.ts`, `src/hooks/use-applications.ts`, `src/components/common/session-switcher.tsx:23-48`.
**What a junior would likely miss:** The role switcher is the login system.
**Check:** Find where the switcher gets its user list. Answer: `GET /api/session` returns `demoUsers` (`src/services/session-service.ts:17`).

## Step 11: `src/components/applications/application-detail-client.tsx`

**Why read this:** It maps one button to each workflow command.
**What to look for:** The `can*` flags (`:82-91`) and how each button uses them.
**What to trace:** The hooks in `src/hooks/use-application-detail.ts:133-196`.
**What a junior would likely miss:** The flags are a hand-written copy of the server matrix, and two of them are wrong.
**Check:** Find both mismatches. Answer: `canSubmit` includes `LOAN_OFFICER` (`:84`), and `canManageVerifications` includes `UNDERWRITER` (`:86`).

## Step 12: `prisma/schema.prisma` and `tests/workflow-transition.test.ts`

**Why read this:** The schema shows which invariants the database enforces. The test shows how to test the pure core.
**What to look for:** `@@unique([applicationId, type])` (`schema.prisma:152`), `stateVersion` (`:98`), and the nullable `ApplicationParty.userId` (`:121`). In the test, one snapshot literal plus two assertions (`tests/workflow-transition.test.ts:12-31`).
**What a junior would likely miss:** The test covers one rule out of ten.
**Check:** Write a second snapshot on paper that would catch the "decline after disbursement goes to `DENIED`" behavior. You need `disbursedAt` set and `decisionOutcome: "DECLINED"`, and the expected stage is `DENIED`. Decide whether that is the policy you want.
