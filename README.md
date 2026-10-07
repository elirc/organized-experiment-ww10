# LedgerFlow Lending

LedgerFlow Lending is a small loan-origination workflow app used as a backend study project. A loan application moves through intake, verification, credit decisioning, conditions, approval, disbursement, and servicing hand-off. The current stage is never set directly by a command. After every write, a pure reconciler (`src/services/workflow-reconciliation-service.ts`) recomputes it from the application's facts.

It is a teaching codebase. Authentication is a demo role switcher, not real login (see "Security posture" below), and the docs under `docs/` point out real defects you can find in the code.

## Stack (from `package.json`)

- Next.js 16.2.3 App Router (`next build --webpack` is the build script)
- TypeScript, Tailwind CSS
- PostgreSQL through Prisma 7 with the `@prisma/adapter-pg` driver adapter and a `pg` `Pool` (`src/lib/db/prisma.ts:18-32`)
- Zod 4 schemas in `src/lib/validation/`
- TanStack React Query 5 hooks in `src/hooks/`
- Vitest, configured to run only `tests/**/*.test.ts` (`vitest.config.ts:8`)

## What it includes (as implemented)

- Nine `ApplicationStage` values (`prisma/schema.prisma:17-27`). Eight of them are reachable through the reconciler. `WITHDRAWN` is defined but nothing ever produces it.
- Five roles (`BORROWER`, `LOAN_OFFICER`, `UNDERWRITER`, `OPERATIONS_MANAGER`, `SERVICING_AGENT`), mapped to permissions in one table (`src/lib/auth/permissions.ts:34-54`).
- Record-level visibility: borrowers see only applications where they are a party, and servicing agents see only funded files (`buildApplicationVisibilityWhere`, `src/repositories/application-repository.ts:79-104`).
- Simulated provider results with a `providerSequence` stale-event guard (`ingestExternalVerificationEvent`, `src/services/application-command-service.ts:304-394`).
- `ApplicationTransition` rows for every stage change and `AuditLog` rows for every command, written in the same transaction as the change.
- Four Vitest files with one test each.

## Commands

```bash
npm install
npm run prisma:generate   # prisma generate
npm run db:push           # prisma db push (no prisma/migrations folder exists)
npm run seed              # tsx prisma/seed.ts - wipes all tables first (prisma/seed.ts:48-55)
npm run dev
npm test                  # vitest run
```

`prisma.config.ts` loads `dotenv/config` and reads `DATABASE_URL` (`prisma.config.ts:1`, `:11`), so Prisma CLI commands need `DATABASE_URL` in a `.env` file or the shell. `dotenv` is not declared in `package.json`; it is only present transitively in `package-lock.json`. There is no `.env.example` in the repo (`.gitignore:34` ignores `.env*`). At runtime the app falls back to `postgresql://postgres:postgres@localhost:5432/loan_origination` (`src/lib/db/prisma.ts:19`).

| Variable | Default | Read in |
| --- | --- | --- |
| `DATABASE_URL` | localhost `loan_origination` | `src/lib/db/prisma.ts:19`, `prisma/seed.ts:7`, `prisma.config.ts:11` |
| `APP_SESSION_SECRET` | `"dev-only-demo-secret"` | `src/lib/auth/session.ts:20` |

## Seeded data (`prisma/seed.ts`)

Six users, one per role plus a second borrower (`:14-45`):

- `borrower@example.com` (Priya), `coapplicant@example.com` (Marcus): `BORROWER`
- `officer@example.com`: `LOAN_OFFICER`
- `underwriter@example.com`: `UNDERWRITER`
- `ops@example.com`: `OPERATIONS_MANAGER`
- `servicing@example.com`: `SERVICING_AGENT`

There is one application, `APP-1001` (`:71-194`). It is in `CONDITIONS`, approved, with all three verifications `PASSED`, one `OPEN` condition and one `SATISFIED` condition, three transitions, and two audit logs. One external event is attached (`:196-210`).

## API surface

Every handler is built with `createRouteHandler()` (`src/lib/http/route-handler.ts:66-92`):

| Method and path | Permission | Notes |
| --- | --- | --- |
| `GET /api/session` | anonymous | Returns the current user **and every user in the database** (`src/services/session-service.ts:14-24`) |
| `POST /api/session/login` | anonymous | Body `{ userId }`. Sets a cookie for **any** existing user id |
| `GET /api/applications` | any session | Visibility-filtered list |
| `POST /api/applications` | `application:create` | 201 |
| `GET /api/applications/:publicId` | any session | Visibility-filtered detail |
| `POST /api/applications/:publicId/submit` | `application:submit` | Body must be `{ confirmReady: true }` |
| `POST /api/applications/:publicId/verifications` | `application:manage-verifications` | |
| `POST /api/applications/:publicId/external-events` | `application:manage-verifications` | Simulated provider callback |
| `POST /api/applications/:publicId/decision` | `application:record-decision` | |
| `POST /api/applications/:publicId/conditions` | `application:manage-conditions` | |
| `POST /api/conditions/:conditionId/resolve` | `application:manage-conditions` | |
| `POST /api/applications/:publicId/disburse` | `application:disburse` | |
| `POST /api/applications/:publicId/servicing-hand-off` | `application:handoff-servicing` | |

The `:applicationId` path segment is the public id (`APP-1234`), not the database cuid.

## Security posture (read this first)

- **Anyone can become anyone.** `POST /api/session/login` is `allowAnonymous: true` (`src/app/api/session/login/route.ts:13`). It accepts any `userId` (`src/lib/validation/session-schemas.ts:11-13`) and returns a valid cookie (`src/services/session-service.ts:26-36`). `GET /api/session` lists every user's id anonymously. The permission `session:assume-demo-user` exists (`src/lib/auth/permissions.ts:24`, granted to `OPERATIONS_MANAGER` at `:51`) but nothing checks it.
- **The cookie never expires and cannot be revoked.** It is `userId.HMAC-SHA256(userId)` (`src/lib/auth/session.ts:27-30`), with no timestamp, no `Max-Age` on login (`:91-94`), no `Secure` flag, and no server-side session row. A copied cookie works until the secret changes.
- **The secret has a public default.** If `APP_SESSION_SECRET` is unset, anyone who has read this repo can mint a cookie for any user id (`src/lib/auth/session.ts:19-21`).

This is acceptable for a role-switching demo, as long as nobody mistakes it for an auth design. `docs/architecture/auth-and-permissions.md` covers it in detail.

## Docs

Start with `docs/learning/guided-reading-path.md`.

- `docs/architecture/README.md` - layer map and a full command walkthrough
- `docs/architecture/request-lifecycle.md` - four requests traced line by line
- `docs/architecture/auth-and-permissions.md` - cookie, roles, visibility, gaps
- `docs/architecture/domain-model.md` - models, stage derivation table, invariants
- `docs/learning/flow-traces.md` - UI-to-database traces with exercises
- `docs/learning/load-bearing-files.md`, `concepts-demonstrated.md`, `testing-rationale.md`, `build-journal.md`

`AGENTS.md` and `CLAUDE.md` are AI-assistant instructions, not project docs.
