import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
  buildCtDealerOutboundRows,
  buildJnDealerOutboundRows,
  makeJnDealerOutboundRow
} from '../src/domain/dealer-outbound-import.ts';
import { createDealerOutboundImportRepository } from '../src/services/dealer-outbound-import-repository.ts';
import {
  createUnifiedDealerOutboundImportController,
  unifiedDealerOutboundSuccessStatus
} from '../src/stock-import/DealerOutboundImportController.ts';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function loadLegacyUnifiedImport(now = 1721433600000) {
  const html = read('stock_import-legacy.html');
  const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .find(source => source.includes('const IMPORTERS='));
  assert.ok(inline, 'legacy unified importer inline script should remain available');
  const source = inline.replace(/const grid=document\.getElementById\('importGrid'\);[\s\S]*$/, '');
  const context = {
    alert() {},
    console,
    Date: class extends Date { static now() { return now; } },
    document: {},
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

function withoutLegacySpecialField(result) {
  const copy = plain(result);
  copy.payload.forEach(row => { delete row.is_triple_spec_direct; });
  return copy;
}

function ctRow(values = {}) {
  const cells = Array(27).fill('');
  Object.entries(values).forEach(([index, value]) => { cells[Number(index)] = value; });
  return cells;
}

const jnHeader = ['单号', '', '制单日期', '客户编号', '客户', '', '条形码', '商品名称', '包装', '件', '', '散'];
const jnValid = ['JN-001', '', '2026/07/20  08:30:00', 'C001', '客户一', '', '6.924513908032E+12', '商品一', '1,000', '2', '', '3'];
const ctHeader = ctRow({
  0: '制单日期', 2: '商品名称', 3: '包装', 5: '件', 6: '散',
  16: '客户编号', 17: '客户名称', 23: '单号', 26: '条形码'
});
const ctValid = ctRow({
  0: '2026/07/20  08:30:00', 2: '商品一', 3: '1,000', 5: '2', 6: '3',
  16: 'C001', 17: '客户一', 23: 'CT-001', 26: '6924513908032.0'
});

test('unified React JN pure data behavior differs from legacy only by the removed special field', () => {
  const legacy = loadLegacyUnifiedImport();
  const tabRow = ['JN-002\t\t2026-07-21\tC001\t客户二\t\t69002\t商品二\t12\t4\t\t5'];
  const matrix = [jnHeader, [], jnValid, tabRow];
  const react = buildJnDealerOutboundRows(matrix, new Set(['C001']), 1721433600000);
  const old = legacy(`build(${JSON.stringify(matrix)},IMPORTERS[0],new Set(['C001']))`);
  assert.deepEqual(react, withoutLegacySpecialField(old));
  assert.equal(react.payload[0].source_row_no, 3);
  assert.equal(react.payload[1].source_row_no, 4);
});

test('unified React CT pure data behavior differs from legacy only by the removed special field', () => {
  const legacy = loadLegacyUnifiedImport();
  const tabCells = ctRow({
    0: '2026-07-21', 2: '商品二', 3: '12', 5: '4', 6: '5',
    16: 'C001', 17: '客户二', 23: 'CT-002', 26: '69002'
  });
  const matrix = [ctHeader, [], ctValid, [tabCells.join('\t')]];
  const react = buildCtDealerOutboundRows(matrix, new Set(['C001']), 1721433600000);
  const old = legacy(`build(${JSON.stringify(matrix)},IMPORTERS[1],new Set(['C001']))`);
  assert.deepEqual(react, withoutLegacySpecialField(old));
  assert.equal(react.payload[0].source_row_no, 3);
  assert.equal(react.payload[1].source_row_no, 4);
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

test('unified controller keeps first-sheet XLSX options and exact unified progress/success copy', async () => {
  const calls = [];
  const repository = {
    loadCustomerWhitelist() { calls.push(['whitelist']); return Promise.resolve(new Set(['C001'])); },
    upsertOutboundRows(rows, onProgress) {
      calls.push(['upsert', rows]);
      onProgress(rows.length, rows.length);
      return Promise.resolve();
    }
  };
  const controller = createUnifiedDealerOutboundImportController({
    repository,
    xlsx: xlsxFixture([jnHeader, jnValid], calls),
    alert: message => calls.push(['alert', message]),
    now: () => 123
  });
  await controller.importFile({
    kind: 'jn',
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
  assert.ok(calls.some(call => call[0] === 'status' && call[1] === '正在写入原始记录 1 / 1 条...'));
  assert.ok(calls.some(call => call[0] === 'status' && call[1] === '原始记录导入完成。\n原始数据 1 行，实际导入/更新 1 行。\n本次导入不会改变当前库存。'));
  assert.deepEqual(calls.at(-1), ['alert', '原始记录导入成功，共处理 1 条；当前库存不受影响']);
});

test('unified CT controller selects CT mapping and CT batch prefix', async () => {
  let written;
  const controller = createUnifiedDealerOutboundImportController({
    repository: {
      loadCustomerWhitelist: () => Promise.resolve(new Set(['C001'])),
      upsertOutboundRows: rows => { written = rows; return Promise.resolve(); }
    },
    xlsx: xlsxFixture([ctHeader, ctValid], []),
    alert() {},
    now: () => 456
  });
  await controller.importFile({
    kind: 'ct',
    file: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) },
    setStatus() {}
  });
  assert.equal(written[0].import_batch_id, 'CT_456');
  assert.equal(written[0].order_no, 'CT-001');
});

test('unified success copy remains distinct from independent JN/CT page copy', () => {
  const result = buildJnDealerOutboundRows([jnValid], new Set(['C001']), 1);
  assert.equal(
    unifiedDealerOutboundSuccessStatus(result),
    '原始记录导入完成。\n原始数据 1 行，实际导入/更新 1 行。\n本次导入不会改变当前库存。'
  );
});

function repositoryClient(options = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      calls.push(['from', table]);
      const builder = {
        select(columns) { calls.push(['select', table, columns]); return builder; },
        not(column, operator, value) { calls.push(['not', table, column, operator, value]); return builder; },
        then(resolve) {
          return Promise.resolve({
            data: options.whitelistRows ?? [{ customer_code: ' C001 ', employee_code: ' E1 ' }],
            error: options.selectError || null
          }).then(resolve);
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

test('shared repository keeps exact whitelist fields and both non-null filters', async () => {
  const client = repositoryClient({ whitelistRows: [
    { customer_code: ' C001 ', employee_code: ' E1 ' },
    { customer_code: 'C002', employee_code: '' }
  ] });
  const whitelist = await createDealerOutboundImportRepository(client).loadCustomerWhitelist();
  assert.deepEqual([...whitelist], ['C001']);
  assert.deepEqual(client.calls, [
    ['from', 'dealer_employee_mappings'],
    ['select', 'dealer_employee_mappings', 'customer_code,employee_code'],
    ['not', 'dealer_employee_mappings', 'customer_code', 'is', null],
    ['not', 'dealer_employee_mappings', 'employee_code', 'is', null]
  ]);
});

test('shared repository writes only raw rows in 500 chunks and keeps original Supabase errors', async () => {
  const client = repositoryClient();
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    ...makeJnDealerOutboundRow(jnValid, 'JN_1', index + 1),
    import_uid: `i${index}`
  }));
  await createDealerOutboundImportRepository(client).upsertOutboundRows(rows, () => {});
  assert.deepEqual(client.calls.filter(call => call[0] === 'upsert').map(call => [call[1], call[2].length, call[3]]), [
    ['raw_dealer_outbounds', 500, { onConflict: 'import_uid' }],
    ['raw_dealer_outbounds', 500, { onConflict: 'import_uid' }],
    ['raw_dealer_outbounds', 1, { onConflict: 'import_uid' }]
  ]);
  assert.equal(client.calls.some(call => call[1] === 'van_stocks'), false);
  assert.equal(client.calls.some(call => call[0] === 'rpc'), false);

  const failed = repositoryClient({ upsertError: { message: 'raw unified write denied' } });
  await assert.rejects(createDealerOutboundImportRepository(failed).upsertOutboundRows(rows.slice(0, 1), () => {}), {
    message: 'raw unified write denied'
  });
});

test('React page and controller never call Supabase directly and importer state is per card', () => {
  const page = read('src/stock-import/StockImportPage.tsx');
  const controller = read('src/stock-import/DealerOutboundImportController.ts');
  const cardBody = page.slice(page.indexOf('function ImporterCard'), page.indexOf('export function StockImportPage'));
  assert.doesNotMatch(page, /client\.(from|rpc)\(/);
  assert.doesNotMatch(controller, /client\.(from|rpc)\(/);
  assert.match(controller, /repository\.loadCustomerWhitelist\(\)/);
  assert.match(controller, /repository\.upsertOutboundRows/);
  assert.match(cardBody, /useState<File \| null>\(null\)/);
  assert.match(cardBody, /useState\(false\)/);
  assert.match(page, /IMPORTERS\.map\(importer/);
});

test('React entry preserves the complete legacy CSS and responsive breakpoint', () => {
  const style = html => html.match(/<style>\s*([\s\S]*?)\s*<\/style>/)[1];
  assert.equal(style(read('stock_import.html')), style(read('stock_import-legacy.html')));
  assert.match(read('stock_import.html'), /@media\(max-width:700px\)/);
});

test('legacy fallback remains the exact original Git blob with all six special barcodes', () => {
  const bytes = fs.readFileSync(new URL('../stock_import-legacy.html', import.meta.url));
  const normalized = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
  const gitBlob = createHash('sha1')
    .update(`blob ${normalized.length}\0`)
    .update(normalized)
    .digest('hex');
  assert.equal(gitBlob, '6744ce01723c32bf4b8107bba2dd223e1254a56c');
  const legacy = bytes.toString('utf8');
  [
    '6924513908032', '6924513908001', '6924513909244',
    '6924513909268', '6924513902283', '6924513908063'
  ].forEach(barcode => assert.ok(legacy.includes(barcode)));
  assert.ok(legacy.includes('r.is_triple_spec_direct=!!SPECIAL[r.barcode]'));
});
