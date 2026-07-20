import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
  CT_IMPORT_CONFIG,
  DEALER_OUTBOUND_EMPTY_EXCEL_ERROR,
  DEALER_OUTBOUND_EMPTY_WHITELIST_ERROR,
  DEALER_OUTBOUND_FILE_TYPE_ERROR,
  buildCtDealerOutboundRows,
  ctDealerOutboundZeroRowsError,
  dealerOutboundImportUid,
  hash16,
  isDealerOutboundExcelFileName,
  makeCtDealerOutboundRow,
  normalizeCtCells,
  normalizeDealerOutboundBarcode,
  normalizeDealerOutboundDate
} from '../src/domain/dealer-outbound-import.ts';
import { createDealerOutboundImportRepository } from '../src/services/dealer-outbound-import-repository.ts';
import { createCtDealerOutboundImportController } from '../src/stock-ct/DealerOutboundImportController.ts';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function loadLegacyStockCt() {
  const html = read('stock_ct-legacy.html');
  const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .find(script => script.includes('function hash16'));
  assert.ok(source, 'legacy stock CT inline script should remain available');
  const element = {
    addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    innerText: '',
    disabled: true
  };
  const context = {
    alert() {},
    console,
    document: { getElementById: () => element },
    FileReader: class {},
    setTimeout,
    supabase: { createClient: () => ({}) },
    XLSX: {}
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return expression => vm.runInContext(expression, context);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function row(values = {}) {
  const cells = Array(27).fill('');
  Object.entries(values).forEach(([index, value]) => { cells[Number(index)] = value; });
  return cells;
}

function withoutRemovedSpecialField(value) {
  const copy = { ...plain(value) };
  delete copy.is_triple_spec_direct;
  return copy;
}

const header = row({
  0: '制单日期', 2: '商品名称', 3: '包装', 5: '件', 6: '散',
  16: '客户编号', 17: '客户名称', 23: '单号', 26: '条形码'
});
const valid = row({
  0: '2026/07/20  08:30:00', 2: '商品一', 3: '1,000', 5: '2', 6: '3',
  16: 'C001', 17: '客户一', 23: 'CT-001', 26: '6924513908032.0'
});

test('React pure data behavior matches legacy CT mapping, tab rows, headers and source row numbers', () => {
  const legacy = loadLegacyStockCt();
  const tabCells = row({
    0: '2026-07-21', 2: '商品二', 3: '12', 5: '4', 6: '5',
    16: 'C001', 17: '客户二', 23: 'CT-002', 26: '69002'
  });
  const matrix = [header, [], valid, [tabCells.join('\t')]];
  const react = buildCtDealerOutboundRows(matrix, new Set(['C001']), 1721433600000);
  const old = plain(legacy(`build(${JSON.stringify(matrix)},new Set(['C001']))`));
  old.payload = old.payload.map(withoutRemovedSpecialField);
  old.payload.forEach(value => { value.import_batch_id = 'CT_1721433600000'; });
  assert.deepEqual(react, old);
  assert.equal(react.payload[0].source_row_no, 3);
  assert.equal(react.payload[1].source_row_no, 4);
  assert.equal(normalizeCtCells([tabCells.join('\t')]).length, 27);
});

test('CT fixed A/C/D/F/G/Q/R/X/AA columns produce the exact legacy payload', () => {
  const result = makeCtDealerOutboundRow(valid, 'CT_123', 8);
  assert.deepEqual(result, {
    import_batch_id: 'CT_123',
    is_processed: false,
    source_row_no: 8,
    order_no: 'CT-001',
    bill_date: '2026-07-20 08:30:00',
    customer_code: 'C001',
    customer_name: '客户一',
    barcode: '6924513908032',
    product_name: '商品一',
    package_reg: 1000,
    qty_piece: 2,
    qty_scatter: 3,
    import_uid: result.import_uid
  });
  assert.deepEqual(CT_IMPORT_CONFIG.required, [23, 16, 26]);
  assert.equal(result.import_batch_id, 'CT_123');
});

test('CT barcode, date, hash16 and import_uid preserve legacy normalization and field order', () => {
  const legacy = loadLegacyStockCt();
  const scientific = row({ ...Object.fromEntries(valid.entries()), 23: 'CT-SCI', 26: '6.924513908032E+12' });
  const result = makeCtDealerOutboundRow(scientific, 'CT_1', 1);
  const key = 'CT-SCI|2026-07-20 08:30:00|6924513908032|2|3';
  assert.equal(normalizeDealerOutboundBarcode('001234.000'), '001234');
  assert.equal(normalizeDealerOutboundBarcode('6.924513908032E+12'), '6924513908032');
  assert.equal(normalizeDealerOutboundDate('2026/07/20   01:02:03'), '2026-07-20 01:02:03');
  assert.equal(hash16(key), legacy(`hash16(${JSON.stringify(key)})`));
  assert.equal(result.import_uid, dealerOutboundImportUid(result));
  assert.equal(result.import_uid, hash16(key));
});

test('CT invalid, whitelist and first-row-wins duplicate counts keep at most five samples', () => {
  const invalidRows = Array.from({ length: 7 }, (_, index) => row({ 16: 'C001', 26: `6900${index}` }));
  const duplicate = [...valid];
  duplicate[2] = '后出现的重复商品';
  const unmatched = [...valid];
  unmatched[16] = 'C999';
  unmatched[23] = 'CT-UNMATCHED';
  const result = buildCtDealerOutboundRows([header, ...invalidRows, valid, duplicate, unmatched], new Set(['C001']), 1);
  assert.equal(result.total, 10);
  assert.equal(result.skipBad, 7);
  assert.equal(result.skipMap, 1);
  assert.equal(result.skipDup, 1);
  assert.equal(result.invalid.length, 5);
  assert.equal(result.payload[0].product_name, '商品一');
  assert.match(ctDealerOutboundZeroRowsError({ ...result, payload: [] }), /^有效行解析为0。原始数据 10 行，未匹配白名单 1 行，无效行 7 行。请检查 X单号、Q客户编号、AA条形码 是否在固定列。/);
  assert.match(ctDealerOutboundZeroRowsError({ ...result, payload: [] }), /无效行示例：\n第2行/);
  assert.doesNotMatch(ctDealerOutboundZeroRowsError({ ...result, payload: [] }), /第7行/);
});

test('six legacy special barcodes remain in fallback while CT React payload omits is_triple_spec_direct', () => {
  const legacy = loadLegacyStockCt();
  const specialBarcodes = [
    '6924513908032', '6924513908001', '6924513909244',
    '6924513909268', '6924513902283', '6924513908063'
  ];
  specialBarcodes.forEach((barcode, index) => {
    const cells = [...valid];
    cells[23] = `CT-${index}`;
    cells[26] = barcode;
    const react = makeCtDealerOutboundRow(cells, 'CT_1', index + 1);
    const old = plain(legacy(`makeRow(${JSON.stringify(cells)},'CT_1',${index + 1})`));
    assert.equal(old.is_triple_spec_direct, true);
    assert.equal(Object.hasOwn(react, 'is_triple_spec_direct'), false);
  });
  assert.match(read('stock_ct-legacy.html'), /6924513908032/);
  assert.doesNotMatch(read('src/domain/dealer-outbound-import.ts'), /is_triple_spec_direct/);
});

function xlsxFixture(matrix, calls) {
  return {
    read(data, options) {
      calls.push(['read', data instanceof Uint8Array, options]);
      return { SheetNames: ['第一页', '第二页'], Sheets: { 第一页: matrix, 第二页: [['ignored']] } };
    },
    utils: {
      sheet_to_json(worksheet, options) {
        calls.push(['sheet_to_json', worksheet, options]);
        return worksheet;
      }
    }
  };
}

test('CT controller preserves first-sheet XLSX options, progress copy and mock repository calls', async () => {
  const calls = [];
  const repository = {
    loadCustomerWhitelist() { calls.push(['whitelist']); return Promise.resolve(new Set(['C001'])); },
    upsertOutboundRows(rows, onProgress) {
      calls.push(['upsert', rows]);
      onProgress(rows.length, rows.length);
      return Promise.resolve();
    }
  };
  const controller = createCtDealerOutboundImportController({
    repository,
    xlsx: xlsxFixture([header, valid], calls),
    alert: message => calls.push(['alert', message]),
    now: () => 123
  });
  await controller.importFile({
    file: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) },
    setStatus: (text, error) => calls.push(['status', text, error])
  });
  assert.deepEqual(calls.find(call => call[0] === 'read'), ['read', true, { type: 'array', cellDates: true }]);
  assert.deepEqual(calls.find(call => call[0] === 'sheet_to_json').slice(2), [{
    header: 1,
    raw: false,
    dateNF: 'yyyy-mm-dd hh:mm:ss',
    blankrows: false
  }]);
  assert.equal(calls.find(call => call[0] === 'upsert')[1][0].import_batch_id, 'CT_123');
  assert.ok(calls.some(call => call[0] === 'status' && call[1] === '正在写入数据库 1 / 1 条...'));
  assert.deepEqual(calls.at(-1), ['alert', '导入成功，共处理 1 条记录']);
});

function createRepositoryClient(options = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      calls.push(['from', table]);
      const builder = {
        select(columns) { calls.push(['select', table, columns]); return builder; },
        not(column, operator, value) { calls.push(['not', table, column, operator, value]); return builder; },
        then(resolve) {
          return Promise.resolve({ data: options.rows ?? [], error: options.selectError || null }).then(resolve);
        },
        upsert(rows, upsertOptions) {
          calls.push(['upsert', table, rows, upsertOptions]);
          return Promise.resolve({ error: options.upsertError || null });
        }
      };
      return builder;
    }
  };
  return client;
}

test('shared repository keeps exact whitelist filters, raw-only 500-row upsert and original errors for CT', async () => {
  const whitelistClient = createRepositoryClient({ rows: [{ customer_code: ' C001 ', employee_code: ' E1 ' }] });
  const repository = createDealerOutboundImportRepository(whitelistClient);
  assert.deepEqual([...(await repository.loadCustomerWhitelist())], ['C001']);
  assert.deepEqual(whitelistClient.calls, [
    ['from', 'dealer_employee_mappings'],
    ['select', 'dealer_employee_mappings', 'customer_code,employee_code'],
    ['not', 'dealer_employee_mappings', 'customer_code', 'is', null],
    ['not', 'dealer_employee_mappings', 'employee_code', 'is', null]
  ]);

  const writeClient = createRepositoryClient();
  const rows = Array.from({ length: 501 }, (_, index) => ({
    ...makeCtDealerOutboundRow(valid, 'CT_1', index + 1),
    import_uid: `i${index}`
  }));
  await createDealerOutboundImportRepository(writeClient).upsertOutboundRows(rows, () => {});
  assert.deepEqual(writeClient.calls.filter(call => call[0] === 'upsert').map(call => [call[1], call[2].length, call[3]]), [
    ['raw_dealer_outbounds', 500, { onConflict: 'import_uid' }],
    ['raw_dealer_outbounds', 1, { onConflict: 'import_uid' }]
  ]);
  assert.equal(writeClient.calls.some(call => call[1] === 'van_stocks'), false);

  const empty = createRepositoryClient();
  await assert.rejects(createDealerOutboundImportRepository(empty).loadCustomerWhitelist(), {
    message: DEALER_OUTBOUND_EMPTY_WHITELIST_ERROR
  });
  const failure = createRepositoryClient({ upsertError: { message: 'raw CT write denied' } });
  await assert.rejects(createDealerOutboundImportRepository(failure).upsertOutboundRows([
    makeCtDealerOutboundRow(valid, 'CT_1', 1)
  ], () => {}), { message: 'raw CT write denied' });
});

test('CT file/error copy and React-controller-repository separation preserve static contracts', async () => {
  assert.equal(isDealerOutboundExcelFileName('sample.xlsx'), true);
  assert.equal(isDealerOutboundExcelFileName('sample.XLS'), true);
  assert.equal(isDealerOutboundExcelFileName('sample.csv'), false);
  assert.equal(DEALER_OUTBOUND_FILE_TYPE_ERROR, '文件格式错误，请选择 .xlsx 或 .xls');
  const emptyController = createCtDealerOutboundImportController({
    repository: {
      loadCustomerWhitelist: () => Promise.resolve(new Set(['C001'])),
      upsertOutboundRows: () => Promise.resolve()
    },
    xlsx: xlsxFixture([], []),
    alert() {}
  });
  await assert.rejects(emptyController.importFile({
    file: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) },
    setStatus() {}
  }), { message: DEALER_OUTBOUND_EMPTY_EXCEL_ERROR });

  const page = read('src/stock-ct/StockCtPage.tsx');
  const controller = read('src/stock-ct/DealerOutboundImportController.ts');
  const repository = read('src/services/dealer-outbound-import-repository.ts');
  assert.doesNotMatch(page, /client\.(from|rpc)\(/);
  assert.doesNotMatch(controller, /client\.(from|rpc)\(/);
  assert.match(controller, /repository\.loadCustomerWhitelist\(\)/);
  assert.match(controller, /repository\.upsertOutboundRows/);
  assert.match(repository, /from\('raw_dealer_outbounds'\)/);
  assert.doesNotMatch(repository, /from\('van_stocks'\)|\.rpc\(/);
  assert.match(page, /onDrop=\{handleDrop\}/);
  assert.match(page, /accept="\.xlsx,\.xls"/);
});
