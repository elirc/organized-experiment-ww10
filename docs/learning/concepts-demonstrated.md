# Concepts Demonstrated

## Service layer
Where to look: `src/services/application-command-service.ts` — `createApplication()`, `recordDecision()`, and `resolveCondition()` own business rules instead of the route files.
Also see: `src/services/application-query-service.ts` for the read-side counterpart.
Risk if wrong: Business logic leaks into routes and React components, making behavior inconsistent and hard to review.

## Repository pattern
Where to look: `src/repositories/application-repository.ts` — `findVisibleDetailByPublicId()` and `buildApplicationVisibilityWhere()` own Prisma query shape.
Also see: `src/repositories/user-repository.ts` for the identity-side version of the same boundary.
Risk if wrong: Query duplication leads to data leaks and subtle divergence between endpoints.

## Zod validation boundary
Where to look: `src/lib/validation/workflow-schemas.ts` — `externalEventSchema`, `decisionSchema`, and `resolveConditionSchema`.
Also see: `src/lib/validation/application-schemas.ts` for create and submit requests.
Risk if wrong: Malformed requests reach services and fail late, often after side effects started.

## Auth/session flow
Where to look: `src/lib/auth/session.ts` — `encodeSessionCookieValue()` signs the cookie and `getSessionFromRequest()` resolves it.
Also see: `src/services/session-service.ts` for demo-session creation and payload shaping.
Risk if wrong: Cookie tampering or stale user lookups can produce broken or impersonated sessions.

## Role-based access control
Where to look: `src/lib/auth/permissions.ts` — `rolePermissions` and `assertPermission()`.
Also see: `src/lib/http/route-handler.ts` where `createRouteHandler()` actually applies the permission before route code runs.
Risk if wrong: Borrowers could trigger privileged underwriting or funding actions.

## Status and state transitions
Where to look: `src/services/workflow-reconciliation-service.ts` — `reconcileWorkflow()` determines the canonical stage.
Also see: `src/services/application-command-service.ts` — `reconcileAndPersistStage()` records the resulting transition in the database.
Risk if wrong: The application stage can drift away from its real business state, especially when async events arrive out of order.

## Audit logging
Where to look: `src/services/application-command-service.ts` — `createLifecycleAuditLog()` writes `AuditLog` records from every write-side command.
Also see: `prisma/schema.prisma` for the `AuditLog` model itself.
Risk if wrong: Operators lose traceability for who changed a file or why a transition happened.

## Background or async workflow design
Where to look: `src/services/application-command-service.ts` — `ingestExternalVerificationEvent()` handles provider callbacks and sequencing.
Also see: `prisma/schema.prisma` for `ExternalWorkflowEvent` and `VerificationRequest.providerSequence`.
Risk if wrong: Stale provider results can overwrite newer outcomes and move the workflow backward incorrectly.

## Data isolation without multi-tenancy
Where to look: `src/repositories/application-repository.ts` — `buildApplicationVisibilityWhere()` scopes borrower and servicing reads.
Also see: `tests/data-isolation.test.ts` for the regression test around the borrower visibility predicate.
Risk if wrong: One user's query can expose another user's application.

## React Query as UI data boundary
Where to look: `src/hooks/use-application-detail.ts` — each mutation is a named workflow command with cache invalidation.
Also see: `src/components/providers/query-provider.tsx` for the shared query client setup.
Risk if wrong: UI state becomes stale and developers start bypassing the API contract with ad hoc fetch calls.
