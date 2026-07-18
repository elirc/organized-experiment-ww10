# Architecture Overview

LedgerFlow Lending is a Next.js application that models a loan origination and underwriting pipeline with explicit service, repository, auth, validation, and workflow layers.

Top-level layers:

- `src/app/`
  Route handlers live in files like `src/app/api/applications/route.ts` and stay thin by delegating validation and business logic elsewhere.
- `src/components/`
  UI entry points such as `src/components/dashboard/dashboard-client.tsx` and `src/components/applications/application-detail-client.tsx` render the operational screens and call React Query hooks instead of talking to the database directly.
- `src/hooks/`
  Browser-side data access lives in `src/hooks/use-applications.ts`, `src/hooks/use-application-detail.ts`, and `src/hooks/use-session.ts`.
- `src/lib/`
  Shared boundaries live here: auth in `src/lib/auth/session.ts` and `src/lib/auth/permissions.ts`, request wrapping in `src/lib/http/route-handler.ts`, validation in `src/lib/validation/*`, Prisma setup in `src/lib/db/prisma.ts`, and JSON shaping in `src/lib/presenters/application-presenters.ts`.
- `src/services/`
  Business use cases live here. `src/services/application-command-service.ts` owns lifecycle mutations, `src/services/application-query-service.ts` owns reads, and `src/services/workflow-reconciliation-service.ts` owns the pure state-machine logic.
- `src/repositories/`
  Prisma queries are centralized in `src/repositories/application-repository.ts` and `src/repositories/user-repository.ts`.
- `prisma/`
  `prisma/schema.prisma` defines the relational model and `prisma/seed.ts` seeds demo users plus a realistic in-flight application.

The main architectural split is: route -> validation/auth -> service -> repository -> Prisma -> presenter -> JSON response. That keeps business rules reviewable and prevents React components from becoming accidental backends.
