import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
  DEALER_OUTBOUND_EMPTY_EXCEL_ERROR,
  DEALER_OUTBOUND_EMPTY_WHITELIST_ERROR,
  DEALER_OUTBOUND_FILE_TYPE_ERROR,
  buildJnDealerOutboundRows,
  dealerOutboundImportUid,
  dealerOutboundNumber,
  dealerOutboundZeroRowsError,
  hash16,
  isDealerOutboundExcelFileName,
  makeJnDealerOutboundRow,
  normalizeDealerOutboundBarcode,
  normalizeDealerOutboundDate,
  normalizeJnCells,
  splitDealerOutboundChunks
} from '../src/domain/dealer-outbound-import.ts';
import { createDealerOutboundImportRepository } from '../src/services/dealer-outbound-import-repository.ts';
import { createDealerOutboundImportController } from '../src/stock-jn/DealerOutboundImportController.ts';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function loadLegacyStockJn() {
  const html = read('stock_jn-legacy.html');
  const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .find(script => script.includes('function hash16'));
  assert.ok(source, 'legacy stock JN inline script should remain available');
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

function withoutRemovedSpecialField(row) {
  const copy = { ...plain(row) };
  delete copy.is_triple_spec_direct;
  return copy;
}

const header = ['单号', '', '制单日期', '客户编号', '客户', '', '条形码', '商品名称', '包装', '件', '', '散'];
const valid = ['JN-001', '', '2026/07/20  08:30:00', 'C001', '客户一', '', '6924513908032.0', '商品一', '1,000', '2', '', '3'];

test('React pure data behavior matches legacy fixed JN mapping, header removal and source row numbers', () => {
  const legacy = loadLegacyStockJn();
  const matrix = [header, [], valid, ['JN-002\t\t2026-07-21\tC001\t客户二\t\t69002\t商品二\t12\t4\t\t5']];
  const react = buildJnDealerOutboundRows(matrix, new Set(['C001']), 1721433600000);
  const old = plain(legacy(`build(${JSON.stringify(matrix)},new Set(['C001']))`));
  old.payload = old.payload.map(withoutRemovedSpecialField);
  old.payload.forEach(row => { row.import_batch_id = 'JN_1721433600000'; });
  assert.deepEqual(react, old);
  assert.equal(react.payload[0].source_row_no, 3);
  assert.equal(react.payload[1].source_row_no, 4);
  assert.deepEqual(react.payload[0], {
    import_batch_id: 'JN_1721433600000',
    is_processed: false,
    source_row_no: 3,
    order_no: 'JN-001',
    bill_date: '2026-07-20 08:30:00',
    customer_code: 'C001',
    customer_name: '客户一',
    barcode: '6924513908032',
    product_name: '商品一',
    package_reg: 1000,
    qty_piece: 2,
    qty_scatter: 3,
    import_uid: react.payload[0].import_uid
  });
  assert.deepEqual(normalizeJnCells(['A\tB\tC']), ['A', 'B', 'C']);
});

test('barcode, date and numeric normalization match legacy including .0, scientific notation and commas', () => {
  const legacy = loadLegacyStockJn();
  const cases = ['001234.0', '001234.000', '6.924513908032E+12', 'text-code', ''];
  cases.forEach(value => {
    assert.equal(normalizeDealerOutboundBarcode(value), legacy(`barcode(${JSON.stringify(value)})`));
  });
  assert.equal(normalizeDealerOutboundBarcode('6.924513908032E+12'), '6924513908032');
  assert.equal(dealerOutboundNumber('1,234.50'), 1234.5);
  assert.equal(dealerOutboundNumber('not-a-number'), 0);
  assert.equal(normalizeDealerOutboundDate('2026/07/20   01:02:03'), '2026-07-20 01:02:03');
});

test('hash16 and import_uid preserve the exact legacy field order and stable output', () => {
  const legacy = loadLegacyStockJn();
  const row = makeJnDealerOutboundRow(valid, 'JN_1', 2);
  const key = 'JN-001|2026-07-20 08:30:00|6924513908032|2|3';
  assert.equal(hash16(key), legacy(`hash16(${JSON.stringify(key)})`));
  assert.equal(row.import_uid, legacy(`importUid(${JSON.stringify(row)})`));
  assert.equal(dealerOutboundImportUid(row), row.import_uid);
  assert.equal(row.import_uid, hash16(key));
});

test('invalid, whitelist and first-row-wins duplicate counts plus five samples remain compatible', () => {
  const invalidRows = Array.from({ length: 7 }, (_, index) => ['', '', '', 'C001', '', '', `6900${index}`]);
  const duplicate = [...valid];
  duplicate[7] = '后出现的重复商品';
  const unmatched = [...valid];
  unmatched[0] = 'JN-UNMATCHED';
  unmatched[3] = 'C999';
  const result = buildJnDealerOutboundRows([header, ...invalidRows, valid, duplicate, unmatched], new Set(['C001']), 1);
  assert.equal(result.total, 10);
  assert.equal(result.skipBad, 7);
  assert.equal(result.skipMap, 1);
  assert.equal(result.skipDup, 1);
  assert.equal(result.invalid.length, 5);
  assert.equal(result.payload.length, 1);
  assert.equal(result.payload[0].product_name, '商品一');
  assert.match(dealerOutboundZeroRowsError({ ...result, payload: [] }), /^有效行解析为0。原始数据 10 行，未匹配白名单 1 行，无效行 7 行。请检查 A单号、D客户编号、G条形码 是否在固定列。/);
  assert.match(dealerOutboundZeroRowsError({ ...result, payload: [] }), /无效行示例：\n第2行/);
  assert.doesNotMatch(dealerOutboundZeroRowsError({ ...result, payload: [] }), /第7行/);
});

test('six legacy special barcodes stay ordinary barcodes and React payload omits is_triple_spec_direct', () => {
  const legacy = loadLegacyStockJn();
  const specialBarcodes = [
    '6924513908032', '6924513908001', '6924513909244',
    '6924513909268', '6924513902283', '6924513908063'
  ];
  specialBarcodes.forEach((barcode, index) => {
    const cells = [...valid];
    cells[0] = `JN-${index}`;
    cells[6] = barcode;
    const react = makeJnDealerOutboundRow(cells, 'JN_1', index + 1);
    const old = plain(legacy(`makeRow(${JSON.stringify(cells)},'JN_1',${index + 1})`));
    assert.equal(old.is_triple_spec_direct, true);
    assert.equal(react.barcode, barcode);
    assert.equal(Object.hasOwn(react, 'is_triple_spec_direct'), false);
  });
  assert.doesNotMatch(read('src/domain/dealer-outbound-import.ts'), /6924513908032|is_triple_spec_direct/);
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
          const data = options.whitelistRows ?? [{ customer_code: ' C001 ', employee_code: ' E1 ' }];
          return Promise.resolve({ data, error: options.selectError || null }).then(resolve);
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

test('repository uses exact whitelist fields/null filters and rejects an empty usable whitelist', async () => {
  const client = createRepositoryClient({ whitelistRows: [
    { customer_code: ' C001 ', employee_code: ' E1 ' },
    { customer_code: '', employee_code: 'E2' },
    { customer_code: 'C003', employee_code: '' }
  ] });
  const whitelist = await createDealerOutboundImportRepository(client).loadCustomerWhitelist();
  assert.deepEqual([...whitelist], ['C001']);
  assert.deepEqual(client.calls, [
    ['from', 'dealer_employee_mappings'],
    ['select', 'dealer_employee_mappings', 'customer_code,employee_code'],
    ['not', 'dealer_employee_mappings', 'customer_code', 'is', null],
    ['not', 'dealer_employee_mappings', 'employee_code', 'is', null]
  ]);
  const empty = createRepositoryClient({ whitelistRows: [] });
  await assert.rejects(createDealerOutboundImportRepository(empty).loadCustomerWhitelist(), {
    message: DEALER_OUTBOUND_EMPTY_WHITELIST_ERROR
  });
});

test('repository writes only raw_dealer_outbounds in 500-row chunks with import_uid conflict and event-loop yields', async () => {
  const client = createRepositoryClient();
  const repository = createDealerOutboundImportRepository(client);
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    ...makeJnDealerOutboundRow(valid, 'JN_1', index + 1),
    import_uid: `i${index}`
  }));
  const progress = [];
  await repository.upsertOutboundRows(rows, (written, total) => progress.push([written, total]));
  const upserts = client.calls.filter(call => call[0] === 'upsert');
  assert.deepEqual(upserts.map(call => [call[1], call[2].length, call[3]]), [
    ['raw_dealer_outbounds', 500, { onConflict: 'import_uid' }],
    ['raw_dealer_outbounds', 500, { onConflict: 'import_uid' }],
    ['raw_dealer_outbounds', 1, { onConflict: 'import_uid' }]
  ]);
  assert.deepEqual(progress, [[500, 1001], [1000, 1001], [1001, 1001]]);
  assert.equal(client.calls.some(call => call[1] === 'van_stocks'), false);
  assert.deepEqual(splitDealerOutboundChunks(rows).map(part => part.length), [500, 500, 1]);
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

test('controller preserves first-sheet XLSX options, progress copy and mock-repository write contract', async () => {
  const calls = [];
  const repository = {
    loadCustomerWhitelist() { calls.push(['whitelist']); return Promise.resolve(new Set(['C001'])); },
    upsertOutboundRows(rows, onProgress) {
      calls.push(['upsert', rows]);
      onProgress(rows.length, rows.length);
      return Promise.resolve();
    }
  };
  const controller = createDealerOutboundImportController({
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
  assert.equal(calls.find(call => call[0] === 'upsert')[1][0].import_batch_id, 'JN_123');
  assert.ok(calls.some(call => call[0] === 'status' && call[1] === '正在写入数据库 1 / 1 条...'));
  assert.deepEqual(calls.at(-1), ['alert', '导入成功，共处理 1 条记录']);
});

test('empty Excel and repository errors retain their original Chinese/message text', async () => {
  const statuses = [];
  const emptyController = createDealerOutboundImportController({
    repository: {
      loadCustomerWhitelist: () => Promise.resolve(new Set(['C001'])),
      upsertOutboundRows: () => Promise.resolve()
    },
    xlsx: xlsxFixture([], []),
    alert() {}
  });
  await assert.rejects(emptyController.importFile({
    file: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) },
    setStatus: text => statuses.push(text)
  }), { message: DEALER_OUTBOUND_EMPTY_EXCEL_ERROR });

  const selectFailure = createRepositoryClient({ selectError: { message: 'permission denied for table dealer_employee_mappings' } });
  await assert.rejects(createDealerOutboundImportRepository(selectFailure).loadCustomerWhitelist(), {
    message: 'permission denied for table dealer_employee_mappings'
  });
  const writeFailure = createRepositoryClient({ upsertError: { message: 'raw write denied' } });
  await assert.rejects(createDealerOutboundImportRepository(writeFailure).upsertOutboundRows([
    makeJnDealerOutboundRow(valid, 'JN_1', 1)
  ], () => {}), { message: 'raw write denied' });
});

test('file acceptance and React/repository separation preserve static contracts', () => {
  assert.equal(isDealerOutboundExcelFileName('sample.xlsx'), true);
  assert.equal(isDealerOutboundExcelFileName('sample.XLS'), true);
  assert.equal(isDealerOutboundExcelFileName('sample.csv'), false);
  assert.equal(DEALER_OUTBOUND_FILE_TYPE_ERROR, '文件格式错误，请选择 .xlsx 或 .xls');
  const page = read('src/stock-jn/StockJnPage.tsx');
  const controller = read('src/stock-jn/DealerOutboundImportController.ts');
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
