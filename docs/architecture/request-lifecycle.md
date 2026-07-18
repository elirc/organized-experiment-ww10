# Request Lifecycle

Request: Borrower creates a new application
1. `src/app/api/applications/route.ts` — `POST` calls `createApplicationSchema.parse()` and forwards the validated payload.
2. `src/lib/http/route-handler.ts` — `createRouteHandler()` loads the session and enforces `application:create`.
3. `src/lib/validation/application-schemas.ts` — `createApplicationSchema` rejects malformed applicant, purpose, and amount fields.
4. `src/services/application-command-service.ts` — `createApplication()` builds the application, primary party, optional co-applicant, and audit log in one transaction.
5. `src/repositories/application-repository.ts` — `createApplication()` issues the Prisma create with nested parties.
6. Returns `201` with `{ application }`

Request: Underwriter records a decision after verification completes
1. `src/app/api/applications/[applicationId]/decision/route.ts` — `POST` parses `decisionSchema`.
2. `src/lib/http/route-handler.ts` — `createRouteHandler()` verifies the session and enforces `application:record-decision`.
3. `src/lib/validation/workflow-schemas.ts` — `decisionSchema.parse()` validates the decision outcome and reason.
4. `src/services/application-command-service.ts` — `recordDecision()` loads the application, checks the verification-derived workflow state, writes the decision, then calls `reconcileAndPersistStage()`.
5. `src/services/workflow-reconciliation-service.ts` — `reconcileWorkflow()` determines whether the file belongs in `DENIED`, `CONDITIONS`, or `APPROVED`.
6. `src/repositories/application-repository.ts` — `findWorkflowAggregateByPublicId()`, `createAuditLog()`, and `createTransition()` perform the backing queries.
7. Returns `200` with `{ application }`

Request: Async document result arrives out of order
1. `src/app/api/applications/[applicationId]/external-events/route.ts` — `POST` parses `externalEventSchema`.
2. `src/lib/http/route-handler.ts` — `createRouteHandler()` enforces `application:manage-verifications`.
3. `src/lib/validation/workflow-schemas.ts` — `externalEventSchema.parse()` validates provider status, sequence, timestamp, and payload shape.
4. `src/services/application-command-service.ts` — `ingestExternalVerificationEvent()` compares `providerSequence` with the stored `VerificationRequest.providerSequence`, records the event, and only applies it if it is not stale.
5. `src/repositories/application-repository.ts` — `createExternalEvent()` persists the event while `updateVerificationRequest()` updates the active verification row when appropriate.
6. `src/services/workflow-reconciliation-service.ts` — `reconcileWorkflow()` recalculates the canonical stage from the full aggregate after the event lands.
7. Returns `200` with `{ application }`

Request: Borrower tries to call an underwriter-only endpoint
1. `src/app/api/applications/[applicationId]/decision/route.ts` — `POST` enters the shared route wrapper.
2. `src/lib/http/route-handler.ts` — `createRouteHandler()` loads the borrower session and calls `assertPermission()` with `application:record-decision`.
3. `src/lib/auth/permissions.ts` — `assertPermission()` rejects the role because `BORROWER` does not have that permission in `rolePermissions`.
4. Returns `403` with `{ error }`
