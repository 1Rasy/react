import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const storeApp = readFileSync(join(root, 'store-app.js'), 'utf8');
const deliveryNote = readFileSync(join(root, 'store-delivery-note.js'), 'utf8');
const productsPage = readFileSync(join(root, 'products.html'), 'utf8');
const mixBoxSql = readFileSync(join(root, 'database', '20260701_add_products_allow_mix_box.sql'), 'utf8');

assert.ok(storeApp.includes('allow_mix_box:Boolean(x.allow_mix_box)'), 'store should load allow_mix_box from products');
assert.ok(storeApp.includes('mixQty:0'), 'order item state should track mix-box loose quantities');
assert.ok(storeApp.includes('function canMixBox'), 'order page should detect mix-box enabled specs');
assert.ok(storeApp.includes('class="mix-box-card"'), 'order page should render a mix-box entry card');
assert.ok(storeApp.includes('onclick="toggleMixBoxPanel'), 'mix-box entry should expand flavor list');
assert.ok(storeApp.includes('function changeMixQty'), 'mix-box flavor rows should use plus/minus quantity changes');
assert.ok(storeApp.includes("sale_unit:'拼盒'"), 'mixed box submitted items should be marked as mix-box sales');
assert.ok(storeApp.includes('buildMixBoxPayloads'), 'submit should allocate mix-box total price across flavors');
assert.ok(storeApp.includes('validateMixBoxGroups'), 'submit should validate mixed quantities form whole boxes');
assert.ok(storeApp.includes('stockQtyFromItem(p,it){return Number(it?.wholeQty||0)*packSize(p)+Number(it?.looseQty||0)+Number(it?.mixQty||0)}'), 'stock deduction should include mix-box quantities');

assert.ok(productsPage.includes('allow_mix_box'), 'products page should expose allow_mix_box field');
assert.ok(productsPage.includes("'allow_mix_box'"), 'products page editable fields should include allow_mix_box');
assert.ok(productsPage.includes('new_allow_mix_box'), 'new product row should include allow_mix_box checkbox');
assert.ok(productsPage.includes("allow_mix_box: document.getElementById('new_allow_mix_box').checked"), 'new product payload should save allow_mix_box');
assert.ok(productsPage.includes("field === 'allow_mix_box'"), 'products page filters should support allow_mix_box');

assert.ok(productsPage.includes('filterBtn_allow_mix_box'), 'products page should render a mix-box column header');
assert.ok(productsPage.includes('data-field="allow_mix_box"'), 'products page should render row checkbox for allow_mix_box');
assert.ok(mixBoxSql.includes('add column if not exists allow_mix_box boolean not null default false'), 'allow_mix_box migration should add the product flag safely');

const dashboardPage = readFileSync(join(root, 'src/domain/dashboard.ts'), 'utf8');
assert.ok(deliveryNote.includes("saleUnit.includes('拼盒')"), 'delivery note should recognize mixed-box sale units');
assert.ok(deliveryNote.includes('row.wholeQty+=saleQty/wholeSize'), 'delivery note should convert mixed loose quantities to whole boxes');
assert.ok(dashboardPage.includes('pcs_per_box'), 'dashboard export should load box size for mixed boxes');
assert.ok(dashboardPage.includes("saleUnit === '拼盒'"), 'dashboard should detect mixed-box sale rows');
assert.ok(dashboardPage.includes('row.looseQty += saleQty'), 'dashboard mixed-box export should keep each flavor as loose quantity');
assert.ok(dashboardPage.includes('row.loosePrice = Number((salePrice / mixSize).toFixed(2))'), 'dashboard mixed-box loose price should be whole box price divided by middle-box size to two decimals');
assert.ok(dashboardPage.includes('barcode,'), 'dashboard mixed-box export should keep each product barcode');
assert.ok(!dashboardPage.includes('row.wholeQty += saleQty / mixSize'), 'dashboard mixed boxes should no longer be aggregated as whole boxes');

assert.ok(storeApp.includes('class="mix-box-count"'), 'mix-box count should render outside the button');
assert.ok(storeApp.includes('>点击拼盒</button>'), 'mix-box button should say click mix box only');
assert.ok(!storeApp.includes('class="mix-box-amount"'), 'mix-box row should not show a live changing amount');

const storeStyle = readFileSync(join(root, 'store-style.css'), 'utf8');
assert.ok(storeStyle.includes('grid-template-columns:96px 58px 34px 78px'), 'mix-box header should use stable fixed columns');
assert.ok(storeStyle.includes('width:96px'), 'mix-box button should use stable fixed sizing');
assert.ok(storeStyle.includes('min-width:58px'), 'mix-box count should not resize when quantity changes');

assert.ok(storeStyle.includes('.mix-flavor-row button{touch-action:manipulation'), 'mix-box plus/minus controls should prevent double tap zoom');
assert.ok(storeStyle.includes('user-select:none'), 'mix-box plus/minus controls should avoid text selection while tapping quickly');
