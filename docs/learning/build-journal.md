# Build Journal

This journal records the stages of the build, the major decisions, and the PR slices. "Review notes" were added afterwards. They compare each decision with what the code actually does and are based only on reading this repository.

## Stage 1: Architecture and stack

- **Built:** Next.js 16 App Router, TypeScript, PostgreSQL, Prisma 7 (driver adapter `@prisma/adapter-pg` over `pg`), Tailwind, Zod 4, React Query 5, REST routes.
- **Decision:** Prisma instead of Drizzle, because of dense relations, transaction-heavy commands, and readable schema-first design.
- **Why:** The hard problem is lifecycle correctness, not SQL fluency.
- **Review notes:** Prisma 7's driver-adapter setup is visible in `src/lib/db/prisma.ts:18-32`, where a `Pool` and a `PrismaPg` adapter are both cached on `globalThis` in development. The datasource URL moved out of the schema into `prisma.config.ts`.

## Stage 2: Domain schema

- **Built:** `prisma/schema.prisma`, `prisma.config.ts`, `prisma/seed.ts`.
- **Decision:** Persist `VerificationRequest.providerSequence`, `ExternalWorkflowEvent`, `ApplicationTransition`, and `AuditLog` as first-class tables.
- **Why:** Out-of-order provider results and rollback traces need durable records.
- **Review notes:**
  - The original journal also listed `.env` and `.env.example`. Neither is in the repository, because `.gitignore:34` ignores `.env*`.
  - `prisma.config.ts` names `prisma/migrations` (`:7`), but no migrations exist. The README uses `db push`.
  - `stateVersion` was added but is never used as a lock.
  - `WITHDRAWN` was added to the stage enum, but nothing produces it.

## Stage 3: Auth and permissions

- **Built:** `src/lib/auth/session.ts`, `src/lib/auth/permissions.ts`, `src/lib/http/route-handler.ts`, `src/services/session-service.ts`.
- **Decision:** Signed cookie sessions plus a seeded-role switcher instead of credential auth.
- **Why:** Session and RBAC boundaries were needed from day one, but the learning focus is workflow architecture.
- **Review notes:** The boundary is real for *authorization*. Routes cannot skip the wrapper, and the matrix is enforced before handlers run. It is absent for *authentication*: the switcher is an anonymous endpoint that accepts any user id. The planned guard, `session:assume-demo-user`, was declared but never wired up. The cookie has no expiry and no logout route exists. For a demo this is an acceptable trade, but the docs must say so, and now they do.

## Stage 4: Service and repository boundaries

- **Built:** `application-repository.ts`, `user-repository.ts`, `application-query-service.ts`, `application-command-service.ts`, `workflow-reconciliation-service.ts`.
- **Decision:** Split reads from writes and keep the reconciler pure.
- **Why:** That makes the state machine testable, and query shapes stay separate from commands.
- **Review notes:** The reconciler really is pure. It has only type imports. The command/query split holds. The repository boundary is looser: the command service makes seven direct `tx.loanApplication` or `tx.verificationRequest` calls.

## Stage 5: REST APIs and operational UI

- **Built:** Twelve route files, three hook files, the dashboard and detail screens.
- **Decision:** React Query hooks as the only browser data boundary.
- **Why:** Cache invalidation and endpoint contracts stay visible.
- **Review notes:** Every component uses hooks, and there are no stray `fetch` calls. The UI's button gating duplicates the permission matrix and has drifted in two places: Submit for loan officers, and verification controls for underwriters.

## Stage 6: Verification, testing, and docs

- **Built:** Four Vitest files, `vitest.config.ts`, and the docs.
- **Decision:** Small tests at the narrowest load-bearing seams.
- **Why:** Permissions, validation, transitions, and isolation catch the most dangerous regressions.
- **Review notes:** Each seam has exactly one assertion path. The permission test builds its own handler rather than importing a route, and the validation test passes as long as any one of six rules fires. See `docs/learning/testing-rationale.md`.

---

## Major decisions

### Decision: State machine modeling

**Why this matters:** The hardest part is keeping the stage correct when provider results arrive out of order, or when conditions fail after approval.

**Options:**
- A mutable `stage` enum set imperatively per route. Fast to build, but brittle and hard to audit.
- Full event sourcing. Powerful, but heavy for this scope.
- An external workflow engine. Operationally strong, but it adds a platform before the domain is stable.
- A pure reconciliation function plus persisted transition and event history. A good balance of correctness, debuggability, and readability.

**Choice:** Pure reconciliation plus persisted history.

**Why this won:** `workflow-reconciliation-service.ts` stays pure, while the command service persists transitions and events in the same transaction as the facts.

**Junior vs. mid vs. senior:**
- A junior sees a clean state helper.
- A mid-level engineer sees that recomputing from the aggregate beats trusting event order.
- A senior engineer sees that the reconciler's **rule order is policy**, and asks for that policy to be written down and tested. Today, `DENIED` outranks `DISBURSEMENT`, so a post-funding decline flips a funded loan to `DENIED`.

**Review notes:** The pattern holds, but the guards that decide whether a command may run still read pre-transaction state. Derived state guarantees the stage matches the facts. It does not guarantee the facts were allowed.

### Decision: Multi-tenancy

**Why this matters:** Tenancy is expensive to retrofit and expensive to overbuild.

**Options:**
- A tenant-aware schema now.
- No tenancy and no seam.
- No tenancy now, with a repository seam ready for it.

**Choice:** No tenancy, with a repository seam.

**Why this won:** `application-repository.ts` centralizes the query scope.

**Review notes:** The seam covers the two visibility-filtered reads. The by-id methods do not go through it, so a future `tenantId` would need to be threaded through `findWorkflowAggregateById`, `findConditionById`, `loadApplicationDetailById`, and the update methods too.

---

## PR Slices

### Slice 1: Persistence and workflow schema

- **Purpose:** Establish the relational model and seed data.
- **Files:** `prisma/schema.prisma`, `prisma/seed.ts`, `prisma.config.ts`.
- **Reviewer focus:**
  - `providerSequence`, `ExternalWorkflowEvent`, and `ApplicationTransition` exist.
  - The seed covers conditions, approvals, and provider artifacts.
- **Stronger reviewer flag:** Ask whether `stateVersion` will actually be compared. Ask why `ApplicationParty` has no uniqueness on `(applicationId, role)`. Ask why the seed's audit `entityId` is a public id while runtime uses the cuid.

### Slice 2: Auth, RBAC, and request boundary

- **Purpose:** The session and permission boundary every route depends on.
- **Files:** `session.ts`, `permissions.ts`, `route-handler.ts`, `session-service.ts`.
- **Reviewer focus:**
  - The HMAC uses `timingSafeEqual` with a length guard.
  - The wrapper's ordering is correct.
- **Stronger reviewer flag:** Block the anonymous `userId` login from any non-demo environment. Ask for token expiry and a logout route. Ask why `canReadApplication` and the repository predicate differ.

### Slice 3: Domain services and repositories

- **Purpose:** The service/repository split and the reconciler.
- **Files:** `application-repository.ts`, `workflow-reconciliation-service.ts`, `application-command-service.ts`, `application-query-service.ts`.
- **Reviewer focus:**
  - Every mutation reconciles inside its transaction. All do except `createApplication`.
- **Stronger reviewer flag:**
  - Guards run outside the transaction.
  - `>=` in the sequence check.
  - `recordDecision` accepts decisions at `INTAKE` and after funding.
  - `resolveCondition` does not check the current condition status.

### Slice 4: REST APIs and UI surface

- **Purpose:** Thin APIs, hooks, and operator screens.
- **Files:** The route files, `use-application-detail.ts`, `dashboard-client.tsx`, `application-detail-client.tsx`.
- **Reviewer focus:** Routes stay thin, and mutations invalidate the right keys.
- **Stronger reviewer flag:** Buttons enabled for roles the server rejects. The create form is shown to every role. The provider-callback endpoint is authenticated as a human.

### Slice 5: Tests and code-anchored docs

- **Purpose:** Lock down the highest-risk invariants and explain the code.
- **Files:** `tests/*.test.ts`, `docs/**`.
- **Reviewer focus:** Each test should fail when its invariant breaks.
- **Stronger reviewer flag:** Test 1 does not import any route. Test 2 asserts only `success === false`. Ask for one reconciler test per rule.

---

## Senior review summary (ranked)

1. **Anyone can log in as anyone.** `POST /api/session/login` is anonymous and accepts any `userId` (`src/app/api/session/login/route.ts:13`). Ids are listed anonymously by `GET /api/session`.
2. **The decision guard is too narrow.** `recordDecision` blocks only when the reconciled stage is `VERIFICATION` (`src/services/application-command-service.ts:408-410`). Decisions at `INTAKE` and after funding go through. Because the reconciler puts `DENIED` first, a post-funding decline flips a funded loan to `DENIED`.
3. **Sequence handling re-applies equal sequences and races under concurrency** (`application-command-service.ts:321-347`).
4. **Pre-transaction guards** in `recordDecision`, `resolveCondition`, `disburseApplication`, and `handoffToServicing`. Concurrent disbursements both succeed. `stateVersion` exists and could fix this.
5. **Two visibility implementations disagree** (`permissions.ts:78-83` vs `application-repository.ts:82-91`). Party `userId` is caller-controlled.
6. **`publicId` space of 8,999 values with no retry**, so a collision becomes a 500 (`src/lib/utils/public-id.ts:12`).
