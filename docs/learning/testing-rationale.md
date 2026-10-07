# Testing Rationale

Vitest runs only `tests/**/*.test.ts` (`vitest.config.ts:8`) in a Node environment, with `@` aliased to `src` (`:10-13`). There are four files with one test each. None needs a database or mocks a module: each one calls a pure function or the route wrapper with an injected session. This document does not report pass or fail status. Run `npm test` yourself.

## 1. `tests/auth-permissions.test.ts`: "borrower cannot call an underwriter-protected endpoint"

**How it works:** It builds a handler with `createRouteHandler({ permission: "application:record-decision", resolveSession: async () => ({ user: { role: "BORROWER", ... } }), handler })` (`:9-22`). It calls the handler with a bare `Request` (`:24-26`) and asserts status 403 and that the error message contains `"BORROWER"` (`:28-31`).

**What it proves:** The wrapper consults the real `rolePermissions` matrix (nothing is mocked). `BORROWER` lacks `application:record-decision`, and the rejection happens before the handler body runs (the handler would have returned `{ ok: true }`).

**What it does not prove:**
- That the real decision route declares that permission. The test builds its own handler, so deleting `permission:` from `src/app/api/applications/[applicationId]/decision/route.ts:14` would not fail it.
- Positive paths (an underwriter *can* call it).
- Cookie parsing and HMAC verification. `resolveSession` bypasses `getSessionFromRequest` entirely.

**Better coverage:**
- A table test that imports each route module and asserts its declared permission. This would need a small refactor to export the options object.
- Tests of `decodeSessionCookieValue` with a tampered signature, a wrong length, and extra dots.

## 2. `tests/validation-boundary.test.ts`: "createApplicationSchema rejects malformed borrower input"

**How it works:** `safeParse` on a payload with six bad fields at once (short purpose, negative amount, one-letter first name, empty last name, invalid email, zero income) (`:9-19`). It asserts `success === false` (`:21`).

**What it proves:** At least one of those rules fires.

**What it does not prove:** Which one. Removing any five of the six rules would still pass. The workflow schemas (`externalEventSchema`, `decisionSchema` with `.exclude(["PENDING"])`, `resolveConditionSchema`) are untested.

**Better coverage:** One bad field per case, asserting `result.error.issues[0].path`. Also a valid payload that must pass.

## 3. `tests/workflow-transition.test.ts`: "application cannot disburse while an approval condition is still open"

**How it works:** It builds a snapshot (`:12-26`): intake done, all three verifications `PASSED`, `APPROVED` with `approvedAt`, and one `OPEN` condition. It asserts that `reconcileWorkflow` returns `CONDITIONS` (`:28`) and that `assertCanDisburse` throws the exact message (`:29-31`).

**What it proves:** Rule 8 (`src/services/workflow-reconciliation-service.ts:115-124`) and the disbursement guard work together.

**What it does not prove:** The other nine rules, rule *ordering*, or that `disburseApplication` actually calls the guard. The service is not exercised.

**Better coverage:** A `describe.each` over the rule table in `docs/architecture/domain-model.md`, one snapshot per row, plus ordering cases:
- `DECLINED` + `disbursedAt` gives `DENIED`. This documents the current policy, whichever way you decide it should go.
- `REFER` + a `FAILED` condition gives `CREDIT_DECISIONING`.
- A `FAILED` verification after approval but before funding gives `VERIFICATION`.

## 4. `tests/data-isolation.test.ts`: "borrower visibility filter scopes reads to linked application parties"

**How it works:** It calls `buildApplicationVisibilityWhere` with a borrower session and `toEqual`s the exact `{ parties: { some: { userId } } }` object (`:9-24`).

**What it proves:** The borrower predicate's exact shape. Any loosening, such as adding `OR createdById`, fails it.

**What it does not prove:**
- The servicing branch (`application-repository.ts:93-101`) and the staff branch (`{}`).
- That every read path actually uses the predicate.
- That `canReadApplication` agrees with it (it does not; see `docs/architecture/auth-and-permissions.md`).

**Better coverage:** Tests for the servicing and staff branches. A database-backed test with two borrowers asserting that `GET /api/applications/:id` returns 404 across them.

## Defects described in these docs that no test would catch

| Defect | Location | Test that would catch it |
| --- | --- | --- |
| Anonymous login as any user | `src/app/api/session/login/route.ts:13` | Route test: anonymous POST should be refused outside demo mode |
| Equal provider sequence re-applies | `application-command-service.ts:347` | Service test with a stubbed repository: same sequence, different status, assert no update |
| Decline after funding produces `DENIED` | `workflow-reconciliation-service.ts:48-53` | Reconciler test (see above) |
| Decision accepted at `INTAKE` | `application-command-service.ts:408-410` | Service test: `recordDecision` on an intake file should 400 |
| UI/server permission drift | `application-detail-client.tsx:82-91` | Shared table comparing the UI flags with `rolePermissions` |
| `publicId` collision gives 500 | `public-id.ts:12` | Service test with a stubbed generator returning a duplicate |
| Condition re-resolution | `application-command-service.ts:475-541` | Service test: resolve a `SATISFIED` condition, expect 400 |

## Exercises

1. **Goal:** Show that test 1 would survive deleting the decision route's permission.
   **Check:** `tests/auth-permissions.test.ts` imports only `createRouteHandler` (`:3`). It never imports `src/app/api/applications/[applicationId]/decision/route.ts`.
2. **Goal:** Pick the cheapest high-value test to add next.
   **Check:** It should be a reconciler test, because the module is pure (no mocks needed) and holds all the stage policy. Write the snapshot for "late `FAILED` credit pull on an approved, unfunded file" and its expected stage. The answer is `VERIFICATION`, from rule 5.
