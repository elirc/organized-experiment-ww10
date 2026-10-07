# Auth And Permissions

Authorization has three layers. Each one is described below with line references, followed by the gaps between them.

1. **Identity:** an HMAC-signed cookie that carries a user id (`src/lib/auth/session.ts`).
2. **Capability:** a role-to-permission table, enforced by the route wrapper before any handler code runs (`src/lib/auth/permissions.ts`, `src/lib/http/route-handler.ts`).
3. **Record visibility:** a Prisma `where` fragment applied to reads (`buildApplicationVisibilityWhere`, `src/repositories/application-repository.ts:79-104`), plus a second check, `canReadApplication()` (`src/lib/auth/permissions.ts:70-93`), applied by command services.

## 1. Identity: the session cookie

- **Encoding.** `encodeSessionCookieValue(userId)` returns `` `${userId}.${hmacSha256(userId)}` `` (`src/lib/auth/session.ts:27-30`). The secret is `APP_SESSION_SECRET`, or the literal `"dev-only-demo-secret"` if that is unset (`:19-21`).
- **Decoding.** `decodeSessionCookieValue()` splits on `.`, recomputes the HMAC, and compares with `timingSafeEqual` after a length check (`:32-51`). The length check matters because `timingSafeEqual` throws on unequal lengths.
- **Resolution.** `getSessionFromRequest()` parses the raw `cookie` header by hand (`:54-60`), decodes it, and loads the user with `userRepository.findById` (`:67`; `src/repositories/user-repository.ts:20-25`). The result is `AppSession = { user: { id, fullName, email, role } }` (`permissions.ts:14-21`). The role is read fresh from the database on each request, so changing a user's role takes effect immediately. Deleting the user makes the cookie resolve to `null`.
- **Issuing.** `createSessionCookieHeader()` sets `Path=/; HttpOnly; SameSite=Lax` (`session.ts:91-94`). It does not set `Secure` or an expiry, so the cookie lasts for the browser session but its value is valid forever. `createExpiredSessionCookieHeader()` (`:96-98`) exists, but no route calls it, so there is no logout endpoint.
- **What "database-backed" means here.** There is no session table. The database is used only to confirm that the user still exists and to read the role. The cookie for a given user id is deterministic: every login as Priya produces the same value.

### Login

`POST /api/session/login` (`src/app/api/session/login/route.ts:12-31`) is declared with `allowAnonymous: true` (`:13`). It parses `{ userId }` (`:15`) and calls `sessionService.createLoginCookie(userId)` (`src/services/session-service.ts:26-36`). That function returns 404 if the user does not exist and otherwise returns a valid cookie. **There is no credential check of any kind.** Combined with `GET /api/session`, which is also anonymous and returns `demoUsers` (every user's id, name, email, and role, `session-service.ts:14-24`), any visitor can assume the operations manager's identity in two requests.

The permission `session:assume-demo-user` (`permissions.ts:24`, granted only to `OPERATIONS_MANAGER` at `:51`) looks like it was meant to gate this switcher. Nothing references it.

## 2. Capability: the role matrix

`rolePermissions` (`src/lib/auth/permissions.ts:34-54`):

| Permission | BORROWER | LOAN_OFFICER | UNDERWRITER | OPERATIONS_MANAGER | SERVICING_AGENT |
| --- | --- | --- | --- | --- | --- |
| `application:create` | yes | yes | - | - | - |
| `application:view-pipeline` | - | yes | yes | yes | yes |
| `application:submit` | yes | - | - | - | - |
| `application:manage-verifications` | - | yes | - | - | - |
| `application:record-decision` | - | - | yes | - | - |
| `application:manage-conditions` | - | yes | yes | - | - |
| `application:disburse` | - | - | - | yes | - |
| `application:handoff-servicing` | - | - | - | yes | - |
| `session:assume-demo-user` | - | - | - | yes | - |

Corrections to earlier versions of this doc:
- `UNDERWRITER` **cannot** manage verifications. Only `LOAN_OFFICER` can.
- `LOAN_OFFICER` **cannot** submit applications, even though `submitApplication()` says "Only borrowers and loan officers can submit" (`src/services/application-command-service.ts:239-241`). The route-level `application:submit` check (`src/app/api/applications/[applicationId]/submit/route.ts:13`) rejects loan officers first, so the service's loan-officer branch is unreachable.
- `application:view-pipeline` is granted to four roles but **never checked**. `GET /api/applications` and `GET /api/applications/:id` declare no permission (`src/app/api/applications/route.ts:14-22`, `src/app/api/applications/[applicationId]/route.ts:11-20`). Reads are protected only by the visibility filter.

### Where the check fires

`createRouteHandler()` (`src/lib/http/route-handler.ts:66-92`):

1. `resolveSession(request)` (`:73`). It defaults to `getSessionFromRequest`, and tests can inject their own (`:69`).
2. If the route is not anonymous and there is no session, it throws `AppError(401)` (`:75-77`).
3. If a permission is declared, it calls `assertPermission(session, permission)` (`:79-81`; `permissions.ts:60-68`), which throws 403 with the message `Role BORROWER cannot perform application:record-decision.`
4. It runs the handler (`:83-87`). Any throw goes to `errorResponse()` (`:35-64`): `ZodError` becomes 400 `{ error: "Validation failed.", issues }`, `AppError` becomes `error.status` with `{ error, details }`, and anything else becomes a logged 500.

The permission check runs **before** the handler parses the body. Parsing happens inside the handler (for example `decision/route.ts:17`).

## 3. Record visibility

### Repository predicate (reads)

`buildApplicationVisibilityWhere(session)` (`src/repositories/application-repository.ts:79-104`):
- `BORROWER`: `{ parties: { some: { userId } } }` (`:82-91`)
- `SERVICING_AGENT`: `{ stage: { in: ["DISBURSEMENT", "SERVICING_HANDOFF"] } }` (`:93-101`)
- everyone else: `{}` (`:103`), which means **all applications**. Loan officers and underwriters are not limited to files assigned to them, even though `LoanApplication.assignedOfficerId` exists (`prisma/schema.prisma:107`).

Used by `listVisibleSummaries` (`:107-113`) and `findVisibleDetailByPublicId` (`:115-123`).

### Service check (writes)

`ensureReadableApplication(session, publicId)` (`src/services/application-command-service.ts:62-83`) runs `findVisibleDetailByPublicId` (already filtered) **and then** `canReadApplication()` on the result. Every command except `createApplication` and `resolveCondition` calls it. `resolveCondition` loads the condition by id with no filter (`:483`) and calls `canReadApplication` directly (`:488-500`).

### The two predicates disagree

`canReadApplication` lets a borrower in if `createdById === user.id` **or** they are a party (`permissions.ts:78-83`). The repository predicate only checks the party link. Concretely:

- A borrower who creates an application with `primaryApplicant.userId` set to **someone else's** id (allowed: `partySchema.userId` is an optional free string, `src/lib/validation/application-schemas.ts:18`) is not a party. They cannot see the application they just created, while the other user can.
- Any `userId` in the body is linked as a party with no check that it is a real user or the caller. A non-existent id fails the `ApplicationParty.user` foreign key (`prisma/schema.prisma:130`). Prisma throws a non-`AppError`, so the caller gets a 500.

The UI hides most of this: `create-application-form.tsx:34` always sends the borrower's own id. The API does not.

## Multi-tenancy

None. There is no tenant column on any model. The product is a single lender. The future insertion point is `buildApplicationVisibilityWhere` together with every `findUnique({ where: { id } })` in the repository. The by-id lookups (`findWorkflowAggregateById`, `findConditionById`, `loadApplicationDetailById`, `updateVerificationRequest`, `updateCondition`) do **not** pass through the visibility predicate today, so adding tenancy would mean touching each of them.

## Senior review findings

1. **Unauthenticated identity assumption** (`src/app/api/session/login/route.ts:13`, `src/services/session-service.ts:26-36`). In any deployment, this alone gives every visitor operations-manager access. Gate the switcher behind `NODE_ENV !== "production"`, or check `session:assume-demo-user`.
2. **Forgeable cookies with the default secret** (`session.ts:20`). Fail at startup when `APP_SESSION_SECRET` is unset in production.
3. **Irrevocable, non-expiring tokens** (`session.ts:27-30`). Add an issued-at time and an expiry to the signed payload, or a server-side session row.
4. **Read scope for staff is "everything"** (`application-repository.ts:103`). This is defensible for a small lender. Make it a stated decision, not a default.
5. **UI and server disagree on permissions** (`application-detail-client.tsx:82-91` vs `permissions.ts:34-54`).

## Exercises

1. **Goal:** Become the operations manager without knowing anything in advance.
   **Check:** On paper: `GET /api/session` returns `demoUsers` with ids (`session-service.ts:17`). `POST /api/session/login` with the ops id returns `set-cookie` (`login/route.ts:26`). Name the line that would need to change to stop this.
2. **Goal:** Explain why `timingSafeEqual` is preceded by a length comparison.
   **Check:** `session.ts:43-46`. Node's `timingSafeEqual` throws `RangeError` on buffers of different lengths. That would bubble up as a 500 instead of returning `null`.
3. **Goal:** Find the request where an underwriter's button click is rejected by the server.
   **Check:** "Simulate async result" is enabled for `UNDERWRITER` (`application-detail-client.tsx:85-86`, `:245`). The route requires `application:manage-verifications` (`external-events/route.ts:13`), and the `UNDERWRITER` list (`permissions.ts:42-46`) does not include it, so the server returns 403.
4. **Goal:** Confirm that a servicing agent cannot see `APP-1001` after seeding.
   **Check:** The seed sets the stage to `CONDITIONS` (`prisma/seed.ts:77`). The servicing predicate (`application-repository.ts:96-100`) allows only `DISBURSEMENT` and `SERVICING_HANDOFF`, so the detail route returns 404 "Application not found." (`src/services/application-query-service.ts:28-31`).
