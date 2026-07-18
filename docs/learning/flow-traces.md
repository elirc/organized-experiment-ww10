# Flow Traces

## Flow: Borrower creates a new application
1. `src/components/dashboard/create-application-form.tsx` — submit button calls `useCreateApplicationMutation()`
2. `src/hooks/use-applications.ts` — `useCreateApplicationMutation()` fires `POST /api/applications`
3. `src/app/api/applications/route.ts` — `POST` route handler
4. `src/lib/http/route-handler.ts` — `createRouteHandler()` loads the session and enforces `application:create`
5. `src/lib/validation/application-schemas.ts` — `createApplicationSchema.parse()`
6. `src/services/application-command-service.ts` — `createApplication()`, builds nested parties and audit log
7. `src/repositories/application-repository.ts` — `createApplication()`
8. Returns `{ application }`

## Flow: Borrower is rejected from underwriter decision route
1. `src/components/applications/application-detail-client.tsx` — if the borrower somehow tried the decision action, the client would call `useDecisionMutation()`
2. `src/hooks/use-application-detail.ts` — `useDecisionMutation()` fires `POST /api/applications/[applicationId]/decision`
3. `src/app/api/applications/[applicationId]/decision/route.ts` — route entry point
4. `src/lib/http/route-handler.ts` — `createRouteHandler()` calls `assertPermission()`
5. `src/lib/auth/permissions.ts` — `assertPermission()` rejects `BORROWER` for `application:record-decision`
6. Returns `403` with `{ error }`

## Flow: Async external event lands out of order
1. `src/components/applications/application-detail-client.tsx` — “Simulate async result” button calls `useExternalEventMutation()`
2. `src/hooks/use-application-detail.ts` — `useExternalEventMutation()` fires `POST /api/applications/[applicationId]/external-events`
3. `src/app/api/applications/[applicationId]/external-events/route.ts` — route handler
4. `src/lib/http/route-handler.ts` — `createRouteHandler()` enforces `application:manage-verifications`
5. `src/lib/validation/workflow-schemas.ts` — `externalEventSchema.parse()`
6. `src/services/application-command-service.ts` — `ingestExternalVerificationEvent()` compares `providerSequence` to the stored request
7. `src/repositories/application-repository.ts` — `createExternalEvent()` and `updateVerificationRequest()`
8. `src/services/workflow-reconciliation-service.ts` — `reconcileWorkflow()` recomputes the stage
9. Returns `{ application }`

## Flow: Failed condition rolls an approved file back into conditions
1. `src/components/applications/application-detail-client.tsx` — resolve button calls `useResolveConditionMutation()`
2. `src/hooks/use-application-detail.ts` — `useResolveConditionMutation()` fires `POST /api/conditions/[conditionId]/resolve`
3. `src/app/api/conditions/[conditionId]/resolve/route.ts` — route handler
4. `src/lib/http/route-handler.ts` — `createRouteHandler()` enforces `application:manage-conditions`
5. `src/lib/validation/workflow-schemas.ts` — `resolveConditionSchema.parse()`
6. `src/services/application-command-service.ts` — `resolveCondition()` updates the condition and then calls `reconcileAndPersistStage()`
7. `src/services/workflow-reconciliation-service.ts` — `reconcileWorkflow()` returns `CONDITIONS` because a condition is now `FAILED`
8. `src/repositories/application-repository.ts` — `updateCondition()`, `createAuditLog()`, and `createTransition()`
9. Returns `{ application }`

## Flow: Operations disburses an approved application
1. `src/components/applications/application-detail-client.tsx` — “Disburse” button calls `useDisburseMutation()`
2. `src/hooks/use-application-detail.ts` — `useDisburseMutation()` fires `POST /api/applications/[applicationId]/disburse`
3. `src/app/api/applications/[applicationId]/disburse/route.ts` — route handler
4. `src/lib/http/route-handler.ts` — `createRouteHandler()` enforces `application:disburse`
5. `src/services/application-command-service.ts` — `disburseApplication()` calls `assertCanDisburse()` on the reconciled state
6. `src/services/workflow-reconciliation-service.ts` — `assertCanDisburse()` requires `APPROVED`
7. `src/repositories/application-repository.ts` — workflow aggregate reads, audit log write, transition write, and final detail load
8. Returns `{ application }`
