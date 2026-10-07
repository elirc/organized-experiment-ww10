# Flow Traces

Each trace starts at a UI control, goes through a React Query hook, then the route wrapper, the service, the reconciler, and the repository. Each ends with exercises you can complete by reading. Server-side detail for the decision and external-event flows is in `docs/architecture/request-lifecycle.md`.

Client plumbing shared by all flows:
- `apiFetch()` (`src/lib/api/fetcher.ts:18-34`) always calls `response.json()` first (`:27`) and throws `ApiClientError(payload.error, status)` on a non-2xx response (`:29-31`). A non-JSON error body, such as an HTML 500 page, would throw a `SyntaxError` instead.
- Detail-page mutations share `useWorkflowMutation(applicationId, path)` (`src/hooks/use-application-detail.ts:103-123`). On success it invalidates `["application", id]` and `["applications"]`. The server already returns the updated detail in the response body, but the hook ignores it and refetches.

---

## Flow 1: A borrower creates a new application

1. `src/components/dashboard/dashboard-client.tsx:76` renders `<CreateApplicationForm session={session} />` for **every** signed-in role. Underwriters, operations, and servicing see the form even though they lack `application:create`.
2. `src/components/dashboard/create-application-form.tsx` pre-fills from the session and sets `primaryApplicant.userId` to the session id only for `BORROWER` (`:34`).
3. `useCreateApplicationMutation()` (`src/hooks/use-applications.ts:64`) sends `POST /api/applications`.
4. `src/app/api/applications/route.ts:24-27`: the wrapper enforces `application:create`, then the handler parses with `createApplicationSchema`.
5. `applicationCommandService.createApplication()` (`src/services/application-command-service.ts:152-234`): one transaction containing the nested create and the `APPLICATION_CREATED` audit log.
6. **201** `{ application }`. The new application is in `INTAKE`, with no transition row.

**Exercises**
- **Goal:** Find what an underwriter sees when submitting the create form.
  **Check:** `UNDERWRITER`'s permission list (`src/lib/auth/permissions.ts:42-46`) has no `application:create`. The wrapper throws 403 at `src/lib/http/route-handler.ts:79-81`, and the error message reaches the UI through `ApiClientError`.
- **Goal:** Find who becomes the assigned officer when a borrower creates the file.
  **Check:** `application-command-service.ts:186-193`. Nobody. Only a `LOAN_OFFICER` creator is auto-assigned, and no endpoint assigns an officer later.

---

## Flow 2: A borrower submits intake

1. The Submit button (`src/components/applications/application-detail-client.tsx:172-174`) is enabled when `stage === "INTAKE"` and the role is `BORROWER` or `LOAN_OFFICER` (`:82-84`). It sends `{ confirmReady: true }`.
2. `useSubmitApplicationMutation` (`src/hooks/use-application-detail.ts:133-138`) sends `POST /api/applications/:id/submit`.
3. `submit/route.ts:13`: `application:submit` (borrower only). `:16`: `submitApplicationSchema` requires `confirmReady: z.literal(true)` (`src/lib/validation/application-schemas.ts:29-31`).
4. `submitApplication()` (`application-command-service.ts:236-269`): visibility check, then a redundant role check (`:239-241`), then `assertCanSubmitApplication` on the **stored** stage, which turns into a 400 (`:243-247`). Inside the transaction it sets `intakeCompletedAt`, writes the `APPLICATION_SUBMITTED` audit log, and reconciles.
5. Reconcile: rule 4 no longer matches. With no verifications yet, rule 5 sends the file to `VERIFICATION` with the reason "Required third-party verification results are still outstanding."

**Exercises**
- **Goal:** Find the role that the UI offers Submit to but the server always rejects.
  **Check:** `LOAN_OFFICER`. The UI allows it at `application-detail-client.tsx:84`. The server's `rolePermissions.LOAN_OFFICER` (`permissions.ts:36-41`) lacks `application:submit`, so the result is 403.

---

## Flow 3: A borrower is rejected from the underwriter decision route

1. The Decision button is disabled unless `role === "UNDERWRITER"` (`application-detail-client.tsx:87`, `:293`). A borrower can still `fetch` the endpoint directly.
2. `useDecisionMutation` (`use-application-detail.ts:154-156`) sends `POST .../decision`.
3. `decision/route.ts:14`, then `route-handler.ts:79-81`, then `assertPermission` (`permissions.ts:60-68`), which returns **403** "Role BORROWER cannot perform application:record-decision."

**Exercises**
- **Goal:** Confirm the body is never parsed for a rejected caller.
  **Check:** `decisionSchema.parse` is at `decision/route.ts:17`, inside `handler`. The wrapper throws before calling `options.handler` (`route-handler.ts:83`).

---

## Flow 4: An async external event lands out of order

1. The "Simulate async result" button (`application-detail-client.tsx:244-263`) is enabled for `LOAN_OFFICER` and `UNDERWRITER` (`:85-86`). It posts the chosen type, `eventTypeMap[type]`, status, a **user-editable** `providerSequence` (state at `:60`, input at `:234`), the summary, `occurredAt: now`, and `payload: { source: "demo-simulator", applicationId }`.
2. `useExternalEventMutation` (`use-application-detail.ts:147-152`) sends `POST .../external-events`.
3. `external-events/route.ts:13`: `application:manage-verifications` (loan officer only). `:16`: `externalEventSchema`.
4. `ingestExternalVerificationEvent()` (`application-command-service.ts:304-394`):
   - finds or creates the verification;
   - compares sequences (`:346-347`);
   - always stores the event (`:349-360`);
   - updates the verification only when the event should apply (`:362-371`);
   - writes the audit log;
   - reconciles.
5. Reconcile recomputes from **all** verifications, not just this one. The result does not depend on arrival order, only on the latest applied status per type.

**Exercises**
- **Goal:** Reproduce the stale-event guard by hand on `APP-1001`.
  **Check:** The seed stores `CREDIT_PULL` at sequence 2 (`prisma/seed.ts:106-114`). Submit an event with type `CREDIT_PULL`, status `FAILED`, and sequence 1. At `:346-347`, `isOutOfOrder` is true and `shouldApply` is false. The verification stays `PASSED`, and the stage stays `CONDITIONS`.
- **Goal:** Find how to *break* the guard from the same UI.
  **Check:** Enter sequence 2 (equal) or 3 with status `FAILED`. `shouldApply` is true (`>=`), so the verification becomes `FAILED`. Rule 5 wins (`src/services/workflow-reconciliation-service.ts:84-95`), and an approved file drops back to `VERIFICATION`.

---

## Flow 5: A failed condition rolls an approved file back into conditions

1. Each `OPEN` condition shows "Mark satisfied / waived / failed" buttons when `canManageConditions` (`application-detail-client.tsx:395-415`). Resolved conditions show no buttons in the UI, but the API does not refuse to re-resolve them.
2. `useResolveConditionMutation` (`use-application-detail.ts:162-185`) sends `POST /api/conditions/:conditionId/resolve`. It also invalidates a `["condition", id]` key that no query uses (`:181`).
3. `resolve/route.ts:13`: `application:manage-conditions`. `:16`: `resolveConditionSchema` (status is not `OPEN`, note 8-240 characters; `src/lib/validation/workflow-schemas.ts:47-50`).
4. `resolveCondition()` (`application-command-service.ts:475-541`): unfiltered load, `canReadApplication`, then the funded-file guard (`:502-508`). The transaction updates the condition, writes the audit log, and reconciles.
5. Rule 7 (`workflow-reconciliation-service.ts:107-113`) returns `CONDITIONS` with the reason "<title> failed after approval and rolled the file back into conditions."

**Exercises**
- **Goal:** Find whether a `FAILED` condition can ever be cleared.
  **Check:** Call resolve again on the same condition with `SATISFIED`. Nothing in `resolveCondition` checks the current `condition.status`, so it updates, and rule 7 stops matching. The only route out of a failed condition is re-resolving it, which the UI does not offer (`application-detail-client.tsx:395`).
- **Goal:** Find the stale read in the rollback guard.
  **Check:** `condition.application.stage` (`:504-505`) is loaded at `:483`, before the transaction opens at `:510`. A disbursement that commits in between would not be seen.

---

## Flow 6: Operations disburses an approved application

1. The Disburse button is enabled for `OPERATIONS_MANAGER` (`application-detail-client.tsx:90`, `:339-341`) and is not tied to the stage.
2. `useDisburseMutation` (`use-application-detail.ts:187-189`) sends `POST .../disburse`.
3. `disburse/route.ts:12`: `application:disburse`.
4. `disburseApplication()` (`application-command-service.ts:543-573`) reconciles a fresh aggregate **outside** the transaction (`:545`), then `assertCanDisburse` (`src/services/workflow-reconciliation-service.ts:145-149`) requires `APPROVED`, otherwise 400. The transaction sets `disbursedAt`, writes the audit log, and reconciles, and rule 3 gives `DISBURSEMENT`.
5. Then `handoffToServicing` (`:575-602`) requires stored stage `DISBURSEMENT`, sets `servicingHandedOffAt`, and rule 2 gives `SERVICING_HANDOFF`.

**Exercises**
- **Goal:** Find the double-disbursement window.
  **Check:** Two concurrent disburse requests both pass `assertCanDisburse` (each reconciles to `APPROVED` before either commits), and both run the transaction. `disbursedAt` is overwritten, so you get two `APPLICATION_DISBURSED` audit rows and one transition (the second reconcile sees no change). Nothing uses `stateVersion` to stop the second one.
- **Goal:** Explain why disbursing APP-1001 right after seeding fails.
  **Check:** One condition is `OPEN` (`prisma/seed.ts:137-142`). Rule 8 gives `CONDITIONS`, so `assertCanDisburse` throws, and the response is 400 "Application must be in APPROVED state before disbursement."
