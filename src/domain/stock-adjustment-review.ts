export const STOCK_ADJUSTMENT_REASON_LABELS = Object.freeze({
  inventory_count: '盘点差异',
  damage: '破损报废',
  transfer: '调货',
  other: '其他'
} as const);

export type StockAdjustmentRequest = {
  id?: string | null;
  request_no?: string | null;
  employee_code?: string | null;
  reason_code?: string | null;
  reason_note?: string | null;
  remark?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewer_code?: string | null;
  status?: string | null;
  rejection_reason?: string | null;
};

export type StockAdjustmentItem = {
  product_barcode?: string | null;
  product_name?: string | null;
  spec?: string | null;
  flavor?: string | null;
  adjustment_qty?: string | number | null;
};

export type StockAdjustmentStock = {
  product_barcode?: string | null;
  qty?: string | number | null;
};

export type StockAdjustmentReviewEntry = {
  request?: StockAdjustmentRequest | null;
  items?: StockAdjustmentItem[] | null;
  stocks?: StockAdjustmentStock[] | null;
};

export type StockAdjustmentEmployee = {
  employee_code?: string | null;
  name?: string | null;
};

export type StockAdjustmentReviewPageData = {
  pendingRows: StockAdjustmentReviewEntry[];
  historyRows: StockAdjustmentReviewEntry[];
  employees: StockAdjustmentEmployee[];
};

export type ReviewHistoryStatusMeta = {
  label: '已通过' | '已驳回';
  className: 'status-approved' | 'status-rejected';
};

export function reasonLabel(code: unknown): string {
  const value = String(code || '');
  return STOCK_ADJUSTMENT_REASON_LABELS[value as keyof typeof STOCK_ADJUSTMENT_REASON_LABELS] || value;
}

export function formatSpecFlavor(item: Pick<StockAdjustmentItem, 'spec' | 'flavor'>): string {
  return [item.spec, item.flavor]
    .map(value => String(value == null ? '' : value).trim())
    .filter(Boolean)
    .join(' ');
}

export function formatReviewDate(value: unknown): string {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

export function quantityClass(value: unknown): 'qty-positive' | 'qty-negative' | 'qty-zero' {
  const amount = Number(value);
  if (amount > 0) return 'qty-positive';
  if (amount < 0) return 'qty-negative';
  return 'qty-zero';
}

export function signedQuantity(value: unknown): string {
  const amount = Number(value);
  return `${amount > 0 ? '+' : ''}${amount}`;
}

export function requestDetailNote(request: StockAdjustmentRequest): string {
  return [request.reason_note, request.remark ? `备注：${request.remark}` : '']
    .filter(Boolean)
    .join('；');
}

export function reviewMetrics(rows: readonly StockAdjustmentReviewEntry[]): {
  requestCount: number;
  itemCount: number;
} {
  return {
    requestCount: rows.length,
    itemCount: rows.reduce((sum, entry) => sum + (Array.isArray(entry.items) ? entry.items.length : 0), 0)
  };
}

export function stockBeforeByBarcode(entry: StockAdjustmentReviewEntry): Map<string | null | undefined, number> {
  return new Map((entry.stocks || []).map(item => [item.product_barcode, Number(item.qty)]));
}

export function historyStatusMeta(status: unknown): ReviewHistoryStatusMeta {
  return status === 'approved'
    ? { label: '已通过', className: 'status-approved' }
    : { label: '已驳回', className: 'status-rejected' };
}

export function employeeName(
  names: ReadonlyMap<string, string | null | undefined>,
  employeeCode: unknown
): string {
  return names.get(String(employeeCode || '')) || '—';
}

export function errorMessage(error: unknown, fallback: string): string {
  return String((error as { message?: unknown } | null)?.message || fallback);
}

export function createReviewActionGuard() {
  let active = false;
  return {
    begin(): boolean {
      if (active) return false;
      active = true;
      return true;
    },
    end(): void {
      active = false;
    },
    isActive(): boolean {
      return active;
    }
  };
}
