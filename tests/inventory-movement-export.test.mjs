import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const exporter = require('../inventory-movement-export.js');

test('exports the fixed A-K columns and raw signed quantity', () => {
  assert.deepEqual(exporter.INVENTORY_EXPORT_HEADERS, [
    '工号', '条码', '规格口味', '库存变化原因', '库存变动数量', '库存变动时间',
    '库存变化类型', '来源单号', '变动前库存', '变动后库存', '操作人'
  ]);
  const rows = exporter.buildInventoryExportRows([{
    employee_code: 'E01', product_barcode: '0012345678901', spec: '90g', flavor: null,
    reason_display: '盘点差异', quantity_delta: -3, occurred_at: '2026-07-12T01:02:03Z',
    movement_type: 'manual_adjustment', source_no: 'SA202607120001', quantity_before: 2,
    quantity_after: -1, operator_code: 'ADMIN'
  }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][1], '0012345678901');
  assert.equal(rows[1][2], '90g');
  assert.equal(rows[1][4], -3);
  assert.equal(rows[1][6], '人工库存调整');
  assert.equal(rows[1].length, 11);
});

test('forces barcode cells to Excel text format', () => {
  const sheet = { B2: { v: 1234567890123, t: 'n' }, B3: { v: '000123', t: 's' } };
  exporter.forceBarcodeTextCells(sheet, 2);
  assert.deepEqual(sheet.B2, { v: '1234567890123', t: 's', z: '@' });
  assert.deepEqual(sheet.B3, { v: '000123', t: 's', z: '@' });
});

test('uses the selected date range in the xlsx filename', () => {
  assert.equal(exporter.inventoryExportFileName('2026-07-01', '2026-07-12'), '库存变动明细_20260701_20260712.xlsx');
});

