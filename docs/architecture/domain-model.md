# Domain Model

```mermaid
erDiagram
  User ||--o{ LoanApplication : creates
  User ||--o{ LoanApplication : assigns
  User ||--o{ ApplicationParty : links
  User ||--o{ UnderwritingCondition : creates
  User ||--o{ UnderwritingCondition : resolves
  User ||--o{ ApplicationTransition : triggers
  User ||--o{ AuditLog : acts_in

  LoanApplication ||--o{ ApplicationParty : has
  LoanApplication ||--o{ VerificationRequest : requests
  LoanApplication ||--o{ UnderwritingCondition : tracks
  LoanApplication ||--o{ ApplicationTransition : records
  LoanApplication ||--o{ ExternalWorkflowEvent : ingests
  LoanApplication ||--o{ AuditLog : emits
  VerificationRequest ||--o{ ExternalWorkflowEvent : receives
```

Entities:

- `User`
  Schema/model file: `prisma/schema.prisma`
  Primary business owner: `src/services/session-service.ts`
- `LoanApplication`
  Schema/model file: `prisma/schema.prisma`
  Primary business owner: `src/services/application-command-service.ts`
- `ApplicationParty`
  Schema/model file: `prisma/schema.prisma`
  Primary business owner: `src/services/application-command-service.ts`
- `VerificationRequest`
  Schema/model file: `prisma/schema.prisma`
  Primary business owner: `src/services/application-command-service.ts`
- `UnderwritingCondition`
  Schema/model file: `prisma/schema.prisma`
  Primary business owner: `src/services/application-command-service.ts`
- `ApplicationTransition`
  Schema/model file: `prisma/schema.prisma`
  Primary business owner: `src/services/application-command-service.ts` through `reconcileAndPersistStage()`
- `ExternalWorkflowEvent`
  Schema/model file: `prisma/schema.prisma`
  Primary business owner: `src/services/application-command-service.ts` through `ingestExternalVerificationEvent()`
- `AuditLog`
  Schema/model file: `prisma/schema.prisma`
  Primary business owner: `src/services/application-command-service.ts` through `createLifecycleAuditLog()`

Why this model matters:

- `LoanApplication.stage` is not trusted in isolation. `src/services/workflow-reconciliation-service.ts` recomputes the canonical stage from verification results, decisions, conditions, and funding timestamps.
- `VerificationRequest.providerSequence` and `ExternalWorkflowEvent.receivedOutOfOrder` are the out-of-order async safety rails.
- `ApplicationParty.userId` is the ownership seam that lets `src/repositories/application-repository.ts` scope borrower reads without adding full multi-tenancy yet.
