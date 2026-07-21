export type DashboardRange = 'today' | 'yesterday' | '7d' | 'month' | 'all' | 'custom';

export type DashboardDateRange = {
  start: Date | null;
  end: Date | null;
};

export type DashboardOrder = {
  id?: unknown;
  order_no?: unknown;
  created_at?: unknown;
  employee_code?: unknown;
  atom_code?: unknown;
  store_name?: unknown;
  total_amount?: unknown;
  status?: unknown;
};

export type DashboardEmployee = {
  employee_code?: unknown;
  name?: unknown;
  is_active?: boolean | null;
};

export type DashboardMetrics = {
  totalAmount: number;
  orderCount: number;
  avgOrderAmount: number;
};

export type DashboardEmployeeRow = {
  code: string;
  name: string;
  total: number;
  count: number;
  last: unknown;
};

export type DashboardTrendRow = readonly [date: string, amount: number];

export type DashboardTrendBounds = {
  max: number;
  min: number | null;
};

export type DashboardExportSourceRow = {
  order_no?: unknown;
  barcode?: unknown;
  sale_unit?: unknown;
  sale_qty?: unknown;
  qty?: unknown;
  sale_unit_price?: unknown;
  unit_price?: unknown;
  amount?: unknown;
  pcs_per_box?: unknown;
  employee_code?: unknown;
  employee_name?: unknown;
  atom_code?: unknown;
  store_name?: unknown;
  created_at?: unknown;
  spec?: unknown;
  flavor?: unknown;
};

export type DashboardExportRow = {
  isMix: boolean;
  storeKey: string;
  date: string;
  empName: unknown;
  empCode: string;
  atom: string;
  store: unknown;
  product: string;
  barcode: string;
  wholeQty: number;
  wholePrice: number | '';
  looseQty: number;
  loosePrice: number | '';
  amount: number;
};

export const DASHBOARD_EXPORT_HEADERS = [
  '开单日期', '员工', '员工号', '门店编号', '门店', '规格口味',
  '条码', '整数', '整价', '散数', '散价', '金额'
] as const;

export type DashboardWorksheet = Record<string, any>;
export type DashboardWorkbook = Record<string, any>;
export type DashboardXlsxLibrary = {
  utils: {
    book_new(): DashboardWorkbook;
    aoa_to_sheet(data: readonly (readonly unknown[])[]): DashboardWorksheet;
    book_append_sheet(workbook: DashboardWorkbook, worksheet: DashboardWorksheet, name: string): void;
    decode_range(reference: string): { s: { r: number; c: number }; e: { r: number; c: number } };
    encode_cell(position: { r: number; c: number }): string;
  };
  writeFile(
    workbook: DashboardWorkbook,
    filename: string,
    options: { cellStyles: true }
  ): void;
};

function localMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function dateOnlyValue(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

export function formatDashboardDateOnly(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return dateOnlyValue(date);
}

export function formatDashboardDateTime(value: unknown): string {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')} ` +
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatDashboardMoney(value: unknown): string {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function rangeDisplayValue(start: string, end: string): string {
  if (!start && !end) return '';
  if (start && !end) return start;
  return `${start} - ${end || start}`;
}

export function normalizeCustomDateRange(start: string, end: string): {
  start: string;
  end: string;
} {
  let normalizedStart = start;
  let normalizedEnd = end || start;
  if (normalizedStart && normalizedEnd && normalizedEnd < normalizedStart) {
    [normalizedStart, normalizedEnd] = [normalizedEnd, normalizedStart];
  }
  return { start: normalizedStart, end: normalizedEnd };
}

export function resolveDashboardDateRange(
  range: DashboardRange,
  customStart = '',
  customEnd = '',
  now = new Date()
): DashboardDateRange {
  if (range === 'all') return { start: null, end: null };
  if (range === 'custom') {
    const custom = normalizeCustomDateRange(customStart, customEnd);
    return {
      start: custom.start ? new Date(`${custom.start}T00:00:00`) : null,
      end: custom.end ? new Date(`${custom.end}T23:59:59`) : null
    };
  }
  if (range === 'yesterday') {
    const start = localMidnight(now);
    start.setDate(start.getDate() - 1);
    const end = localMidnight(now);
    end.setSeconds(-1);
    return { start, end };
  }
  if (range === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end: null };
  }
  if (range === 'month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
  }
  return { start: localMidnight(now), end: null };
}

function formatDateForFile(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}号`;
}

export function getDashboardExportDateLabel(
  range: DashboardRange,
  customStart = '',
  customEnd = '',
  now = new Date()
): string {
  if (range === 'all') return '全部历史';
  const dates = resolveDashboardDateRange(range, customStart, customEnd, now);
  if (!dates.start) return '全部历史';
  const end = dates.end || new Date(now);
  if (!dates.end) end.setHours(23, 59, 59, 999);
  const startLabel = formatDateForFile(dates.start);
  const endLabel = formatDateForFile(end);
  return startLabel === endLabel ? startLabel : `${startLabel}-${endLabel}`;
}

export function getDashboardExportFileName(
  range: DashboardRange,
  customStart = '',
  customEnd = '',
  now = new Date()
): string {
  return `开单明细_${getDashboardExportDateLabel(range, customStart, customEnd, now)}.xlsx`;
}

export function filterDashboardOrders(
  orders: readonly DashboardOrder[],
  employeeCode: string
): DashboardOrder[] {
  if (!employeeCode) return [...orders];
  return orders.filter(order => String(order.employee_code || '') === employeeCode);
}

export function visibleDashboardEmployees(
  employees: readonly DashboardEmployee[]
): DashboardEmployee[] {
  return employees.filter(employee => employee.is_active !== false);
}

export function buildDashboardMetrics(
  orders: readonly DashboardOrder[]
): DashboardMetrics {
  const totalAmount = orders.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0
  );
  return {
    totalAmount,
    orderCount: orders.length,
    avgOrderAmount: orders.length ? totalAmount / orders.length : 0
  };
}

export function buildDashboardEmployeeRows(
  orders: readonly DashboardOrder[],
  employees: readonly DashboardEmployee[]
): DashboardEmployeeRow[] {
  const employeesByCode = new Map(
    employees.map(employee => [String(employee.employee_code || ''), employee])
  );
  const grouped = new Map<string, DashboardEmployeeRow>();
  orders.forEach(order => {
    const code = String(order.employee_code || '');
    if (!grouped.has(code)) {
      grouped.set(code, {
        code,
        name: String(employeesByCode.get(code)?.name || code),
        total: 0,
        count: 0,
        last: ''
      });
    }
    const row = grouped.get(code)!;
    row.total += Number(order.total_amount || 0);
    row.count += 1;
    if (!row.last || String(order.created_at) > String(row.last)) {
      row.last = order.created_at;
    }
  });
  return Array.from(grouped.values()).sort((left, right) => right.total - left.total);
}

export function buildDashboardTrendRows(
  orders: readonly DashboardOrder[],
  range: DashboardRange,
  now = new Date()
): DashboardTrendRow[] {
  const totals = new Map<string, number>();
  orders.forEach(order => {
    const date = formatDashboardDateOnly(order.created_at);
    totals.set(date, (totals.get(date) || 0) + Number(order.total_amount || 0));
  });
  if (range !== '7d') {
    return Array.from(totals.entries()).sort((left, right) =>
      left[0].localeCompare(right[0])
    );
  }
  const end = localMidnight(now);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - 6 + index);
    const key = dateOnlyValue(date);
    return [key, totals.get(key) || 0] as const;
  });
}

export function formatDashboardTrendDate(value: unknown): string {
  const parts = String(value || '').slice(0, 10).split('-');
  if (parts.length !== 3) return String(value || '');
  return `${Number(parts[1])}.${String(Number(parts[2])).padStart(2, '0')}`;
}

export function dashboardTrendBounds(
  rows: readonly DashboardTrendRow[]
): DashboardTrendBounds {
  const values = rows.map(row => Number(row[1] || 0));
  const positives = values.filter(value => value > 0);
  return {
    max: Math.max(...values, 1),
    min: positives.length ? Math.min(...positives) : null
  };
}

export function dashboardTrendLabelIndexes(
  count: number,
  labelAll: boolean
): number[] {
  const step = labelAll ? 1 : Math.max(1, Math.ceil(count / 7));
  return Array.from({ length: count }, (_, index) => index).filter(index =>
    index === 0 || index === count - 1 || index % step === 0
  );
}

export function formatPendingStockAdjustmentCount(count: number): string {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

export function exportProductName(product: {
  spec?: unknown;
  flavor?: unknown;
  barcode?: unknown;
}): string {
  const label = [product?.spec, product?.flavor]
    .map(value => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return label || String(product?.barcode || '');
}

export function buildDashboardExportRows(
  sourceRows: readonly DashboardExportSourceRow[]
): DashboardExportRow[] {
  const aggregated = new Map<string, DashboardExportRow>();
  sourceRows.forEach(item => {
    const barcode = String(item.barcode || '');
    const saleUnit = String(item.sale_unit || '散');
    const saleQty = Number(item.sale_qty ?? item.qty ?? 0);
    const salePrice = Number(item.sale_unit_price ?? item.unit_price ?? 0);
    const amount = Number(item.amount || 0);
    const isMix = saleUnit === '拼盒';
    const key = `${item.order_no}|${barcode}|${saleUnit}`;
    if (!aggregated.has(key)) {
      const employeeCode = String(item.employee_code || '');
      aggregated.set(key, {
        isMix,
        storeKey: `${String(item.atom_code || '')}|${item.store_name || ''}`,
        date: formatDashboardDateOnly(item.created_at),
        empName: item.employee_name || employeeCode,
        empCode: employeeCode,
        atom: String(item.atom_code || ''),
        store: item.store_name || '',
        product: exportProductName(item),
        barcode,
        wholeQty: 0,
        wholePrice: '',
        looseQty: 0,
        loosePrice: '',
        amount: 0
      });
    }
    const row = aggregated.get(key)!;
    if (isMix) {
      const mixSize = Number(item.pcs_per_box || 0) || 1;
      row.looseQty += saleQty;
      row.loosePrice = Number((salePrice / mixSize).toFixed(2));
    } else if (saleUnit === '整') {
      row.wholeQty += saleQty;
      row.wholePrice = salePrice;
    } else {
      row.looseQty += saleQty;
      row.loosePrice = salePrice;
    }
    row.amount += amount;
  });
  return Array.from(aggregated.values()).sort((left, right) =>
    left.storeKey.localeCompare(right.storeKey, 'zh-CN', { numeric: true }) ||
    left.date.localeCompare(right.date) ||
    left.product.localeCompare(right.product, 'zh-CN', { numeric: true }) ||
    left.barcode.localeCompare(right.barcode, 'zh-CN', { numeric: true })
  );
}

function exportData(rows: readonly DashboardExportRow[]): unknown[][] {
  return [
    [...DASHBOARD_EXPORT_HEADERS],
    ...rows.map(row => [
      row.date,
      row.empName,
      row.empCode,
      row.atom,
      row.store,
      row.product,
      row.barcode,
      row.wholeQty || '',
      row.wholePrice === '' ? '' : Number(row.wholePrice),
      row.looseQty || '',
      row.loosePrice === '' ? '' : Number(row.loosePrice),
      Number(row.amount.toFixed(2))
    ])
  ];
}

export function excelTextLen(value: unknown): number {
  return Array.from(String(value ?? '')).reduce(
    (sum, character) => sum + (/[^\x00-\xff]/.test(character) ? 2 : 1),
    0
  );
}

export function buildExportColumnWidths(
  data: readonly (readonly unknown[])[]
): { wch: number }[] {
  const minimum = [10, 8, 10, 12, 14, 18, 15, 8, 8, 8, 8, 10];
  const maximum = [14, 14, 14, 18, 46, 58, 20, 10, 10, 10, 10, 14];
  const widths = minimum.slice();
  data.forEach(row => row.forEach((cell, index) => {
    widths[index] = Math.max(
      widths[index] || 8,
      Math.min(maximum[index] || 30, excelTextLen(cell) + 2)
    );
  }));
  return widths.map(wch => ({ wch }));
}

export function applyExportStyles(
  xlsx: DashboardXlsxLibrary,
  worksheet: DashboardWorksheet,
  data: readonly (readonly unknown[])[],
  storeKeys: readonly string[]
): void {
  const range = xlsx.utils.decode_range(String(worksheet['!ref']));
  const border = {
    top: { style: 'thin', color: { rgb: 'E7E1E8' } },
    bottom: { style: 'thin', color: { rgb: 'E7E1E8' } },
    left: { style: 'thin', color: { rgb: 'E7E1E8' } },
    right: { style: 'thin', color: { rgb: 'E7E1E8' } }
  };
  const headerStyle = {
    fill: { patternType: 'solid', fgColor: { rgb: '4A154B' } },
    font: { color: { rgb: 'FFFFFF' }, bold: true },
    alignment: { horizontal: 'center', vertical: 'center' },
    border
  };
  const whiteStyle = {
    fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
    alignment: { vertical: 'center' },
    border
  };
  const grayStyle = {
    fill: { patternType: 'solid', fgColor: { rgb: 'F4F2F5' } },
    alignment: { vertical: 'center' },
    border
  };
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const reference = xlsx.utils.encode_cell({ r: 0, c: column });
    if (worksheet[reference]) worksheet[reference].s = headerStyle;
  }
  let lastStore = '';
  let groupIndex = -1;
  for (let row = 1; row < data.length; row += 1) {
    const storeKey = storeKeys[row - 1] || '';
    if (storeKey !== lastStore) {
      groupIndex += 1;
      lastStore = storeKey;
    }
    const style = groupIndex % 2 === 0 ? whiteStyle : grayStyle;
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const reference = xlsx.utils.encode_cell({ r: row, c: column });
      if (!worksheet[reference]) worksheet[reference] = { t: 's', v: '' };
      worksheet[reference].s = style;
    }
  }
  worksheet['!rows'] = [
    { hpt: 24 },
    ...Array(Math.max(0, data.length - 1)).fill({ hpt: 22 })
  ];
  worksheet['!autofilter'] = { ref: worksheet['!ref'] };
}

function appendExportSheet(
  xlsx: DashboardXlsxLibrary,
  workbook: DashboardWorkbook,
  rows: readonly DashboardExportRow[],
  name: string
): void {
  const data = exportData(rows);
  const worksheet = xlsx.utils.aoa_to_sheet(data);
  worksheet['!cols'] = buildExportColumnWidths(data);
  applyExportStyles(xlsx, worksheet, data, rows.map(row => row.storeKey));
  xlsx.utils.book_append_sheet(workbook, worksheet, name);
}

export function createDashboardWorkbook(
  xlsx: DashboardXlsxLibrary,
  rows: readonly DashboardExportRow[]
): DashboardWorkbook {
  const normalRows = rows.filter(row => !String(row.atom || '').startsWith('NEW_'));
  const offlineRows = rows.filter(row => String(row.atom || '').startsWith('NEW_'));
  const workbook = xlsx.utils.book_new();
  appendExportSheet(xlsx, workbook, normalRows, '开单明细');
  if (offlineRows.length) {
    appendExportSheet(xlsx, workbook, offlineRows, '线外门店');
  }
  return workbook;
}

