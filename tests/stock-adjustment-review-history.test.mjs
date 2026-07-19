import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sql = fs.readFileSync(new URL('../database/20260713_stock_adjustment_review_history.sql', import.meta.url), 'utf8').replace(/\s+/g, ' ').toLowerCase();
const api = fs.readFileSync(new URL('../stock-adjustment-api.js', import.meta.url), 'utf8');

test('review history RPC returns only reviewed requests with product display data', () => {
  assert.match(sql, /create or replace function public\.get_stock_adjustment_review_history\(p_limit integer default 100\)/);
  assert.match(sql, /status in \('approved', 'rejected'\)/);
  assert.match(sql, /reviewed_at desc nulls last/);
  assert.match(sql, /product_name/);
  assert.match(sql, /p\.spec/);
  assert.match(sql, /p\.flavor/);
  assert.match(sql, /limit greatest\(1, least\(coalesce\(p_limit, 100\), 500\)\)/);
});

test('review history RPC uses fixed search path and explicit grants', () => {
  assert.match(sql, /security definer set search_path = pg_catalog, public/);
  assert.match(sql, /revoke all on function public\.get_stock_adjustment_review_history\(integer\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.get_stock_adjustment_review_history\(integer\) to anon, authenticated/);
});

test('browser API exposes reviewHistory with a bounded default limit', () => {
  assert.match(api, /reviewHistory:\s*limit\s*=>\s*rpc\('get_stock_adjustment_review_history'/);
  assert.match(api, /p_limit:\s*Number\(limit\) \|\| 100/);
});
