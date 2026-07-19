import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const storeApp = readFileSync(join(root, 'store-app.js'), 'utf8');

assert.ok(storeApp.includes('function formatQtyToUnits(totalPcs,specCase,specBox,unit=\'个\')'), 'stock page should have a dedicated three-level quantity formatter');
assert.ok(storeApp.includes('return `${sign}${cases}件 ${boxes}中盒 ${loose}${unit}`'), 'three-level stock display should use 件 / 中盒 / 散');
assert.ok(storeApp.includes('return `${sign}${cases}件 ${rest}${unit}`'), 'two-level stock display should use 件 / 散');
assert.ok(storeApp.includes('const formatted=formatQtyToUnits(total,p.pcs_per_case,p.pcs_per_box,unitOf(p))'), 'renderStockPage should use the stock-specific formatter');
assert.ok(!/renderStockPage\(\)[\s\S]*?formatStockQty\(total,p\)/.test(storeApp), 'renderStockPage should not use sales whole/loose formatter');
assert.ok(storeApp.includes('function formatStockQty(total,p)'), 'sales whole/loose formatter may remain for other views');