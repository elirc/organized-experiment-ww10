# Testing Rationale

`tests/auth-permissions.test.ts` — `borrower cannot call an underwriter-protected endpoint`
- Why this matters in production: Permission drift often happens in shared route infrastructure, and this test proves the protected-route wrapper still returns `403` before business logic executes.
- What a fuller suite would add: Route-by-route permission coverage for every role and at least one positive-path permission test per workflow command.

`tests/validation-boundary.test.ts` — `createApplicationSchema rejects malformed borrower input`
- Why this matters in production: Bad API payloads should fail at the validation boundary, not during repository writes or partial transaction execution.
- What a fuller suite would add: Field-by-field validation cases for external events, decisions, and condition resolution bodies.

`tests/workflow-transition.test.ts` — `application cannot disburse while an approval condition is still open`
- Why this matters in production: Funding a file before it is actually clear to close is a real financial-control failure, not just a UI bug.
- What a fuller suite would add: More stage-machine cases around declines, referrals, failed verification results, and stale external events.

`tests/data-isolation.test.ts` — `borrower visibility filter scopes reads to linked application parties`
- Why this matters in production: Data isolation bugs are usually query-shape bugs, and this test protects the exact borrower ownership predicate used by the repository.
- What a fuller suite would add: End-to-end API tests proving borrowers cannot fetch another borrower's detail route and servicing users cannot see pre-funding files.
