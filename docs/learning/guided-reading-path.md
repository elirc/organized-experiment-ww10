# Guided Reading Path

## Step 1 — src/lib/http/route-handler.ts
**Why read this:** It is the narrowest API boundary and shows how auth, permissions, and error translation are centralized.
**What to look for:** `createRouteHandler()` loading the session, checking permissions, and converting exceptions into JSON responses.
**What to trace:** Called by `src/app/api/applications/route.ts` and every other route file; it calls `src/lib/auth/session.ts` and `src/lib/auth/permissions.ts`.
**What a junior would likely miss:** The route wrapper is part of the security model, not just convenience plumbing.

## Step 2 — src/lib/auth/permissions.ts
**Why read this:** This file is the explicit RBAC matrix plus the record-level access helper.
**What to look for:** `rolePermissions`, `assertPermission()`, and `canReadApplication()`.
**What to trace:** Called from `src/lib/http/route-handler.ts` and `src/services/application-command-service.ts`; it calls `src/lib/errors/app-error.ts`.
**What a junior would likely miss:** Role checks alone are not enough; borrower ownership still matters after the route passes.

## Step 3 — src/repositories/application-repository.ts
**Why read this:** It contains the actual Prisma query shapes and the borrower/servicing visibility filter.
**What to look for:** `buildApplicationVisibilityWhere()`, `findVisibleDetailByPublicId()`, and `findWorkflowAggregateById()`.
**What to trace:** Called by both application services; it calls `src/lib/db/prisma.ts`.
**What a junior would likely miss:** The visibility filter is load-bearing. One missing predicate here becomes a data leak.

## Step 4 — src/services/workflow-reconciliation-service.ts
**Why read this:** This is the pure state-machine core.
**What to look for:** `reconcileWorkflow()` and how it prefers full aggregate recomputation over trusting event order.
**What to trace:** Called by `src/services/application-command-service.ts`; it calls no I/O code.
**What a junior would likely miss:** The value here is purity. Mixing database calls into this file would make the hard workflow cases much harder to test.

## Step 5 — src/services/application-command-service.ts
**Why read this:** Most of the business logic lives here.
**What to look for:** `ensureReadableApplication()`, `reconcileAndPersistStage()`, and workflow commands like `ingestExternalVerificationEvent()` and `resolveCondition()`.
**What to trace:** Called by mutation routes in `src/app/api/applications/**` and `src/app/api/conditions/**`; it calls repositories, presenters, and the workflow reconciler.
**What a junior would likely miss:** The transaction boundary is not optional because transitions, audit logs, and workflow state must commit together.

## Step 6 — src/services/application-query-service.ts
**Why read this:** It shows the read side separated cleanly from write-side workflow logic.
**What to look for:** `listApplications()` and `getApplicationDetail()`.
**What to trace:** Called by `src/app/api/applications/route.ts` and `src/app/api/applications/[applicationId]/route.ts`; it calls repository read methods and presenters.
**What a junior would likely miss:** Keeping reads out of the command service reduces accidental coupling between dashboard views and workflow mutations.

## Step 7 — src/lib/validation/workflow-schemas.ts
**Why read this:** It is the API validation boundary for the complicated workflow actions.
**What to look for:** `externalEventSchema`, `decisionSchema`, and `resolveConditionSchema`.
**What to trace:** Called by the workflow route files; it calls `zod`.
**What a junior would likely miss:** Async provider events need the same rigor as human input.

## Step 8 — src/app/api/applications/[applicationId]/external-events/route.ts
**Why read this:** It is the cleanest example of the route layer staying small while the service layer does the real work.
**What to look for:** Body parsing, permission enforcement through the wrapper, and the handoff to `ingestExternalVerificationEvent()`.
**What to trace:** Calls `src/lib/http/route-handler.ts`, `src/lib/validation/workflow-schemas.ts`, and `src/services/application-command-service.ts`.
**What a junior would likely miss:** Thin routes are a discipline, not a default outcome.

## Step 9 — src/components/dashboard/dashboard-client.tsx
**Why read this:** It shows how the operational UI consumes the API without embedding business logic.
**What to look for:** The dashboard queries, role-aware messaging, and the link from list view to detail view.
**What to trace:** Calls `src/hooks/use-session.ts`, `src/hooks/use-applications.ts`, and child components under `src/components/dashboard/`.
**What a junior would likely miss:** Role-based UX should reflect backend permissions, not replace them.

## Step 10 — src/components/applications/application-detail-client.tsx
**Why read this:** This is the best end-user map of the workflow surface area.
**What to look for:** Separate controls for submit, verification request, external event simulation, decisioning, conditions, disbursement, and servicing hand-off.
**What to trace:** Calls `src/hooks/use-application-detail.ts` and `src/hooks/use-session.ts`; those hooks call the REST routes.
**What a junior would likely miss:** Each button represents a distinct workflow command, not a generic update.

## Step 11 — prisma/schema.prisma
**Why read this:** It encodes the persistence model that the workflow and permissions layer depends on.
**What to look for:** `LoanApplication`, `VerificationRequest`, `ExternalWorkflowEvent`, `ApplicationTransition`, and `AuditLog`.
**What to trace:** Used by `src/lib/db/prisma.ts`, repositories, and `prisma/seed.ts`.
**What a junior would likely miss:** Fields like `providerSequence` and `ApplicationParty.userId` exist because of workflow correctness and ownership, not because Prisma needed extra columns.

## Step 12 — tests/workflow-transition.test.ts
**Why read this:** It shows how to test a workflow invariant without booting the full app.
**What to look for:** `reconcileWorkflow()` producing `CONDITIONS` and `assertCanDisburse()` rejecting the invalid transition.
**What to trace:** Calls `src/services/workflow-reconciliation-service.ts`.
**What a junior would likely miss:** Good tests usually target the pure decision point, not the biggest possible integration path first.
