# Load-Bearing Files

## src/lib/http/route-handler.ts
- What it does: Enforces session loading, permissions, and API error shape.
- What calls it: Every route file under `src/app/api/`.
- What it calls: `src/lib/auth/session.ts` and `src/lib/auth/permissions.ts`.
- What would break or become insecure if this file were wrong: Protected endpoints could start returning inconsistent statuses or skip role checks entirely.
- What a junior engineer would likely miswrite here: A wrapper that checks auth but forgets to preserve validation errors cleanly.

## src/lib/auth/permissions.ts
- What it does: Defines the RBAC matrix and record-level readability rules.
- What calls it: `src/lib/http/route-handler.ts` and `src/services/application-command-service.ts`.
- What it calls: `src/lib/errors/app-error.ts`.
- What would break or become insecure if this file were wrong: Borrowers could see other borrowers' files or trigger privileged actions.
- What a junior engineer would likely miswrite here: Treating ownership as a UI concern instead of an authorization concern.

## src/repositories/application-repository.ts
- What it does: Centralizes application queries, includes, and access-scoped filters.
- What calls it: Both application services.
- What it calls: `src/lib/db/prisma.ts`.
- What would break or become insecure if this file were wrong: Data isolation, aggregate loading, and timeline/audit hydration would all drift or leak.
- What a junior engineer would likely miswrite here: Copy-pasting query filters instead of keeping one shared visibility function.

## src/services/workflow-reconciliation-service.ts
- What it does: Computes the canonical lifecycle stage from the aggregate.
- What calls it: `src/services/application-command-service.ts` and tests.
- What it calls: Nothing external; this is intentionally pure.
- What would break or become insecure if this file were wrong: Out-of-order provider events or failed conditions could move the application into the wrong stage.
- What a junior engineer would likely miswrite here: Updating the stage in each command separately and never reconciling from the full aggregate.

## src/services/application-command-service.ts
- What it does: Owns write-side workflow behavior and transaction boundaries.
- What calls it: Mutation routes like `src/app/api/applications/[applicationId]/decision/route.ts`.
- What it calls: Repositories, presenters, and `src/services/workflow-reconciliation-service.ts`.
- What would break or become insecure if this file were wrong: Stage changes, audit logs, and async event ingestion would become inconsistent.
- What a junior engineer would likely miswrite here: Performing a write and a transition log in separate commits.

## src/lib/validation/workflow-schemas.ts
- What it does: Defines the request contracts for the highest-risk workflow commands.
- What calls it: Workflow route handlers.
- What it calls: `zod`.
- What would break or become insecure if this file were wrong: Malformed external events or invalid condition updates could reach business logic.
- What a junior engineer would likely miswrite here: Assuming internal tools do not need validation.

## src/components/applications/application-detail-client.tsx
- What it does: Exposes the workflow surface area in the UI without embedding backend rules.
- What calls it: `src/app/applications/[applicationId]/page.tsx`.
- What it calls: Session and detail hooks plus shared components.
- What would break or become insecure if this file were wrong: The UX could suggest unsupported actions or hide important workflow state, even if the backend still blocks bad requests.
- What a junior engineer would likely miswrite here: One generic “save application” interaction instead of explicit commands.

## prisma/schema.prisma
- What it does: Defines the relational storage model and enums that shape the whole application.
- What calls it: Prisma client generation, repositories, and `prisma/seed.ts`.
- What it calls: Prisma generator and datasource config.
- What would break or become insecure if this file were wrong: Ownership links, transition history, provider sequence handling, and auditability would all weaken.
- What a junior engineer would likely miswrite here: Leaving out `providerSequence` or `ApplicationParty.userId` because they do not look necessary at first glance.
