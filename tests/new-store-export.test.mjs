import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const store = readFileSync(join(root, 'store.html'), 'utf8');
const storeApp = readFileSync(join(root, 'store-app.js'), 'utf8');
const dashboard = readFileSync(join(root, 'src/domain/dashboard.ts'), 'utf8');

for (const file of ['store_stock.html', 'store_report.html', 'store_new.html', 'store-style.css', 'store-app.js']) {
  assert.ok(existsSync(join(root, file)), `${file} should exist after splitting store.html`);
}

assert.ok(store.includes('store-style.css'), 'store.html should load shared store stylesheet');
assert.ok(store.includes('store-app.js'), 'store.html should load shared store app script');
assert.ok(store.includes("window.STORE_ENTRY='home'"), 'store.html should declare the home entry');
assert.ok(store.includes('store_stock.html'), 'store home should link to the split stock page');
assert.ok(store.includes('store_report.html'), 'store home should link to the split report page');
assert.ok(store.includes('store_new.html'), 'store home should link to the split new-store page');
assert.ok(!store.includes('async function submitOrder'), 'store.html should no longer inline the full order implementation');

assert.ok(storeApp.includes('async function deleteNewStore'), 'store app should implement new store deletion');
assert.ok(storeApp.includes(".from('employee_store_assets').delete()"), 'new store deletion should remove the manual store asset row');
assert.ok(storeApp.includes('event.stopPropagation(); deleteNewStore'), 'manual store delete button should not open store history');
assert.ok(storeApp.includes(".from('sales_orders').select('id',{count:'exact',head:true})"), 'delete flow should check manual store order history');
assert.ok(storeApp.includes("visibleStores=stores.filter(s=>!String(s.atom_code).startsWith('NEW_'))"), 'regular store list should hide manual NEW_ stores');
assert.ok(storeApp.includes('class="history-item" style="border-left:4px solid #ff7875;cursor:pointer;" onclick="openStoreHistory'), 'manual store card should open history when clicked');
assert.ok(!storeApp.includes('临时编码'), 'manual store card should not show temporary code');
assert.ok(!storeApp.includes('去开单 / 历史'), 'manual store card should not show a separate open/history button');
assert.ok(storeApp.includes('if(count>0)'), 'manual store deletion should check existing history before delete');
assert.ok(storeApp.includes('先删除历史单据再删除门店'), 'manual store deletion should explain how to delete stores with history');
assert.ok(!storeApp.includes('不会删除历史单据'), 'manual store deletion should not allow deleting store entry while history remains');

assert.ok(dashboard.includes('const normalRows ='), 'dashboard export should split regular store rows');
assert.ok(dashboard.includes('const offlineRows ='), 'dashboard export should split manual store rows');
assert.ok(dashboard.includes("String(row.atom || '').startsWith('NEW_')"), 'dashboard export should identify manual stores by NEW_ atom code');
assert.ok(dashboard.includes("appendExportSheet(xlsx, workbook, offlineRows, '线外门店')"), 'dashboard export should append offline store sheet');
