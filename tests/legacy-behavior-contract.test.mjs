import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const read = file => readFileSync(join(root, file), 'utf8');
const store = read('store-app.js');
const afterSales = read('store-after-sales.js');
const dashboard = read('src/domain/dashboard.ts');
const redirects = read('_redirects');

test('all legacy MPA entry files remain present in the contract', () => {
  const contract = read('docs/migration/LEGACY_BEHAVIOR_CONTRACT.md');
  const entries = [
    'dashboard.html', 'employees.html', 'employees-legacy.html', 'index.html', 'inventory-movements.html',
    'order.html', 'products.html', 'report.html', 'stock.html', 'stock_ct.html',
    'stock_import.html', 'stock_jn.html', 'stock_summary.html',
    'stock-adjustment-review.html', 'store.html', 'store_import.html', 'store_import-legacy.html',
    'store_new.html', 'store_report.html', 'store_stock.html'
  ];
  entries.forEach(file => {
    assert.doesNotThrow(() => read(file), `${file} must remain buildable`);
    assert.ok(contract.includes(`\`${file}\``), `${file} must stay documented`);
  });
});

test('legacy clean and html URLs stay configured without SPA fallback', () => {
  assert.match(redirects, /\/store\.html \/store 301/);
  assert.match(redirects, /\/store \/store\.html 200/);
  assert.match(redirects, /\/dashboard\.html \/dashboard 301/);
  assert.doesNotMatch(redirects, /\/\*\s+\/index\.html/);
  assert.deepEqual(JSON.parse(read('vercel.json')), { cleanUrls: true, trailingSlash: false });
});

test('employee aliases, session keys and draft key semantics remain fixed', () => {
  assert.ok(store.includes("urlParams.get('emp')||urlParams.get('employee_code')"));
  assert.ok(store.includes("urlParams.get('name')"));
  assert.ok(store.includes("sessionStorage.getItem('current_employee_code')"));
  assert.ok(store.includes("sessionStorage.getItem('current_employee_name')"));
  assert.ok(store.includes("const ORDER_DRAFT_PREFIX='spr_order_draft_v1'"));
  assert.ok(store.includes("ORDER_DRAFT_PREFIX+':'+currentEmployee.code+':'+atom"));
  assert.ok(store.includes('mixBoxOpenKeys:Array.from(mixBoxOpenKeys)'));
});

test('current query canonicalization gap is explicit until compatibility is restored', () => {
  assert.ok(store.includes("target='emp='+encodeURIComponent(currentEmployee.code)"));
  assert.ok(read('stock.html').includes("+'&adjust=1'"));
  assert.ok(read('store-stock-adjustment.js').includes("get('adjust') === '1'"));
  assert.match(read('docs/migration/LEGACY_BEHAVIOR_CONTRACT.md'), /已发现的当前兼容缺口/);
});

test('order RPC payload and post-RPC date update keep their names and order', () => {
  const rpcAt = afterSales.indexOf("client.rpc('submit_sales_order_v2'");
  const dateAt = afterSales.indexOf("client.from('sales_orders').update", rpcAt);
  assert.ok(rpcAt >= 0 && dateAt > rpcAt, 'created_at/status update must stay after order RPC');
  [
    'p_order_no:', 'p_employee_code:', 'p_atom_code:', 'p_store_name:',
    'p_total_amount:', 'p_items:', 'p_stock_updates:'
  ].forEach(name => assert.ok(afterSales.includes(name), `${name} must remain`));
});

test('mix-box grouping, validation and rounding contract remains fixed', () => {
  assert.ok(store.includes("String(brand||'')+'|||'+String(spec||'')"));
  assert.ok(store.includes('qty%size!==0'));
  assert.ok(store.includes("sale_unit:'拼盒'"));
  assert.ok(store.includes('amount*partQty/qty).toFixed(2)'));
  assert.ok(store.includes("amount-allocated).toFixed(2)"));
  assert.ok(store.includes("partAmount/partQty).toFixed(4)"));
});

test('after-sales stays outside revenue and inside stock delta', () => {
  assert.ok(afterSales.includes('const netStockOut = saleStockQty - returnQty'));
  assert.ok(afterSales.includes("const AFTER_SALE_STATUS = 'SUCCESS_AFTER_SALE'"));
  assert.ok(afterSales.includes("const AFTER_SALE_REMARK_PREFIX = 'AFTER_SALES:'"));
  assert.ok(afterSales.includes('p_total_amount:Number(total.toFixed(2))'));
});

test('dashboard export headers, sheets and mix-box price conversion remain fixed', () => {
  assert.ok(dashboard.includes('DASHBOARD_EXPORT_HEADERS'));
  for (const header of ['开单日期', '员工', '员工号', '门店编号', '门店', '规格口味', '条码', '整数', '整价', '散数', '散价', '金额']) {
    assert.ok(dashboard.includes(`'${header}'`));
  }
  assert.ok(dashboard.includes("appendExportSheet(xlsx, workbook, normalRows, '开单明细')"));
  assert.ok(dashboard.includes("appendExportSheet(xlsx, workbook, offlineRows, '线外门店')"));
  assert.ok(dashboard.includes('row.loosePrice = Number((salePrice / mixSize).toFixed(2))'));
});

test('import order and payload contracts remain fixed', () => {
  const stores = read('store_import-legacy.html');
  const dealer = read('stock_import-legacy.html');
  const baseline = read('stock_summary-legacy.html');
  const clearAt = stores.indexOf("from('temp_upload_assets').delete()");
  const insertAt = stores.indexOf('.insert(safePayloads)', clearAt);
  const syncAt = stores.indexOf("rpc('sync_and_mask_assets')", insertAt);
  assert.ok(clearAt >= 0 && insertAt > clearAt && syncAt > insertAt);
  assert.ok(dealer.includes("upsert(part,{onConflict:'import_uid'})"));
  assert.ok(dealer.includes('for(let i=0;i<rows.length;i+=500)'));
  assert.ok(dealer.includes('本次导入不会改变当前库存'));
  assert.ok(baseline.includes("client.rpc('import_van_stock_baseline'"));
  assert.ok(baseline.includes("INVENTORY_BASELINE_ID='2026-07-01-opening'"));
});

test('store import React migration keeps an exact legacy fallback contract', () => {
  const reactEntry = read('store_import.html');
  const legacyEntry = read('store_import-legacy.html');
  const repository = read('src/services/store-import-repository.ts');
  assert.match(reactEntry, /src="\/src\/store-import\/main\.tsx"/);
  assert.ok(legacyEntry.includes("from('temp_upload_assets').delete().neq('employee_code', '_clear_all_')"));
  assert.ok(repository.includes("rpc('sync_and_mask_assets')"));
  assert.match(redirects, /\/store_import-legacy \/store_import-legacy\.html 200/);
});

test('unified stock import React migration keeps an exact legacy fallback contract', () => {
  const reactEntry = read('stock_import.html');
  const legacyEntry = read('stock_import-legacy.html');
  assert.match(reactEntry, /src="\/src\/stock-import\/main\.tsx"/);
  assert.ok(legacyEntry.includes("{key:'jn',title:'吉能'"));
  assert.ok(legacyEntry.includes("{key:'ct',title:'长涛'"));
  assert.ok(legacyEntry.includes('const SPECIAL={"6924513908032":1'));
  assert.match(redirects, /\/stock_import-legacy \/stock_import-legacy\.html 200/);
});

test('stock JN React migration keeps an explicit legacy fallback contract', () => {
  const reactEntry = read('stock_jn.html');
  const legacyEntry = read('stock_jn-legacy.html');
  assert.match(reactEntry, /src="\/src\/stock-jn\/main\.tsx"/);
  assert.ok(legacyEntry.includes("const CFG={prefix:'JN'"));
  assert.ok(legacyEntry.includes("const SPECIAL={\"6924513908032\":1"));
  assert.match(redirects, /\/stock_jn-legacy \/stock_jn-legacy\.html 200/);
});

test('stock CT React migration keeps an explicit legacy fallback contract', () => {
  const reactEntry = read('stock_ct.html');
  const legacyEntry = read('stock_ct-legacy.html');
  assert.match(reactEntry, /src="\/src\/stock-ct\/main\.tsx"/);
  assert.ok(legacyEntry.includes("const CFG={prefix:'CT'"));
  assert.ok(legacyEntry.includes("const SPECIAL={\"6924513908032\":1"));
  assert.match(redirects, /\/stock_ct-legacy \/stock_ct-legacy\.html 200/);
});
