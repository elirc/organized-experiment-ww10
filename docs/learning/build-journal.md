# Build Journal

## Stage 1 — Architecture and stack
Built: Chose Next.js, TypeScript, PostgreSQL, Prisma, Tailwind, Zod, React Query, and REST routes.
Decision: Used Prisma instead of Drizzle because the domain has dense relational modeling, transaction-heavy workflow commands, and a teaching goal around readable schema-first design.
Why: The hard problem is lifecycle correctness, not SQL fluency.

## Stage 2 — Domain schema
Built: `prisma/schema.prisma`, `prisma.config.ts`, `.env`, `.env.example`, and `prisma/seed.ts`.
Decision: Added `VerificationRequest.providerSequence`, `ExternalWorkflowEvent`, `ApplicationTransition`, and `AuditLog`.
Why: Out-of-order provider results and rollback traces need first-class persistence.

## Stage 3 — Auth and permissions
Built: `src/lib/auth/session.ts`, `src/lib/auth/permissions.ts`, `src/lib/http/route-handler.ts`, and `src/services/session-service.ts`.
Decision: Used signed cookie sessions with a seeded-role switcher instead of building full credential auth.
Why: The project needed explicit session and RBAC boundaries from day one, but the learning focus is backend workflow architecture rather than password flows.

## Stage 4 — Service and repository boundaries
Built: `src/repositories/application-repository.ts`, `src/repositories/user-repository.ts`, `src/services/application-query-service.ts`, `src/services/application-command-service.ts`, and `src/services/workflow-reconciliation-service.ts`.
Decision: Split reads from writes and kept the workflow reconciler pure.
Why: That makes the state machine testable and keeps query shapes separate from lifecycle commands.

## Stage 5 — REST APIs and operational UI
Built: Route handlers under `src/app/api/**`, hooks under `src/hooks/*`, and the dashboard/detail screens under `src/components/**`.
Decision: Used React Query hooks as the browser-side data boundary instead of direct fetch calls in components.
Why: That keeps cache invalidation and endpoint contracts visible and reusable.

## Stage 6 — Verification, testing, and docs
Built: `tests/*.test.ts`, `vitest.config.ts`, and the architecture/learning docs under `docs/`.
Decision: Wrote small tests around the narrowest load-bearing seams rather than broad integration tests first.
Why: Those seams catch the most dangerous regressions fastest: permissions, validation, invalid transitions, and isolation.

## Major Decisions

### Decision: State machine modeling
Why this matters: The hardest part of the product is keeping application stage correct when async provider results arrive out of order or when conditions fail after approval.
Options:
- Single mutable `stage` enum with imperative updates in each route. Fast to ship, but brittle and hard to audit.
- Full event sourcing. Powerful, but too heavy for this project scope and teaching goal.
- External workflow engine. Operationally strong, but introduces platform complexity before the domain is stable.
- Pure reconciliation service plus persisted transition and external-event history. Strong balance of correctness, debuggability, and code readability.
Choice: Pure reconciliation service plus persisted history.
Why this won: `src/services/workflow-reconciliation-service.ts` stays pure while `src/services/application-command-service.ts` persists transitions and async events.
Junior vs. mid vs. senior:
- Junior sees a clean state helper.
- Mid notices why recomputing from the aggregate beats trusting event order.
- Senior notices this design keeps later queue/webhook migration possible without rewriting the domain rules.

### Decision: Multi-tenancy
Why this matters: Tenant boundaries are expensive to retrofit if they are ignored completely, but equally expensive to overbuild when the product is not actually multi-tenant yet.
Options:
- Full tenant-aware schema now. Strong future isolation, but adds noise to every repository query immediately.
- No tenancy and no seam. Fastest now, but painful later.
- No tenancy now, but explicit repository/auth seams for future tenant scoping.
Choice: No tenancy now, but explicit seams.
Why this won: `src/repositories/application-repository.ts` already centralizes query scope, so `tenantId` can be added later without rewriting React or route code.
Junior vs. mid vs. senior:
- Junior sees fewer columns.
- Mid notices the repository seam as the future insertion point.
- Senior notices that overbuilding tenancy too early would obscure the actual workflow problem.

## PR Slices

### Slice 1 — Persistence and workflow schema
Purpose in one sentence: Establish the relational model and seed data needed for the workflow domain.
Novel logic files:
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `prisma.config.ts`
Reviewer focus:
- `prisma/schema.prisma`: verify `VerificationRequest.providerSequence`, `ExternalWorkflowEvent`, and `ApplicationTransition` exist and match the async workflow design.
- `prisma/seed.ts`: verify seeded data exercises conditions, approvals, and provider artifacts.
- `prisma.config.ts`: verify Prisma 7 datasource configuration is externalized correctly.
Stronger reviewer flag: A reviewer should question whether ownership and audit fields are sufficient before approving the schema.

### Slice 2 — Auth, RBAC, and request boundary
Purpose in one sentence: Build the explicit session and permission boundary every route depends on.
Novel logic files:
- `src/lib/auth/session.ts`
- `src/lib/auth/permissions.ts`
- `src/lib/http/route-handler.ts`
- `src/services/session-service.ts`
Reviewer focus:
- `src/lib/auth/session.ts`: verify the cookie is signed and verified instead of trusting raw user IDs.
- `src/lib/auth/permissions.ts`: verify borrower and servicing access are scoped correctly.
- `src/lib/http/route-handler.ts`: verify auth and validation errors return consistent statuses.
Stronger reviewer flag: A reviewer should question any permission model that stops at roles and ignores record ownership.

### Slice 3 — Domain services and repositories
Purpose in one sentence: Implement the service/repository split and the state reconciliation logic.
Novel logic files:
- `src/repositories/application-repository.ts`
- `src/services/workflow-reconciliation-service.ts`
- `src/services/application-command-service.ts`
- `src/services/application-query-service.ts`
Reviewer focus:
- `src/repositories/application-repository.ts`: verify `buildApplicationVisibilityWhere()` is used by read paths.
- `src/services/workflow-reconciliation-service.ts`: verify failed conditions and missing verifications drive the correct stage.
- `src/services/application-command-service.ts`: verify workflow mutations run inside transactions and always reconcile afterward.
Stronger reviewer flag: A reviewer should flag any direct stage mutation that bypasses reconciliation.

### Slice 4 — REST APIs and UI surface
Purpose in one sentence: Expose the workflow through thin APIs, hooks, and operator screens.
Novel logic files:
- `src/app/api/applications/route.ts`
- `src/app/api/applications/[applicationId]/external-events/route.ts`
- `src/hooks/use-application-detail.ts`
- `src/components/dashboard/dashboard-client.tsx`
- `src/components/applications/application-detail-client.tsx`
Reviewer focus:
- `src/app/api/applications/[applicationId]/external-events/route.ts`: verify the route stays thin and uses validation plus the command service.
- `src/hooks/use-application-detail.ts`: verify each mutation invalidates the right queries.
- `src/components/applications/application-detail-client.tsx`: verify the UI maps to explicit commands instead of hiding workflow meaning.
Stronger reviewer flag: A reviewer should question any UI path that implies a capability the backend does not actually permit.

### Slice 5 — Tests and code-anchored docs
Purpose in one sentence: Lock down the highest-risk invariants and document how to read the codebase.
Novel logic files:
- `tests/auth-permissions.test.ts`
- `tests/workflow-transition.test.ts`
- `docs/architecture/request-lifecycle.md`
- `docs/learning/flow-traces.md`
- `docs/learning/testing-rationale.md`
Reviewer focus:
- `tests/auth-permissions.test.ts`: verify the protected-route rejection is asserted at the shared wrapper layer.
- `tests/workflow-transition.test.ts`: verify the invalid transition test is checking a real business invariant.
- `docs/learning/flow-traces.md`: verify each flow names real files and functions in order.
Stronger reviewer flag: A reviewer should push back on docs that describe architecture abstractly without proving the path through actual files.
