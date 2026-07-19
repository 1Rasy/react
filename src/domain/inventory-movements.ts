export const INVENTORY_EXPORT_HEADERS = Object.freeze([
  '工号', '条码', '规格口味', '库存变化原因', '库存变动数量', '库存变动时间',
  '库存变化类型', '来源单号', '变动前库存', '变动后库存', '操作人'
]);

export const INVENTORY_MOVEMENT_TYPE_LABELS = Object.freeze({
  manual_adjustment: '人工库存调整'
} as const);

export type InventoryRange = 'all' | 'custom';

export type EmployeeOption = {
  employee_code: string;
  name: string;
};

export type InventoryMovement = {
  id?: string | number | null;
  movement_id?: string | number | null;
  employee_code?: string | null;
  product_barcode?: string | number | null;
  spec?: string | null;
  flavor?: string | null;
  reason_display?: string | null;
  quantity_delta?: string | number | null;
  occurred_at?: string | null;
  movement_type?: string | null;
  source_no?: string | null;
  quantity_before?: string | number | null;
  quantity_after?: string | number | null;
  operator_code?: string | null;
};

export type InventoryMovementFilters = {
  startDate: string;
  endDate: string;
  employeeCode: string;
  movementType: string;
};

export type XlsxCell = { v: unknown; t?: string; z?: string };
export type XlsxWorksheet = Record<string, unknown> & {
  '!ref'?: string;
  '!cols'?: Array<{ wch: number }>;
  '!autofilter'?: { ref: string | undefined };
};
export type XlsxLibrary = {
  utils: {
    aoa_to_sheet(rows: Array<Array<string | number>>): XlsxWorksheet;
    book_new(): unknown;
    book_append_sheet(workbook: unknown, worksheet: XlsxWorksheet, name: string): void;
  };
  writeFile(workbook: unknown, filename: string): void;
};

export function formatSpecFlavor(product: Pick<InventoryMovement, 'spec' | 'flavor'>): string {
  return [product.spec, product.flavor]
    .map(value => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ');
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

export function inventoryMovementTypeLabel(value: unknown): string {
  const type = String(value || '');
  return INVENTORY_MOVEMENT_TYPE_LABELS[type as keyof typeof INVENTORY_MOVEMENT_TYPE_LABELS] || type;
}

export function shanghaiToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(now);
}

export function dateOnlyValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function normalizedCustomRange(startDate: string, endDate: string): { start: string; end: string } {
  let start = startDate;
  let end = endDate || startDate;
  if (start && end && end < start) [start, end] = [end, start];
  return { start, end };
}

export function rangeDisplayValue(startDate: string, endDate: string): string {
  if (!startDate && !endDate) return '';
  if (startDate && !endDate) return startDate;
  return `${startDate} - ${endDate || startDate}`;
}

export function resolveInventoryDateRange(
  range: InventoryRange,
  customStart: string,
  customEnd: string,
  today: string
): Pick<InventoryMovementFilters, 'startDate' | 'endDate'> {
  const values = normalizedCustomRange(customStart, customEnd);
  return {
    startDate: range === 'all' ? '2000-01-01' : (values.start || today),
    endDate: range === 'all' ? today : (values.end || values.start || today)
  };
}

export function shanghaiTableTime(value: unknown): string {
  return new Date(String(value || '')).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

export function shanghaiExportTime(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date).replaceAll('/', '-');
}

export function buildInventoryExportRows(movements: readonly InventoryMovement[]): Array<Array<string | number>> {
  return [INVENTORY_EXPORT_HEADERS.slice(), ...movements.map(row => [
    String(row.employee_code || ''),
    String(row.product_barcode || ''),
    formatSpecFlavor(row),
    String(row.reason_display || ''),
    Number(row.quantity_delta || 0),
    shanghaiExportTime(row.occurred_at),
    inventoryMovementTypeLabel(row.movement_type),
    String(row.source_no || ''),
    Number(row.quantity_before || 0),
    Number(row.quantity_after || 0),
    String(row.operator_code || '')
  ])];
}

export function forceBarcodeTextCells(sheet: XlsxWorksheet, dataRowCount: number): XlsxWorksheet {
  for (let row = 2; row < 2 + Number(dataRowCount || 0); row += 1) {
    const ref = `B${row}`;
    const cell = (sheet[ref] || { v: '', t: 's' }) as XlsxCell;
    cell.v = String(cell.v == null ? '' : cell.v);
    cell.t = 's';
    cell.z = '@';
    sheet[ref] = cell;
  }
  return sheet;
}

export function inventoryExportFileName(startDate: string, endDate: string): string {
  const compact = (value: string) => String(value || '').replaceAll('-', '');
  return `库存变动明细_${compact(startDate)}_${compact(endDate)}.xlsx`;
}

export function createInventoryWorkbook(xlsx: XlsxLibrary, movements: readonly InventoryMovement[]): unknown {
  const rows = buildInventoryExportRows(movements);
  const worksheet = xlsx.utils.aoa_to_sheet(rows);
  forceBarcodeTextCells(worksheet, rows.length - 1);
  worksheet['!cols'] = [12, 18, 24, 18, 14, 22, 18, 22, 14, 14, 16].map(wch => ({ wch }));
  worksheet['!autofilter'] = { ref: worksheet['!ref'] };
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, '库存变动明细');
  return workbook;
}
