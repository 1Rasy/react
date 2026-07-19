export type ProductPacking = {
  barcode?: string | number | null;
  id?: string | number | null;
  spec?: string | null;
  flavor?: string | null;
  unit?: string | null;
  default_price?: number | string | null;
  pcs_per_case?: number | string | null;
  pcs_per_box?: number | string | null;
};

export type OrderItemQuantities = {
  wholeQty?: number | null;
  looseQty?: number | null;
  mixQty?: number | null;
  wholePrice?: number | null;
  loosePrice?: number | null;
};

export function productDisplayName(product: ProductPacking, fallback = ''): string {
  const label = [product.spec, product.flavor]
    .map(value => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return label || String(fallback || product.barcode || product.id || '').trim();
}

export function isThreeLevelProduct(product: ProductPacking): boolean {
  return Number(product.pcs_per_box || 0) > 0;
}

export function packSize(product: ProductPacking): number {
  return isThreeLevelProduct(product)
    ? Number(product.pcs_per_box || 1)
    : Number(product.pcs_per_case || 1);
}

export function wholeDefaultPrice(product: ProductPacking): number {
  return Number((Number(product.default_price || 0) * packSize(product)).toFixed(2));
}

export function stockQtyFromItem(product: ProductPacking, item: OrderItemQuantities): number {
  return Number(item.wholeQty || 0) * packSize(product)
    + Number(item.looseQty || 0)
    + Number(item.mixQty || 0);
}

export function amountFromItem(item: OrderItemQuantities): number {
  return Number(item.wholeQty || 0) * Number(item.wholePrice || 0)
    + Number(item.looseQty || 0) * Number(item.loosePrice || 0);
}
