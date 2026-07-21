import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const storeApp = read('store-app.js');
const order = read('order.html');
const stockSummary = read('src/domain/stock-summary.ts');
const dashboard = read('src/domain/dashboard.ts');
const deliveryNote = read('store-delivery-note.js');
const afterSales = read('store-after-sales.js');
const orderDetailFix = read('store-order-detail-fix.js');
const stockReview = read('stock-adjustment-review.js');
const storeAdjustment = read('store-stock-adjustment.js');
const products = read('products.html');

test('store pages build product labels from spec and flavor without products.name', () => {
  assert.match(storeApp, /function productDisplayName\(product,fallback=''\)/);
  assert.match(storeApp, /\[product\?\.spec,product\?\.flavor\]/);
  assert.match(storeApp, /product_name:productDisplayName\(\{spec,flavor,barcode:x\.barcode\},x\.barcode\)/);
  assert.doesNotMatch(storeApp, /x\.flavor\|\|x\.name/);
  assert.doesNotMatch(storeApp, /a\.name\|\|a\.product_name/);
  assert.doesNotMatch(storeApp, /item\?\.product_name\|\|product\?\.product_name/);
});

test('standalone order and stock pages display spec plus flavor and use barcode fallback', () => {
  assert.match(order, /product_name:productDisplayName\(\{spec,flavor,barcode:x\.barcode\},x\.barcode\)/);
  assert.doesNotMatch(order, /x\.flavor\|\|x\.name/);
  assert.doesNotMatch(order, /esc\(p\.name\)/);
  assert.match(stockSummary, /title: productDisplayName\(product, normalizedBarcode\)/);
  assert.doesNotMatch(stockSummary, /title:\s*product\.name\s*\|\|/);
  assert.doesNotMatch(stockSummary, /products\.name/);
});

test('exports, review pages and delivery notes do not fall back to saved product names', () => {
  assert.match(dashboard, /function exportProductName\(product:/);
  assert.match(dashboard, /\[product\?\.spec, product\?\.flavor\]/);
  assert.doesNotMatch(dashboard, /p\?\.name|item\.product_name/);
  assert.match(stockReview, /StockAdjustmentCore\.formatSpecFlavor\(item\) \|\| item\.product_barcode/);
  assert.doesNotMatch(stockReview, /\[item\.product_name, item\.spec, item\.flavor\]/);
  assert.match(storeAdjustment, /StockAdjustmentCore\.formatSpecFlavor\(item\) \|\| item\.product_barcode/);
  assert.doesNotMatch(storeAdjustment, /item\.product_name \|\| item\.product_barcode/);
  assert.match(deliveryNote, /const productName=\[row\.spec,flavorText\]/);
  assert.doesNotMatch(deliveryNote, /item\.product_name/);
  assert.match(afterSales, /productDisplayName\(p,barcode\)/);
  assert.doesNotMatch(orderDetailFix, /product_name:it\.product_name\|\|bc/);
});

test('products.name remains visible in product management', () => {
  assert.match(products, /p\.name/);
  assert.match(products, /renderInput\(p,'name'\)/);
});
