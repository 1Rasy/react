import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../stock-adjustment-core.js');

test('validates non-empty items and non-zero signed quantities', () => {
  assert.equal(core.validateAdjustmentDraft({ reasonCode: 'inventory_count', reasonNote: '', items: [] }), '请至少添加一个商品');
  assert.equal(core.validateAdjustmentDraft({ reasonCode: 'inventory_count', reasonNote: '', items: [{ barcode: '001', adjustmentQty: 0 }] }), '调整数量不能为 0');
  assert.equal(core.validateAdjustmentDraft({ reasonCode: 'other', reasonNote: '  ', items: [{ barcode: '001', adjustmentQty: 2 }] }), '选择“其他”时必须填写说明');
  assert.equal(core.validateAdjustmentDraft({ reasonCode: 'damage', reasonNote: '', items: [{ barcode: '001', adjustmentQty: -2 }] }), '');
});

test('rejects decimal and unsafe adjustment quantities before RPC submission', () => {
  assert.match(core.validateAdjustmentDraft({ reasonCode: 'damage', items: [{ barcode: '001', adjustmentQty: 1.5 }] }), /整数/);
  assert.match(core.validateAdjustmentDraft({ reasonCode: 'damage', items: [{ barcode: '001', adjustmentQty: Number.MAX_SAFE_INTEGER + 1 }] }), /整数/);
});

test('keeps only the four approved reasons', () => {
  assert.deepEqual(Object.keys(core.REASONS), ['inventory_count', 'damage', 'transfer', 'other']);
  assert.equal(core.reasonLabel('missed_receipt'), 'missed_receipt');
});

test('calculates signed loose-piece adjustment only and allows negative projected stock', () => {
  assert.equal(core.signedAdjustment({ direction: 'minus', cases: 1, boxes: 1, pieces: 1 }, { pcsPerCase: 12, pcsPerBox: 4 }), -1);
  assert.equal(core.projectedStock(3, -17), -14);
});

test('formats status and product description without technical placeholders', () => {
  assert.equal(core.statusLabel('pending_review'), '待审核');
  assert.equal(core.formatSpecFlavor({ spec: null, flavor: '原味' }), '原味');
  assert.equal(core.formatSpecFlavor({ spec: '  ', flavor: undefined }), '');
  assert.equal(core.formatSpecFlavor({ spec: '90g', flavor: '巧克力' }), '90g 巧克力');
});

test('builds an inclusive Shanghai business-date range as a half-open interval', () => {
  assert.deepEqual(core.buildShanghaiDateRange('2026-07-01', '2026-07-12'), {
    startDate: '2026-07-01',
    endExclusiveDate: '2026-07-13'
  });
});
