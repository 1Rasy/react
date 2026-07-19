import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const qtyPopup = readFileSync(join(root, 'store-qty-popup.js'), 'utf8');
const qtyPopupCss = readFileSync(join(root, 'store-qty-popup.css'), 'utf8');
const afterSales = readFileSync(join(root, 'store-after-sales.js'), 'utf8');

['store.html', 'store_report.html', 'store_stock.html', 'store_new.html'].forEach(file => {
  const html = readFileSync(join(root, file), 'utf8');
  assert.ok(html.includes('store-qty-popup.css'), `${file} should load qty popup styles`);
  assert.ok(html.includes('store-qty-popup.js'), `${file} should load qty popup controls`);
});

assert.ok(afterSales.includes('data-after-sales-select'), 'after-sales quantity should have a stable select hook');
assert.ok(qtyPopup.includes('parseAfterSaleSelect'), 'qty popup should recognize after-sales quantity selects');
assert.ok(qtyPopup.includes("key: 'afterSaleQty'"), 'qty popup should route after-sales quantity separately from sale quantity');
assert.ok(qtyPopup.includes("STATE.handler === 'afterSale'"), 'qty popup should dispatch after-sales changes instead of calling changeQty');
assert.ok(qtyPopup.includes('#list .after-sales-panel select.after-sales-picker'), 'qty popup should bind after-sales selects rendered below the loose row');
assert.ok(qtyPopupCss.includes('.after-sales-panel .qty-popup-trigger'), 'after-sales popup trigger should use the same 5x5 quantity button styling');
assert.ok(!qtyPopup.includes('requestAnimationFrame(bindQtyPopup)'), 'quantity popup triggers should bind before the next paint to avoid order-row layout jumping');
