import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const baseSql = fs.readFileSync(new URL('../database/20260712_stock_adjustment_phase_c.sql', import.meta.url), 'utf8');
const atomicSql = fs.readFileSync(new URL('../database/20260712_stock_adjustment_atomic_submit.sql', import.meta.url), 'utf8');
const compact = baseSql.replace(/\s+/g, ' ').toLowerCase();
const atomic = atomicSql.replace(/\s+/g, ' ').toLowerCase();

test('creates the request, history, item and unified movement tables', () => {
  for (const table of ['stock_adjustment_requests', 'stock_adjustment_request_items', 'stock_adjustment_request_history', 'inventory_movements']) {
    assert.match(compact, new RegExp(`create table(?: if not exists)? public\\.${table}`));
  }
  assert.match(compact, /adjustment_qty[^,]+check\s*\(adjustment_qty <> 0\)/);
  assert.match(compact, /unique \(request_id, product_barcode\)/);
});

test('enforces one pending request per employee and immutable idempotent movements', () => {
  assert.match(compact, /create unique index[^;]+employee_code[^;]+where status = 'pending_review'/);
  assert.match(compact, /idempotency_key[^,]+unique/);
  assert.match(compact, /before update or delete on public\.inventory_movements/);
});

test('provides all RPCs with safe definer settings and explicit grants', () => {
  for (const fn of [
    'save_stock_adjustment_request', 'submit_stock_adjustment_request', 'withdraw_stock_adjustment_request',
    'reject_stock_adjustment_request', 'approve_stock_adjustment_request', 'get_my_stock_adjustment_requests',
    'get_pending_stock_adjustment_requests', 'get_inventory_movement_details'
  ]) assert.match(compact, new RegExp(`function public\\.${fn}\\(`));
  assert.match(compact, /security definer set search_path = pg_catalog, public/);
  assert.match(compact, /revoke all on[^;]+from public, anon, authenticated/);
  assert.match(compact, /grant execute on function[^;]+to anon, authenticated/);
});

test('adds one atomic save-and-submit RPC in a new migration', () => {
  assert.match(atomic, /create or replace function public\.save_and_submit_stock_adjustment_request\(/);
  assert.match(atomic, /returns jsonb language plpgsql security definer set search_path = pg_catalog, public/);
  assert.match(atomic, /public\.save_stock_adjustment_request\(/);
  assert.match(atomic, /public\.submit_stock_adjustment_request\(/);
  assert.ok(atomic.indexOf('public.save_stock_adjustment_request(') < atomic.indexOf('public.submit_stock_adjustment_request('));
  assert.doesNotMatch(atomic, /exception\s+when/);
});

test('atomic submit permits only the four approved UI reasons and validates other notes', () => {
  assert.match(atomic, /p_reason_code not in \('inventory_count','damage','transfer','other'\)/);
  assert.match(atomic, /p_reason_code = 'other'[^;]+reason note is required/);
  assert.doesNotMatch(atomic, /missed_receipt|漏录入库/);
});

test('atomic RPC has explicit public revocation and client grants', () => {
  assert.match(atomic, /revoke all on function public\.save_and_submit_stock_adjustment_request\(uuid,text,text,text,text,jsonb\) from public, anon, authenticated/);
  assert.match(atomic, /grant execute on function public\.save_and_submit_stock_adjustment_request\(uuid,text,text,text,text,jsonb\) to anon, authenticated/);
});

test('approval locks current stock and writes inventory plus ledger in one function', () => {
  const start = compact.indexOf('function public.approve_stock_adjustment_request(');
  const end = compact.indexOf('function public.get_my_stock_adjustment_requests(', start);
  const approval = compact.slice(start, end);
  assert.match(approval, /for update/);
  assert.match(approval, /insert into public\.van_stocks/);
  assert.match(approval, /update public\.van_stocks/);
  assert.match(approval, /insert into public\.inventory_movements/);
  assert.match(approval, /quantity_before/);
  assert.match(approval, /quantity_after/);
  assert.match(approval, /status = 'approved'/);
});

test('rejects non-integer JSON quantities before bigint conversion and returns product review data', () => {
  assert.match(compact, /adjustment_qty.*integer|required|invalid integer/);
  assert.match(compact, /product_name/);
  assert.match(compact, /p\.spec/);
  assert.match(compact, /p\.flavor/);
});

test('movement query uses Shanghai inclusive end-date semantics', () => {
  assert.match(compact, /at time zone 'asia\/shanghai'/);
  assert.match(compact, /p_end_date \+ 1/);
  assert.match(compact, /m\.occurred_at < v_end_exclusive/);
});
