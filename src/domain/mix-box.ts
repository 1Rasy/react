export type MixBoxPart = {
  barcode: string;
  productName: string;
  looseQty: number;
};

export type MixBoxPayloadItem = {
  barcode: string;
  product_name: string;
  qty: number;
  unit_price: number;
  amount: number;
  sale_unit: '拼盒';
  sale_qty: number;
  sale_unit_price: number;
};

export type MixBoxAllocation = {
  items: MixBoxPayloadItem[];
  total: number;
};

export function mixBoxGroupKey(brand: unknown, spec: unknown): string {
  return `${String(brand || '')}|||${String(spec || '')}`;
}

export function validateMixBoxQuantity(totalLooseQty: number, boxSize: number): boolean {
  return totalLooseQty === 0 || (boxSize > 0 && totalLooseQty % boxSize === 0);
}

export function allocateMixBox(
  parts: readonly MixBoxPart[],
  boxSize: number,
  boxPrice: number
): MixBoxAllocation {
  const active = parts.filter(part => Number(part.looseQty || 0) > 0);
  const totalLooseQty = active.reduce((sum, part) => sum + Number(part.looseQty || 0), 0);
  if (totalLooseQty === 0) return { items: [], total: 0 };
  if (!validateMixBoxQuantity(totalLooseQty, boxSize)) {
    throw new Error(`拼盒数量 ${totalLooseQty} 必须按 ${boxSize} 成盒`);
  }

  const total = Number((totalLooseQty / boxSize * boxPrice).toFixed(2));
  let allocated = 0;
  const items = active.map((part, index): MixBoxPayloadItem => {
    const qty = Number(part.looseQty || 0);
    const amount = index === active.length - 1
      ? Number((total - allocated).toFixed(2))
      : Number((total * qty / totalLooseQty).toFixed(2));
    allocated += amount;
    return {
      barcode: String(part.barcode),
      product_name: String(part.productName),
      qty,
      unit_price: Number((amount / qty).toFixed(4)),
      amount,
      sale_unit: '拼盒',
      sale_qty: qty,
      sale_unit_price: boxPrice
    };
  });

  return { items, total: Number(total.toFixed(2)) };
}
