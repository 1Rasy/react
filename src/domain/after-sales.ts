export const AFTER_SALE_UNIT = '售后';
export const AFTER_SALE_STATUS = 'SUCCESS_AFTER_SALE';
export const NORMAL_STATUS = 'SUCCESS';
export const AFTER_SALE_REMARK_PREFIX = 'AFTER_SALES:';

export type AfterSaleMap = Record<string, number>;

export function normalizeReturnQty(value: unknown): number {
  const quantity = Number.parseInt(String(value), 10);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

export function parseAfterSaleRemark(remark: unknown): AfterSaleMap {
  const text = String(remark || '').trim();
  if (!text) return {};
  const raw = text.startsWith(AFTER_SALE_REMARK_PREFIX)
    ? text.slice(AFTER_SALE_REMARK_PREFIX.length)
    : text;
  try {
    const source = JSON.parse(raw) as Record<string, unknown> | null;
    const result: AfterSaleMap = {};
    Object.keys(source || {}).forEach(key => {
      const quantity = normalizeReturnQty(source?.[key]);
      if (key && quantity > 0) result[String(key)] = quantity;
    });
    return result;
  } catch {
    return {};
  }
}

export function buildAfterSaleRemark(map: Record<string, unknown> | null | undefined): string | null {
  const clean: AfterSaleMap = {};
  Object.keys(map || {}).forEach(key => {
    const quantity = normalizeReturnQty(map?.[key]);
    if (key && quantity > 0) clean[String(key)] = quantity;
  });
  return Object.keys(clean).length
    ? AFTER_SALE_REMARK_PREFIX + JSON.stringify(clean)
    : null;
}

export function netStockOut(saleStockQty: number, returnQty: number): number {
  return Number(saleStockQty || 0) - normalizeReturnQty(returnQty);
}
