# LedgerFlow Lending

Production-style loan origination and underwriting platform built with Next.js, TypeScript, PostgreSQL, Prisma, Tailwind, Zod, React Query, and REST APIs.

## What it includes

- Multi-stage application lifecycle: intake, verification, credit decisioning, conditions, approval, disbursement, and servicing hand-off
- Explicit RBAC with borrower, loan officer, underwriter, operations, and servicing roles
- Out-of-order async verification handling through provider sequencing and workflow reconciliation
- Transition history and audit logging
- Thin route handlers with Zod validation boundaries
- Purposeful tests for permission enforcement, validation, invalid transitions, and data isolation

## Commands

```bash
npm install
npm run prisma:generate
npm run db:push
npm run seed
npm run dev
```

## Docs

- Architecture: `docs/architecture/`
- Learning notes: `docs/learning/`
