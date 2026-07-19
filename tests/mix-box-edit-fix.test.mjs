import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fix = readFileSync(join(root, 'store-mix-box-edit-fix.js'), 'utf8');

assert.ok(fix.includes("includes('拼盒')"), 'edit hydration should detect mixed-box sale_unit rows');
assert.ok(fix.includes('item.mixQty += saleQty'), 'edit hydration should restore mixed-box rows to mixQty');
assert.ok(fix.includes('setMixBoxPriceForProduct(p, salePrice)'), 'edit hydration should restore the mixed-box price for the spec');
assert.ok(fix.includes('mixBoxOpenKeys.add(mixBoxKey(p.brand, p.spec))'), 'editing a mixed-box order should reopen the mixed-box panel');

['store.html', 'store_report.html', 'store_stock.html', 'store_new.html'].forEach(file => {
  const html = readFileSync(join(root, file), 'utf8');
  assert.ok(html.includes('store-mix-box-edit-fix.js'), `${file} should load the mixed-box edit fix`);
});
