export const STOCK_EFFECTIVE_FROM_DATE = '2026-07-01';

export function dateOnly(value: unknown): string {
  const text = String(value || '').trim();
  return text ? text.slice(0, 10) : '';
}

export function isStockEffectiveDate(value: unknown): boolean {
  const date = dateOnly(value);
  return !date || date >= STOCK_EFFECTIVE_FROM_DATE;
}

export function orderDateToCreatedAt(dateValue: unknown, now = new Date()): string {
  const date = String(dateValue || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return now.toISOString();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return new Date(`${date}T${hours}:${minutes}:${seconds}`).toISOString();
}
