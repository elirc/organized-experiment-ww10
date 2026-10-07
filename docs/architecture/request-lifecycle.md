# Request Lifecycle

Four requests traced from handler to database. All routes are built with `createRouteHandler()` (`src/lib/http/route-handler.ts:66-92`). It runs in this fixed order:

1. resolve the session from the cookie (`:73`);
2. return 401 if there is no session and the route is not anonymous (`:75-77`);
3. return 403 if a declared permission is missing (`:79-81`);
4. run the handler, which is where Zod parsing happens;
5. convert errors in `errorResponse()` (`:35-64`).

Earlier versions of this doc listed Zod parsing before the permission check. The code does the opposite.

---

## Request 1: A borrower creates a new application

`POST /api/applications` with `{ productType, purpose, requestedAmount, primaryApplicant, coApplicant? }`

1. `src/app/api/applications/route.ts:24-37`. The wrapper enforces `application:create` (`:25`), which `BORROWER` and `LOAN_OFFICER` have.
2. `route.ts:27` runs `createApplicationSchema.parse()` (`src/lib/validation/application-schemas.ts:21-27`). `purpose` must be 10-140 characters and `requestedAmount` positive. Each party needs first and last names of at least 2 characters, a valid email, a positive `annualIncome`, and may include an optional `userId` (`:13-19`).
3. `applicationCommandService.createApplication()` (`src/services/application-command-service.ts:152-234`). Inside `prisma.$transaction`:
   - `applicationRepository.createApplication()` (`src/repositories/application-repository.ts:154-159`) runs a nested create with:
     - `publicId: createApplicationPublicId()` (`APP-####`, `src/lib/utils/public-id.ts:11-13`);
     - `Decimal` amounts;
     - `createdBy` set to the caller;
     - `assignedOfficer` set to the caller only if the caller is a `LOAN_OFFICER` (`:186-193`);
     - the primary party's `userId` taken from the body, falling back to the caller only if the caller is a `BORROWER` (`:198-200`);
     - an optional co-applicant party.
   - `createLifecycleAuditLog("APPLICATION_CREATED")` (`:222-228`).
   - **No** `reconcileAndPersistStage` call. The application keeps the schema default `stage: INTAKE` (`prisma/schema.prisma:95`), and no `ApplicationTransition` row is written for creation.
4. `presentApplicationDetail(created)` returns **201** `{ application }` (`route.ts:30-35`).

Failure modes: a `publicId` collision (P2002) or a `userId` that does not exist (foreign key error) is not an `AppError`, so it becomes **500** "Internal server error."

---

## Request 2: An underwriter records a decision after verification completes

`POST /api/applications/:publicId/decision` with `{ outcome: "APPROVED" | "REFER" | "DECLINED", reason }`

1. `src/app/api/applications/[applicationId]/decision/route.ts:13-29`. The wrapper enforces `application:record-decision` (`:14`), which only `UNDERWRITER` has.
2. `decisionSchema.parse` (`:17`; `src/lib/validation/workflow-schemas.ts:36-39`). `.exclude(["PENDING"])` stops a caller from resetting the outcome to pending. `reason` must be 10-280 characters.
3. `recordDecision()` (`src/services/application-command-service.ts:396-438`):
   - `ensureReadableApplication` (`:404`) runs the visibility filter and then `canReadApplication`;
   - it loads the aggregate **outside** the transaction (`:405`) and reconciles it (`:406`);
   - it throws **400** "All required verification checks must pass before decisioning." only when the reconciled stage is `VERIFICATION` (`:408-410`).
4. Transaction (`:412-435`):
   - updates `decisionOutcome`. `approvedAt` is set only for `APPROVED` and `deniedAt` only for `DECLINED`, and **both are nulled otherwise** (`:417-418`). `stageReason` is set to the request's reason;
   - writes the audit log `DECISION_RECORDED` with `metadata.reason`;
   - runs `reconcileAndPersistStage`. With all verifications passed and no conditions, `APPROVED` reconciles to `APPROVED` (rule 9), `REFER` to `CREDIT_DECISIONING` (rule 6), and `DECLINED` to `DENIED` (rule 1).
5. The response is **200** `{ application }`.

What the guard misses: see `docs/architecture/domain-model.md`. Decisions are accepted at `INTAKE`, and a `DECLINED` decision on a funded loan moves it to `DENIED`. Re-deciding is also unrestricted. `APPROVED` then `DECLINED` then `APPROVED` flips the stage each time, because each decision clears the other timestamp (`:417-418`).

---

## Request 3: An async provider result arrives out of order

`POST /api/applications/:publicId/external-events` with `{ type, eventType, status, providerSequence, providerReference?, summary, occurredAt, payload }`

1. `src/app/api/applications/[applicationId]/external-events/route.ts:12-28`. The wrapper enforces `application:manage-verifications` (`:13`), which only `LOAN_OFFICER` has. This endpoint is called by a logged-in human (the "Simulate async result" button), not by a provider. It has no webhook signature or provider credential.
2. `externalEventSchema.parse` (`:16`; `workflow-schemas.ts:25-34`). `providerSequence` must be an integer of at least 1, `summary` 8-200 characters, and `occurredAt` an ISO datetime. `payload` is any record and defaults to `{}`.
3. `ingestExternalVerificationEvent()` (`application-command-service.ts:304-394`). Inside the transaction:
   - It finds the `VerificationRequest` by `(applicationId, type)` (`:321-328`). If there is none, it **creates** one using this event's status and sequence (`:330-344`). An event can therefore arrive before any verification was requested.
   - It sets `isOutOfOrder = incoming < stored` and `shouldApply = incoming >= stored` (`:346-347`).
   - It always inserts an `ExternalWorkflowEvent` with those two flags (`:349-360`).
   - If `shouldApply`, it updates the verification's status, sequence, summary, and payload (`:362-371`).
   - It writes the audit log `EXTERNAL_EVENT_RECEIVED` with `{ outOfOrder, providerSequence }` (`:373-383`).
   - It calls `reconcileAndPersistStage(..., shouldApply ? null : session.user.id)` (`:385-390`). When the event was applied, any transition is recorded as `triggeredBySystem: true` with no user (`:140-141`).
4. The response is **200** `{ application }`.

Worked example. The stored `CREDIT_PULL` has sequence 2 and status `PASSED`. An event arrives with sequence 1 and status `FAILED`. Then `isOutOfOrder = true` and `shouldApply = false`. The event is stored for audit, the verification is untouched, and the reconcile changes nothing.

Gaps:
- **Equal sequences re-apply** (`>=`, `:347`). A replayed or duplicate event with the same sequence and a *different* status overwrites the verification. There is no idempotency key.
- **Concurrent events race.** The `findUnique` at `:321` takes no row lock. Two events (sequence 3 and 4) processed at once can both read sequence 2, both apply, and the later commit wins, even if it carries sequence 3.
- **Mismatched types are accepted.** `type` and `eventType` are not cross-checked (`workflow-schemas.ts:26-27`). The UI maps them with `eventTypeMap` (`src/components/applications/application-detail-client.tsx:249`), but the API does not.

---

## Request 4: A borrower calls an underwriter-only endpoint

`POST /api/applications/APP-1001/decision` as Priya

1. `decision/route.ts:13-14`: the wrapper.
2. `route-handler.ts:73`: the session resolves to `role: "BORROWER"`.
3. `route-handler.ts:79-81`, then `assertPermission` (`src/lib/auth/permissions.ts:60-68`). `BORROWER`'s list (`:35`) lacks `application:record-decision`, so it throws `forbidden("Role BORROWER cannot perform application:record-decision.")`.
4. `errorResponse` (`route-handler.ts:46-54`) returns **403** `{ error: "Role BORROWER cannot perform application:record-decision.", details: undefined }`. `Response.json` drops the `undefined` `details` key.

The handler never runs, so the body is never parsed. `tests/auth-permissions.test.ts` proves exactly this path with an injected session.

---

## Exercises

1. **Goal:** Find the one command that writes no transition even though it creates a row.
   **Check:** `createApplication` (`application-command-service.ts:152-234`) has no `reconcileAndPersistStage` call. The seed's first transition, "INTAKE to VERIFICATION" (`prisma/seed.ts:155-160`), exists only because the seed wrote it by hand.
2. **Goal:** Show that an out-of-order event still produces a visible record.
   **Check:** `createExternalEvent` (`:349-360`) runs before the `if (shouldApply)` branch. The detail UI renders "Out of order" from `receivedOutOfOrder` (`application-detail-client.tsx:442`).
3. **Goal:** Explain the 400 vs 500 split for bad input.
   **Check:** A `ZodError` maps to 400 at `route-handler.ts:36-44`. A malformed JSON body throws `SyntaxError` from `request.json()`, which falls through to the 500 branch at `:56-63`.
