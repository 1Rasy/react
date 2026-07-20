import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
  buildStockExportRows,
  buildStockSummaryRows,
  compareStockProducts,
  createStockSummaryWorkbook,
  formatStockUnits,
  forceStockBarcodeTextCells,
  mergeStockImportRows,
  missingStockImportValues,
  normalizeImportCode,
  parseImportQuantity,
  parseStockImportRows,
  productSortValue,
  splitStockImportChunks,
  stockExportFileName,
  stockImportConfirmation,
  stockImportSuccessMessage,
  stockSummaryMetrics,
  toggleExpandedEmployee
} from '../src/domain/stock-summary.ts';
import { createStockSummaryRepository } from '../src/services/stock-summary-repository.ts';
import { createStockImportController } from '../src/stock-summary/StockImportController.ts';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function loadLegacyStockSummary() {
  const html = read('stock_summary-legacy.html');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const source = scripts.find(script => script.includes('function productSortValue'));
  assert.ok(source, 'legacy stock summary inline script should remain available');
  const context = {
    console,
    document: {
      getElementById(id) {
        if (id === 'searchInput') return { value: context.searchValue || '' };
        return { className: '', textContent: '', innerHTML: '' };
      }
    },
    searchValue: '',
    supabase: { createClient: () => ({}) },
    XLSX: { utils: { sheet_to_json: worksheet => worksheet } }
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/\bloadAll\(\);\s*$/, ''), context);
  return {
    call(expression) {
      return vm.runInContext(expression, context);
    },
    context
  };
}

function jsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

const employees = [
  { employee_code: 'E2', name: '李四', is_active: false },
  { employee_code: 'E10', name: '张三', is_active: true }
];
const products = [
  { id: 2, sort_order: 0, barcode: '0002', spec: '90g', flavor: '原味', pcs_per_case: 24, pcs_per_box: 6, unit: '个' },
  { id: 1, sort_order: 5, barcode: '0001', spec: '40g', flavor: '', pcs_per_case: 12, pcs_per_box: 0, unit: '袋' },
  { id: 3, sort_order: null, barcode: '0003', spec: '', flavor: '', pcs_per_case: 0, pcs_per_box: 0, unit: '个' }
];
const stocks = [
  { employee_code: 'E10', product_barcode: '0002', qty: -7, updated_at: '2026-07-20T02:00:00Z' },
  { employee_code: 'E10', product_barcode: '0001', qty: 12, updated_at: '2026-07-19T02:00:00Z' },
  { employee_code: 'E2', product_barcode: '0003', qty: 0, updated_at: '2026-07-18T02:00:00Z' }
];

test('React stock summary grouping, search and ordering match the preserved legacy implementation', () => {
  const legacy = loadLegacyStockSummary();
  const legacyRows = legacy.call(`
    stocks=${JSON.stringify(stocks)};
    employees=${JSON.stringify(employees)};
    products=${JSON.stringify(products)}.sort(compareProducts);
    employeeMap=new Map(employees.map(emp=>[String(emp.employee_code||''),emp]));
    productMap=new Map(products.map(product=>[String(product.barcode||''),product]));
    buildRows();
  `);
  const reactRows = buildStockSummaryRows(stocks, employees, [...products].sort(compareStockProducts));
  assert.deepEqual(reactRows, jsonValue(legacyRows));

  legacy.context.searchValue = '原味';
  const legacyFiltered = jsonValue(legacy.call('buildRows()'));
  const reactFiltered = buildStockSummaryRows(stocks, employees, products, '原味');
  assert.deepEqual(reactFiltered, legacyFiltered);
  assert.equal(reactFiltered.length, 1);
  assert.equal(reactFiltered[0].items.length, 1);
  assert.deepEqual(stockSummaryMetrics(stocks), { totalEmployees: 2, recordCount: 3, totalQty: 5 });
});

test('product display fallback, sort values, stock-unit conversion and expansion semantics stay compatible', () => {
  const legacy = loadLegacyStockSummary();
  for (const product of products) {
    assert.equal(productSortValue(product), legacy.call(`productSortValue(${JSON.stringify(product)})`));
  }
  assert.equal(productSortValue({ id: 7, sort_order: -1 }), 70);
  assert.equal(productSortValue({ id: 0, sort_order: null }), 999999);
  assert.equal(formatStockUnits(-31, { pcs_per_case: 24, pcs_per_box: 6, unit: '个' }), '-1件 1盒 1个');
  assert.equal(formatStockUnits(-25, { pcs_per_case: 24, pcs_per_box: 0, unit: '袋' }), '-1件 1袋');
  assert.equal(formatStockUnits(-2, { pcs_per_case: 0, pcs_per_box: 0, unit: '个' }), '-2个');
  assert.equal(formatStockUnits(-31, { pcs_per_case: 24, pcs_per_box: 6, unit: '个' }), legacy.call("formatStockUnits(-31,{pcs_per_case:24,pcs_per_box:6,unit:'个'})"));
  assert.equal(toggleExpandedEmployee('', 'E1'), 'E1');
  assert.equal(toggleExpandedEmployee('E1', 'E2'), 'E2');
  assert.equal(toggleExpandedEmployee('E2', 'E2'), '');
});

test('export rows, text barcodes, widths, sheet name and ISO filename preserve the contract', () => {
  const rows = buildStockSummaryRows(stocks, employees, products, 'E10');
  const exportRows = buildStockExportRows(rows);
  assert.deepEqual(exportRows[0], ['员工名字', '员工号', '规格口味', '条码', '库存散数']);
  assert.equal(exportRows[1][3], '0001');
  assert.equal(exportRows[2][3], '0002');

  const capture = {};
  const xlsx = {
    utils: {
      aoa_to_sheet(data) {
        capture.data = data;
        return { D2: { v: 1, t: 'n' }, D3: { v: '0002', t: 's' } };
      },
      book_new() { return { sheets: [] }; },
      book_append_sheet(workbook, worksheet, name) {
        capture.workbook = workbook;
        capture.worksheet = worksheet;
        capture.sheetName = name;
      }
    }
  };
  const workbook = createStockSummaryWorkbook(xlsx, rows);
  assert.equal(workbook, capture.workbook);
  assert.deepEqual(capture.data, exportRows);
  assert.equal(capture.sheetName, '库存管理');
  assert.deepEqual(capture.worksheet['!cols'], [14, 14, 38, 18, 12].map(wch => ({ wch })));
  assert.deepEqual(capture.worksheet.D2, { v: '1', t: 's', z: '@' });
  assert.deepEqual(capture.worksheet.D3, { v: '0002', t: 's', z: '@' });
  assert.equal(stockExportFileName(new Date('2026-07-20T23:59:59-08:00')), '库存管理_2026-07-21.xlsx');

  const directSheet = { D2: { v: 1234567890123, t: 'n' } };
  forceStockBarcodeTextCells(directSheet, 1);
  assert.deepEqual(directSheet.D2, { v: '1234567890123', t: 's', z: '@' });
});

test('import parsing matches legacy A/B/C rules including .0 codes, commas, headers and invalid rows', () => {
  const matrix = [
    ['员工编号', 'barcode', '数量'],
    ['', '', ''],
    ['1001.0', '000123.0', '1,200'],
    ['E02', '69002', '-3'],
    ['E03', '69003', '2.5'],
    ['', '69004', '1']
  ];
  const reactResult = parseStockImportRows(matrix);
  const legacy = loadLegacyStockSummary();
  const legacyResult = jsonValue(legacy.call(`parseStockImportRows(${JSON.stringify(matrix)})`));
  assert.deepEqual(reactResult, legacyResult);
  assert.deepEqual(reactResult.parsed, [
    { line: 3, employee_code: '1001', product_barcode: '000123', qty: 1200 },
    { line: 4, employee_code: 'E02', product_barcode: '69002', qty: -3 }
  ]);
  assert.equal(reactResult.errors.length, 2);
  assert.equal(normalizeImportCode('001.0'), '001');
  assert.equal(normalizeImportCode('E01.0'), 'E01.0');
  assert.equal(parseImportQuantity('1,234'), 1234);
  assert.equal(Number.isNaN(parseImportQuantity('')), true);
});

test('import deduplication is last-row-wins and validation helpers retain ordering', () => {
  const parsed = [
    { line: 1, employee_code: 'E1', product_barcode: 'P1', qty: 1 },
    { line: 2, employee_code: 'E2', product_barcode: 'P2', qty: 2 },
    { line: 3, employee_code: 'E1', product_barcode: 'P1', qty: 9 }
  ];
  assert.deepEqual(mergeStockImportRows(parsed), {
    rows: [
      { employee_code: 'E1', product_barcode: 'P1', qty: 9 },
      { employee_code: 'E2', product_barcode: 'P2', qty: 2 }
    ],
    duplicateCount: 1
  });
  assert.deepEqual(missingStockImportValues(parsed, new Set(['E1']), new Set(['P2'])), {
    missingEmployees: ['E2'],
    missingProducts: ['P1']
  });
  assert.deepEqual(splitStockImportChunks(Array.from({ length: 1001 }, (_, index) => index)).map(chunk => chunk.length), [500, 500, 1]);
  assert.match(stockImportConfirmation([{ employee_code: 'S260401018', product_barcode: 'P1', qty: 1 }]), /原68条保留库存会由本文件中的期初库存替换/);
  assert.match(stockImportConfirmation([{ employee_code: 'E1', product_barcode: 'P1', qty: 1 }]), /原68条保留库存保持不变/);
  assert.equal(stockImportSuccessMessage({
    result: { imported_baseline_rows: 1, written_stock_rows: 3, employees: 1 },
    rows: [{ employee_code: 'E1', product_barcode: 'P1', qty: -2 }],
    duplicateCount: 2,
    loadedStockCount: 12
  }), '导入完成：期初库存 1 条，重算库存 3 条，页面已读取 12 条完整库存，涉及 1 名员工，负数期初库存 1 条，重复行按最后一行覆盖 2 条。');
});

function createQueryClient(pageFactory) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      calls.push(['from', table]);
      const builder = {
        select(columns) {
          calls.push(['select', table, columns]);
          return builder;
        },
        order(column, options) {
          calls.push(['order', table, column, options]);
          return builder;
        },
        range(from, to) {
          calls.push(['range', table, from, to]);
          return Promise.resolve({ data: pageFactory(table, from, to), error: null });
        },
        in(column, values) {
          calls.push(['in', table, column, values]);
          return Promise.resolve({ data: values.map(value => ({ [column]: value })), error: null });
        }
      };
      return builder;
    },
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return Promise.resolve({ data: { imported_baseline_rows: 1 }, error: null });
    }
  };
  return client;
}

test('repository starts van_stocks, employees and products in the fixed order with exact fields and sort columns', async () => {
  const client = createQueryClient(() => []);
  const repository = createStockSummaryRepository(client);
  assert.deepEqual(await repository.loadSummary(), { stocks: [], employees: [], products: [] });
  assert.deepEqual(client.calls, [
    ['from', 'van_stocks'],
    ['select', 'van_stocks', 'employee_code, product_barcode, qty, updated_at'],
    ['order', 'van_stocks', 'employee_code', { ascending: true, nullsFirst: false }],
    ['order', 'van_stocks', 'product_barcode', { ascending: true, nullsFirst: false }],
    ['range', 'van_stocks', 0, 999],
    ['from', 'employees'],
    ['select', 'employees', 'employee_code, name, is_active'],
    ['order', 'employees', 'employee_code', { ascending: true, nullsFirst: false }],
    ['range', 'employees', 0, 999],
    ['from', 'products'],
    ['select', 'products', 'id, sort_order, barcode, brand, spec, flavor, pcs_per_case, pcs_per_box, unit, is_active'],
    ['order', 'products', 'sort_order', { ascending: true, nullsFirst: false }],
    ['order', 'products', 'id', { ascending: true, nullsFirst: false }],
    ['range', 'products', 0, 999]
  ]);
});

test('repository paginates by inclusive 1000-row ranges and rejects a full 100000-row safety window', async () => {
  const oneThousand = Array.from({ length: 1000 }, (_, index) => ({ employee_code: `E${index}` }));
  const pagedClient = createQueryClient((table, from) => {
    if (table !== 'van_stocks') return [];
    return from === 0 ? oneThousand : from === 1000 ? [{ employee_code: 'last' }] : [];
  });
  const pageData = await createStockSummaryRepository(pagedClient).loadSummary();
  assert.equal(pageData.stocks.length, 1001);
  assert.deepEqual(pagedClient.calls.filter(call => call[0] === 'range' && call[1] === 'van_stocks'), [
    ['range', 'van_stocks', 0, 999],
    ['range', 'van_stocks', 1000, 1999]
  ]);

  const cappedClient = createQueryClient(table => table === 'van_stocks' ? oneThousand : []);
  await assert.rejects(createStockSummaryRepository(cappedClient).loadSummary(), /van_stocks 数据超过安全读取上限/);
  const stockRanges = cappedClient.calls.filter(call => call[0] === 'range' && call[1] === 'van_stocks');
  assert.equal(stockRanges.length, 100);
  assert.deepEqual(stockRanges.at(-1), ['range', 'van_stocks', 99000, 99999]);
});

test('repository validates existence in 500-value chunks and calls only the baseline RPC with exact arguments', async () => {
  const client = createQueryClient(() => []);
  const repository = createStockSummaryRepository(client);
  const codes = Array.from({ length: 1001 }, (_, index) => `E${index}`);
  const existing = await repository.existingEmployees(codes);
  assert.equal(existing.size, 1001);
  assert.deepEqual(client.calls.filter(call => call[0] === 'in').map(call => call[3].length), [500, 500, 1]);

  const rows = [{ employee_code: 'E1', product_barcode: 'P1', qty: -2 }];
  assert.deepEqual(await repository.importBaseline(rows), { imported_baseline_rows: 1 });
  assert.deepEqual(client.calls.at(-1), ['rpc', 'import_van_stock_baseline', {
    p_baseline_id: '2026-07-01-opening',
    p_rows: rows,
    p_cutoff: '2026-07-01T00:00:00+08:00'
  }]);
});

function importXlsx(matrix, calls) {
  return {
    read(_buffer, options) {
      calls.push(['read', options]);
      return { SheetNames: ['第一页'], Sheets: { 第一页: matrix } };
    },
    utils: {
      sheet_to_json(worksheet, options) {
        calls.push(['sheet_to_json', options]);
        return worksheet;
      }
    }
  };
}

test('import controller cancellation never calls RPC and invalid rows show only the first 12 errors', async () => {
  const calls = [];
  const repository = {
    existingEmployees(values) { calls.push(['employees', values]); return Promise.resolve(new Set(values)); },
    existingProducts(values) { calls.push(['products', values]); return Promise.resolve(new Set(values)); },
    importBaseline() { calls.push(['rpc']); return Promise.resolve({}); }
  };
  const controller = createStockImportController({
    repository,
    xlsx: importXlsx([['E1', 'P1', '1']], calls),
    confirm(message) { calls.push(['confirm', message]); return false; },
    alert(message) { calls.push(['alert', message]); }
  });
  const outcome = await controller.importFile({
    file: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) },
    reload: async () => { calls.push(['reload']); return { stockCount: 1 }; },
    setStatus: status => calls.push(['status', status.text])
  });
  assert.equal(outcome, 'cancelled');
  assert.equal(calls.some(call => call[0] === 'rpc'), false);
  assert.equal(calls.some(call => call[0] === 'reload'), false);
  assert.equal(calls.at(-1)[1], '已取消导入');

  const invalidCalls = [];
  const invalidMatrix = Array.from({ length: 15 }, (_, index) => [`E${index}`, '', 'bad']);
  const invalidController = createStockImportController({
    repository,
    xlsx: importXlsx(invalidMatrix, invalidCalls),
    confirm: () => true,
    alert: message => invalidCalls.push(['alert', message])
  });
  assert.equal(await invalidController.importFile({
    file: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) },
    reload: async () => ({ stockCount: 0 }),
    setStatus: status => invalidCalls.push(['status', status.text])
  }), 'invalid');
  const alertMessage = invalidCalls.find(call => call[0] === 'alert')[1];
  assert.match(alertMessage, /共 15 行格式错误/);
  assert.match(alertMessage, /第 12 行格式错误/);
  assert.doesNotMatch(alertMessage, /第 13 行格式错误/);
});

test('import controller validates in parallel, writes once, fully reloads, then builds success copy', async () => {
  const calls = [];
  const repository = {
    existingEmployees(values) { calls.push(['employees', values]); return Promise.resolve(new Set(values)); },
    existingProducts(values) { calls.push(['products', values]); return Promise.resolve(new Set(values)); },
    importBaseline(rows) { calls.push(['rpc', rows]); return Promise.resolve({ imported_baseline_rows: 1, written_stock_rows: 7, employees: 1 }); }
  };
  const controller = createStockImportController({
    repository,
    xlsx: importXlsx([['E1', 'P1', '-1'], ['E1', 'P1', '-2']], calls),
    confirm(message) { calls.push(['confirm', message]); return true; },
    alert(message) { calls.push(['alert', message]); }
  });
  const outcome = await controller.importFile({
    file: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) },
    reload: async () => { calls.push(['reload']); return { stockCount: 44 }; },
    setStatus: status => calls.push(['status', status.text])
  });
  assert.equal(outcome, 'success');
  assert.ok(calls.findIndex(call => call[0] === 'employees') < calls.findIndex(call => call[0] === 'products'));
  assert.ok(calls.findIndex(call => call[0] === 'products') < calls.findIndex(call => call[0] === 'confirm'));
  assert.deepEqual(calls.find(call => call[0] === 'rpc')[1], [{ employee_code: 'E1', product_barcode: 'P1', qty: -2 }]);
  assert.ok(calls.findIndex(call => call[0] === 'rpc') < calls.findIndex(call => call[0] === 'reload'));
  assert.match(calls.at(-1)[1], /页面已读取 44 条完整库存/);
  assert.match(calls.at(-1)[1], /重复行按最后一行覆盖 1 条/);
});

test('React components never call Supabase directly and always reset the file input', () => {
  const page = read('src/stock-summary/StockSummaryPage.tsx');
  const table = read('src/stock-summary/StockSummaryTable.tsx');
  const controller = read('src/stock-summary/StockImportController.ts');
  const repository = read('src/services/stock-summary-repository.ts');
  for (const source of [page, table]) {
    assert.doesNotMatch(source, /client\.(from|rpc)\(/);
  }
  assert.match(controller, /repository\.importBaseline\(rows\)/);
  assert.match(repository, /client\.rpc\('import_van_stock_baseline'/);
  assert.doesNotMatch(repository, /from\('van_stocks'\)\.(upsert|update|delete)/);
  assert.match(page, /finally\s*\{\s*input\.value = '';/);
});
