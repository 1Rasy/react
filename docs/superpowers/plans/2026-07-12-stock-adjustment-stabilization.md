# Stock Adjustment Stabilization Implementation Plan

**Goal:** Finish Phase C stabilization without expanding scope: verify the current UI contract, replace two-step employee submission with one atomic RPC, execute real database regression, and synchronize source, tests, docs, PR description, and both branches.

**Constraints:** PR #3 remains Draft; do not merge or mark Ready. Employee adjustments are integer loose pieces only. Do not restore case, box, whole, price, numeric input, direction select, top-level order-page entry, or `missed_receipt`.

## Completion status

### Task 1 — Preview acceptance workflow

- [x] Confirm latest UI decisions in status and decision documents.
- [x] Add static/source coverage for all ten acceptance rules.
- [x] Define the test-branch handoff workflow.
- [ ] User completes actual browser interaction on the automatically deployed test page.

Workflow boundary:

- The developer or agent pushes the verified commit to `stock-adjustment-phase-c`.
- Vercel deploys that branch automatically.
- The developer or agent does not need to inspect Vercel APIs, deployment lists, project permissions, preview URLs, or connector access.
- The user opens the deployed page and reports any actual UI problem.
- Lack of developer-side Vercel access is not a blocker and must not be investigated as part of this implementation task.

### Task 2 — Atomic database support

- [x] Add failing migration tests first.
- [x] Create `database/20260712_stock_adjustment_atomic_submit.sql`.
- [x] Add `save_and_submit_stock_adjustment_request`.
- [x] Keep old migrations unchanged.
- [x] Apply migration to Supabase project `wyjbnnqhiehjccmojbbg`.
- [x] Verify fixed search path and intended execute privileges.
- [x] Verify a failed item or submit rolls back request, items, version/status and history.

Implementation: the outer RPC validates the current four reasons, invokes the existing save RPC, extracts the request ID, then invokes the existing submit RPC. No exception is swallowed, so PostgreSQL rolls back the whole outer statement on failure.

### Task 3 — Shared API

- [x] Add failing test expecting one `save_and_submit_stock_adjustment_request` call.
- [x] Add `saveAndSubmit(...)` with existing argument mapping.
- [x] Retain legacy `save` and `submit` methods.
- [x] API tests pass 5/5.

### Task 4 — Employee page

- [x] Add failing test proving the old sequential calls.
- [x] Replace them with one `stockAdjustmentApi.saveAndSubmit(...)` call.
- [x] Preserve products, directions and quantities on failure.
- [x] Preserve reason, note and remark across close/reopen after failure.
- [x] Clear state only after success.
- [x] Employee UI tests pass 16/16.

### Task 5 — Scope cleanup

- [x] Remove `missed_receipt` from shared core reasons.
- [x] Make shared signed quantity use loose pieces only.
- [x] Keep negative projected stock allowed.
- [x] Core tests pass 6/6.

### Task 6 — Real business regression

- [x] Replace placeholder SQL with an executable rollback transaction.
- [x] Increase → approval → stock increase → one movement.
- [x] Decrease → approval → negative inventory allowed.
- [x] Multi-product positive and negative items.
- [x] Rejection preserves stock; edit/resubmit preserves data.
- [x] Withdrawal preserves stock; edit/resubmit succeeds.
- [x] Duplicate submit/approve/reject do not duplicate state or movement.
- [x] Invalid item rolls back the whole request.
- [x] Negative quantity remains signed for UI restoration.
- [x] Other reason requires a note.
- [x] Movement query finds approved movement.
- [x] Cleanup query confirms request/item/history/movement residue is 0.

Result: 10/10 PASS in the real Supabase database.

### Task 7 — Final automated verification

- [x] Five requested `node --check` commands pass.
- [x] Requested targeted tests pass.
- [x] Migration contract test passes 9/9.
- [x] `node --test tests/*.test.mjs` passes 44/44, failure 0, skipped 0.
- [x] No pre-existing Node failures observed.

### Task 8 — Synchronization

- [x] Update source, tests, status, handoff and this plan together.
- [x] Push the implementation commit to `feat/stock-adjustment-phase-c`.
- [x] Move `stock-adjustment-phase-c` to the same commit.
- [x] Confirm `status=identical`, `ahead_by=0`, `behind_by=0`.
- [x] Update PR #3 description with actual SHA and test results.
- [x] Reconfirm PR remains Draft.

## Completion boundary

Automated stabilization is complete. Once the verified commit is pushed to `stock-adjustment-phase-c`, the developer-side deployment responsibility is complete because Vercel deploys the branch automatically. Actual browser interaction belongs to the user, who reports concrete defects for the next repair cycle. PR #3 must stay Draft until the user confirms there is no blocking page defect.
