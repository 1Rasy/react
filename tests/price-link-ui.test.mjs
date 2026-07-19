import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const storeApp = readFileSync(join(root, 'store-app.js'), 'utf8');

assert.ok(storeApp.includes('data-price-product="${esc(p.id)}"'), 'price selectors should expose product ids for UI synchronization');
assert.ok(storeApp.includes('data-price-key="loosePrice"'), 'loose price selector should expose its price key');
assert.ok(storeApp.includes('data-price-key="wholePrice"'), 'whole price selector should expose its price key');
assert.ok(storeApp.includes('function syncSpecFlavorPriceInputs'), 'price linking should update rendered selector controls');
assert.ok(storeApp.includes('syncSpecFlavorPriceInputs(id,key,price)'), 'changePrice should sync visible price selectors');
assert.ok(storeApp.includes("selector.value=String(price)"), 'visible linked price selectors should receive the changed price');
assert.ok(storeApp.includes('function makeWholePriceOptions'), 'whole price selector should use a dedicated 0.10 step option builder');
assert.ok(storeApp.includes('p+=0.10'), 'whole price options should step by 0.10 yuan');
assert.ok(storeApp.includes('${makePriceOptions(p.default_price,it.loosePrice)}'), 'loose price selector should keep the standard 0.05 step options');
assert.ok(storeApp.includes('${makeWholePriceOptions(wholeDefaultPrice(p),it.wholePrice)}'), 'whole price selector should use 0.10 step options');
