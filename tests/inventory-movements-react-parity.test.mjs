import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  INVENTORY_EXPORT_HEADERS,
  buildInventoryExportRows,
  forceBarcodeTextCells,
  formatSpecFlavor,
  inventoryExportFileName,
  inventoryMovementTypeLabel,
  normalizedCustomRange,
  quantityClass,
  resolveInventoryDateRange,
  signedQuantity
} from '../src/domain/inventory-movements.ts';
import { createInventoryMovementRepository } from '../src/services/inventory-movement-repository.ts';

const require = createRequire(import.meta.url);
const legacyExporter = require('../inventory-movement-export.js');

const sampleMovements = [{
  employee_code: 'E01',
  product_barcode: '0012345678901',
  spec: '90g',
  flavor: '原味',
  reason_display: '盘点差异',
  quantity_delta: -3,
  occurred_at: '2026-07-12T01:02:03Z',
  movement_type: 'manual_adjustment',
  source_no: 'SA202607120001',
  quantity_before: 2,
  quantity_after: -1,
  operator_code: 'ADMIN'
}];

test('React export model stays byte-for-byte compatible with legacy A-K values', () => {
  assert.deepEqual(INVENTORY_EXPORT_HEADERS, legacyExporter.INVENTORY_EXPORT_HEADERS);
  assert.deepEqual(buildInventoryExportRows(sampleMovements), legacyExporter.buildInventoryExportRows(sampleMovements));
  assert.equal(inventoryExportFileName('2026-07-01', '2026-07-12'), legacyExporter.inventoryExportFileName('2026-07-01', '2026-07-12'));

  const reactSheet = { B2: { v: 1234567890123, t: 'n' }, B3: { v: '000123', t: 's' } };
  const legacySheet = structuredClone(reactSheet);
  forceBarcodeTextCells(reactSheet, 2);
  legacyExporter.forceBarcodeTextCells(legacySheet, 2);
  assert.deepEqual(reactSheet, legacySheet);
});

test('React row labels, signed quantities, colors and custom date rules match legacy behavior', () => {
  assert.equal(formatSpecFlavor({ spec: ' 90g ', flavor: ' 原味 ' }), '90g 原味');
  assert.equal(formatSpecFlavor({ spec: '', flavor: null }), '');
  assert.equal(quantityClass(3), 'qty-positive');
  assert.equal(quantityClass(-3), 'qty-negative');
  assert.equal(quantityClass(0), 'qty-zero');
  assert.equal(signedQuantity(3), '+3');
  assert.equal(signedQuantity(-3), '-3');
  assert.equal(inventoryMovementTypeLabel('manual_adjustment'), '人工库存调整');
  assert.equal(inventoryMovementTypeLabel('future_type'), 'future_type');
  assert.deepEqual(normalizedCustomRange('2026-07-12', '2026-07-01'), { start: '2026-07-01', end: '2026-07-12' });
  assert.deepEqual(resolveInventoryDateRange('all', '', '', '2026-07-19'), { startDate: '2000-01-01', endDate: '2026-07-19' });
  assert.deepEqual(resolveInventoryDateRange('custom', '2026-07-12', '', '2026-07-19'), { startDate: '2026-07-12', endDate: '2026-07-12' });
});

test('repository preserves employee-first loading and the exact movement RPC contract', async () => {
  const calls = [];
  const employees = [{ employee_code: 'E01', name: '张三' }];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            eq(column, value) {
              calls.push(['eq', column, value]);
              return {
                order(columnName) {
                  calls.push(['order', columnName]);
                  return Promise.resolve({ data: employees, error: null });
                }
              };
            }
          };
        }
      };
    },
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return Promise.resolve({ data: sampleMovements, error: null });
    }
  };
  const repository = createInventoryMovementRepository(client);

  assert.deepEqual(await repository.listEmployees(), employees);
  assert.deepEqual(await repository.listMovements({
    startDate: '2026-07-01',
    endDate: '2026-07-12',
    employeeCode: 'E01',
    movementType: 'manual_adjustment'
  }), sampleMovements);
  assert.deepEqual(calls, [
    ['from', 'employees'],
    ['select', 'employee_code,name'],
    ['eq', 'is_active', true],
    ['order', 'employee_code'],
    ['rpc', 'get_inventory_movement_details', {
      p_start_date: '2026-07-01',
      p_end_date: '2026-07-12',
      p_employee_code: 'E01',
      p_movement_type: 'manual_adjustment'
    }]
  ]);
});

test('repository sends null optional filters and keeps missing-RPC user copy', async () => {
  const calls = [];
  const repository = createInventoryMovementRepository({
    rpc(name, args) {
      calls.push([name, args]);
      return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'schema cache' } });
    }
  });

  await assert.rejects(repository.listMovements({
    startDate: '2000-01-01',
    endDate: '2026-07-19',
    employeeCode: '',
    movementType: ''
  }), /库存调整功能尚未完成数据库部署，请联系管理员。/);
  assert.deepEqual(calls[0], ['get_inventory_movement_details', {
    p_start_date: '2000-01-01',
    p_end_date: '2026-07-19',
    p_employee_code: null,
    p_movement_type: null
  }]);
});
