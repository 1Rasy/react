import assert from 'node:assert/strict';
import test from 'node:test';
import {
  amountFromItem,
  packSize,
  productDisplayName,
  stockQtyFromItem,
  wholeDefaultPrice
} from '../src/domain/product.ts';
import { allocateMixBox, mixBoxGroupKey, validateMixBoxQuantity } from '../src/domain/mix-box.ts';
import {
  AFTER_SALE_REMARK_PREFIX,
  buildAfterSaleRemark,
  netStockOut,
  normalizeReturnQty,
  parseAfterSaleRemark
} from '../src/domain/after-sales.ts';
import { isStockEffectiveDate, orderDateToCreatedAt } from '../src/domain/dates.ts';

test('product display, packing, stock and amount match legacy formulas', () => {
  const product = { barcode: '69001', spec: '40g', flavor: '原味', default_price: 2.35, pcs_per_case: 24, pcs_per_box: 6 };
  const item = { wholeQty: 2, looseQty: 3, mixQty: 1, wholePrice: 14.1, loosePrice: 2.35 };
  assert.equal(productDisplayName(product), '40g 原味');
  assert.equal(packSize(product), 6);
  assert.equal(wholeDefaultPrice(product), 14.1);
  assert.equal(stockQtyFromItem(product, item), 16);
  assert.equal(amountFromItem(item), 35.25);
  assert.equal(productDisplayName({ barcode: '69002', spec: ' ', flavor: '' }), '69002');
});

test('mix-box allocation keeps barcode rows and puts rounding remainder on the last row', () => {
  assert.equal(mixBoxGroupKey('奥利奥', '97g'), '奥利奥|||97g');
  assert.equal(validateMixBoxQuantity(6, 6), true);
  assert.equal(validateMixBoxQuantity(5, 6), false);
  assert.deepEqual(allocateMixBox([
    { barcode: 'A', productName: '97g 原味', looseQty: 1 },
    { barcode: 'B', productName: '97g 草莓', looseQty: 2 },
    { barcode: 'C', productName: '97g 巧克力', looseQty: 3 }
  ], 6, 10), {
    total: 10,
    items: [
      { barcode: 'A', product_name: '97g 原味', qty: 1, unit_price: 1.67, amount: 1.67, sale_unit: '拼盒', sale_qty: 1, sale_unit_price: 10 },
      { barcode: 'B', product_name: '97g 草莓', qty: 2, unit_price: 1.665, amount: 3.33, sale_unit: '拼盒', sale_qty: 2, sale_unit_price: 10 },
      { barcode: 'C', product_name: '97g 巧克力', qty: 3, unit_price: 1.6667, amount: 5, sale_unit: '拼盒', sale_qty: 3, sale_unit_price: 10 }
    ]
  });
});

test('after-sales remark and stock delta match legacy normalization', () => {
  assert.equal(normalizeReturnQty('2.9'), 2);
  assert.equal(buildAfterSaleRemark({ A: 2, B: 0 }), `${AFTER_SALE_REMARK_PREFIX}{"A":2}`);
  assert.deepEqual(parseAfterSaleRemark(`${AFTER_SALE_REMARK_PREFIX}{"A":2,"B":0}`), { A: 2 });
  assert.deepEqual(parseAfterSaleRemark('bad-json'), {});
  assert.equal(netStockOut(8, 3), 5);
});

test('stock cutoff and created-at conversion match legacy date behavior', () => {
  assert.equal(isStockEffectiveDate('2026-06-30T23:59:59+08:00'), false);
  assert.equal(isStockEffectiveDate('2026-07-01'), true);
  assert.equal(isStockEffectiveDate(''), true);
  const now = new Date(2026, 6, 19, 14, 5, 6);
  const expected = new Date('2026-07-03T14:05:06').toISOString();
  assert.equal(orderDateToCreatedAt('2026-07-03', now), expected);
});
