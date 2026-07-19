import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../stock-adjustment-api.js', import.meta.url), 'utf8');

function loadBrowserApi() {
  const context = { globalThis: {}, console };
  context.window = context.globalThis;
  vm.runInNewContext(source, context, { filename: 'stock-adjustment-api.js' });
  return context.globalThis.StockAdjustmentApi;
}

function fakeClient(handler = async (name, args) => ({ data: { name, args }, error: null })) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return handler(name, args);
    },
  };
}

test('creates an API from an explicitly injected Supabase client', () => {
  const api = loadBrowserApi();
  assert.equal(typeof api.create, 'function');
  assert.throws(() => api.create(), /Supabase client 未初始化/);
  assert.throws(() => api.create({}), /Supabase client 未初始化/);
});

test('saveAndSubmit performs exactly one atomic RPC call with the save argument mapping', async () => {
  const api = loadBrowserApi();
  const client = fakeClient();
  const service = api.create(client);
  const items = [{ product_barcode: 'P1', adjustment_qty: 2 }];

  await service.saveAndSubmit('r1', 'E1', 'damage', '', '', items);

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].name, 'save_and_submit_stock_adjustment_request');
  assert.deepEqual(JSON.parse(JSON.stringify(client.calls[0].args)), {
    p_request_id: 'r1',
    p_employee_code: 'E1',
    p_reason_code: 'damage',
    p_reason_note: null,
    p_remark: null,
    p_items: items,
  });
});

test('keeps the existing stock adjustment RPC methods and adds review history', async () => {
  const api = loadBrowserApi();
  const client = fakeClient();
  const service = api.create(client);

  await service.save('r1', 'E1', 'damage', '', '', [{ product_barcode: 'P1', adjustment_qty: 2 }]);
  await service.submit('r1', 'E1');
  await service.withdraw('r1', 'E1');
  await service.mine('E1', true);
  await service.pending();
  await service.reviewHistory(50);
  await service.approve('r1', 'A1');
  await service.reject('r1', 'A1', '原因');
  await service.movements('2026-07-01', '2026-07-02', 'E1', 'manual_adjustment');

  assert.deepEqual(client.calls.map(call => call.name), [
    'save_stock_adjustment_request',
    'submit_stock_adjustment_request',
    'withdraw_stock_adjustment_request',
    'get_my_stock_adjustment_requests',
    'get_pending_stock_adjustment_requests',
    'get_stock_adjustment_review_history',
    'approve_stock_adjustment_request',
    'reject_stock_adjustment_request',
    'get_inventory_movement_details',
  ]);
  assert.equal(client.calls[5].args.p_limit, 50);
});

test('review history defaults to 100 records', async () => {
  const api = loadBrowserApi();
  const client = fakeClient();
  const service = api.create(client);

  await service.reviewHistory();

  assert.equal(client.calls[0].name, 'get_stock_adjustment_review_history');
  assert.equal(client.calls[0].args.p_limit, 100);
});

test('maps missing RPC errors to a clear deployment message', async () => {
  const api = loadBrowserApi();
  const service = api.create(fakeClient(async () => ({
    data: null,
    error: { code: 'PGRST202', message: 'Could not find the function public.pending in the schema cache' },
  })));

  await assert.rejects(service.pending(), /库存调整功能尚未完成数据库部署，请联系管理员。/);
});

test('preserves non-migration Supabase errors', async () => {
  const api = loadBrowserApi();
  const service = api.create(fakeClient(async () => ({ data: null, error: { code: '42501', message: 'permission denied' } })));
  await assert.rejects(service.pending(), /permission denied/);
});
