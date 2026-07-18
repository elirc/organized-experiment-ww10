# Auth And Permissions

Session flow:

- Session cookies are signed in `src/lib/auth/session.ts` by `encodeSessionCookieValue()` near the top-middle of the file.
- Incoming cookies are verified and resolved to a database-backed session in `src/lib/auth/session.ts` by `getSessionFromRequest()` in the middle of the file.
- Demo login happens in `src/app/api/session/login/route.ts`, which validates `loginSchema` from `src/lib/validation/session-schemas.ts` and calls `sessionService.createLoginCookie()` in `src/services/session-service.ts`.

Permission enforcement:

- The role matrix lives near the top of `src/lib/auth/permissions.ts` in `rolePermissions`.
- Route-level permission checks happen in `src/lib/http/route-handler.ts` inside `createRouteHandler()`, right after the session is loaded.
- Record-level access checks happen in `src/lib/auth/permissions.ts` via `canReadApplication()` and in `src/repositories/application-repository.ts` via `buildApplicationVisibilityWhere()`.
- Borrower reads are constrained by `buildApplicationVisibilityWhere()` to `parties.some.userId = session.user.id` near the top-middle of `src/repositories/application-repository.ts`.
- Servicing reads are constrained in the same function to `DISBURSEMENT` and `SERVICING_HANDOFF` stages only.

Role breakdown:

- `BORROWER`
  Can create and submit applications through `application:create` and `application:submit` in `src/lib/auth/permissions.ts`.
  Cannot call verification, decision, condition, disbursement, or servicing routes because `createRouteHandler()` rejects missing permissions before the handler runs.
- `LOAN_OFFICER`
  Can create files, manage verifications, and manage conditions.
  Cannot record underwriting decisions or disburse.
- `UNDERWRITER`
  Can read the pipeline, record decisions, and manage conditions.
  Cannot disburse or transfer to servicing.
- `OPERATIONS_MANAGER`
  Can read the pipeline, disburse, and hand off to servicing.
- `SERVICING_AGENT`
  Can read only funded files because `buildApplicationVisibilityWhere()` filters pre-funding stages out.

Where authorization actually bites:

- Session is verified in `src/lib/auth/session.ts`, then the permission check fires in `src/lib/http/route-handler.ts` before the route-specific handler body runs.
- The route-level permission is not enough by itself. `src/services/application-command-service.ts` still calls `ensureReadableApplication()` near the top of the file so visibility is checked again on the actual application record.

Multi-tenancy:

- Multi-tenancy is not included in this build because the current product reads like a single lender platform rather than a shared lender/broker SaaS.
- The future tenant seam is the repository layer. To add tenancy later, the main change would be adding `tenantId` to tenant-owned Prisma models in `prisma/schema.prisma`, then extending `buildApplicationVisibilityWhere()` and every repository write/read in `src/repositories/application-repository.ts` to scope by `tenantId` in addition to user ownership and role.
