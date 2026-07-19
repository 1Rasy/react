import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  createReviewActionGuard,
  employeeName,
  formatSpecFlavor,
  historyStatusMeta,
  quantityClass,
  reasonLabel,
  requestDetailNote,
  reviewMetrics,
  signedQuantity,
  stockBeforeByBarcode
} from '../src/domain/stock-adjustment-review.ts';
import { createStockAdjustmentReviewRepository } from '../src/services/stock-adjustment-review-repository.ts';

const require = createRequire(import.meta.url);
const legacyCore = require('../stock-adjustment-core.js');

test('React review domain preserves legacy labels, product display and signed quantity semantics', () => {
  for (const code of ['inventory_count', 'damage', 'transfer', 'other', 'future_reason']) {
    assert.equal(reasonLabel(code), legacyCore.reasonLabel(code));
  }
  const products = [
    { spec: ' 90g ', flavor: ' 原味 ' },
    { spec: '', flavor: '巧克力' },
    { spec: null, flavor: undefined }
  ];
  products.forEach(product => assert.equal(formatSpecFlavor(product), legacyCore.formatSpecFlavor(product)));
  assert.equal(signedQuantity(3), '+3');
  assert.equal(signedQuantity(-3), '-3');
  assert.equal(quantityClass(3), 'qty-positive');
  assert.equal(quantityClass(-3), 'qty-negative');
  assert.equal(quantityClass(0), 'qty-zero');
});

test('React review metrics, notes, stock lookup, history status and employee fallback match legacy behavior', () => {
  const rows = [{ items: [{}, {}] }, { items: null }, {}];
  assert.deepEqual(reviewMetrics(rows), { requestCount: 3, itemCount: 2 });
  assert.equal(requestDetailNote({ reason_note: '补充', remark: '备注内容' }), '补充；备注：备注内容');
  assert.equal(requestDetailNote({}), '');
  assert.deepEqual(historyStatusMeta('approved'), { label: '已通过', className: 'status-approved' });
  assert.deepEqual(historyStatusMeta('rejected'), { label: '已驳回', className: 'status-rejected' });
  assert.equal(employeeName(new Map([['E01', '张三']]), 'E01'), '张三');
  assert.equal(employeeName(new Map(), 'E02'), '—');

  const stock = stockBeforeByBarcode({ stocks: [
    { product_barcode: 'P1', qty: '2' },
    { product_barcode: 'P1', qty: '5' }
  ] });
  assert.equal(stock.get('P1'), 5);
});

test('repository preserves pending-history-employees request order and response normalization', async () => {
  const calls = [];
  const pendingRows = [{ request: { id: 'pending-1' } }];
  const historyRows = [{ request: { id: 'history-1' } }];
  const employees = [{ employee_code: 'E01', name: '张三' }];
  const client = {
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return Promise.resolve({
        data: name === 'get_pending_stock_adjustment_requests' ? pendingRows : historyRows,
        error: null
      });
    },
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return Promise.resolve({ data: employees, error: null });
        }
      };
    }
  };

  const repository = createStockAdjustmentReviewRepository(client);
  assert.deepEqual(await repository.loadReviewPage(), { pendingRows, historyRows, employees });
  assert.deepEqual(calls, [
    ['rpc', 'get_pending_stock_adjustment_requests', {}],
    ['rpc', 'get_stock_adjustment_review_history', { p_limit: 100 }],
    ['from', 'employees'],
    ['select', 'employee_code,name']
  ]);
});

test('repository preserves approve and reject RPC parameter names and call order', async () => {
  const calls = [];
  const repository = createStockAdjustmentReviewRepository({
    rpc(name, args) {
      calls.push([name, args]);
      return Promise.resolve({ data: null, error: null });
    }
  });

  await repository.approve('R1', 'ADMIN1');
  await repository.reject('R2', 'ADMIN2', '数量不符');

  assert.deepEqual(calls, [
    ['approve_stock_adjustment_request', { p_request_id: 'R1', p_admin_code: 'ADMIN1' }],
    ['reject_stock_adjustment_request', {
      p_request_id: 'R2',
      p_admin_code: 'ADMIN2',
      p_rejection_reason: '数量不符'
    }]
  ]);
});

test('repository keeps the missing-RPC Chinese deployment hint for returned and thrown errors', async () => {
  const returned = createStockAdjustmentReviewRepository({
    rpc() {
      return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'schema cache' } });
    }
  });
  await assert.rejects(returned.approve('R1', 'ADMIN'), /库存调整功能尚未完成数据库部署，请联系管理员。/);

  const thrown = createStockAdjustmentReviewRepository({
    rpc() {
      throw { code: '42883', message: 'function approve does not exist' };
    }
  });
  await assert.rejects(thrown.reject('R1', 'ADMIN', '原因'), /库存调整功能尚未完成数据库部署，请联系管理员。/);
});

test('review action guard rejects a second submission until the first one finishes', () => {
  const guard = createReviewActionGuard();
  assert.equal(guard.begin(), true);
  assert.equal(guard.isActive(), true);
  assert.equal(guard.begin(), false);
  guard.end();
  assert.equal(guard.isActive(), false);
  assert.equal(guard.begin(), true);
});
