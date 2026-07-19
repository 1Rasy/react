import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const storeApp = readFileSync(join(root, 'store-app.js'), 'utf8');
const afterSales = readFileSync(join(root, 'store-after-sales.js'), 'utf8');

assert.ok(storeApp.includes('const ORDER_DRAFT_PREFIX'), 'order drafts should use a scoped localStorage key prefix');
assert.ok(storeApp.includes('function orderDraftKey'), 'order drafts should be scoped by employee and store');
assert.ok(storeApp.includes('function saveOrderDraft'), 'order edits should save a local draft');
assert.ok(storeApp.includes('function restoreOrderDraft'), 'new orders should restore a saved draft after refresh');
assert.ok(storeApp.includes('function clearOrderDraft'), 'submitted or abandoned drafts should be cleared');
assert.ok(storeApp.includes('restoreOrderDraft(orderData)'), 'new order setup should restore cached selections');
assert.ok(storeApp.includes('saveOrderDraft()'), 'quantity, price, mix-box, and date edits should persist the draft');
assert.ok(storeApp.includes('clearOrderDraft(finalOrderNo)'), 'successful submission should remove the draft');

assert.ok(
  storeApp.includes("if(STATE==='STORE'){const search=document.getElementById('search');if(search?.value){clearSearchInput();return}"),
  'store search back should clear the search box before leaving the store page',
);

assert.ok(afterSales.includes('saveOrderDraft()'), 'after-sales quantity edits should persist in the order draft');
assert.ok(afterSales.includes('clearOrderDraft(finalOrderNo)'), 'after-sales submit path should clear the order draft');
