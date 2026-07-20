import { productDisplayName, type ProductPacking } from './product.ts';

export const STOCK_SUMMARY_PAGE_SIZE = 1000;
export const STOCK_SUMMARY_MAX_ROWS = 100000;
export const INVENTORY_BASELINE_ID = '2026-07-01-opening';
export const INVENTORY_CUTOFF = '2026-07-01T00:00:00+08:00';
export const STOCK_EXPORT_HEADERS = Object.freeze([
  '员工名字', '员工号', '规格口味', '条码', '库存散数'
]);

export type StockEmployee = {
  employee_code?: string | null;
  name?: string | null;
  is_active?: boolean | null;
};

export type StockProduct = ProductPacking & {
  sort_order?: number | string | null;
  brand?: string | null;
  is_active?: boolean | null;
};

export type StockRecord = {
  employee_code?: string | null;
  product_barcode?: string | number | null;
  qty?: string | number | null;
  updated_at?: string | null;
};

export type StockProductDisplay = {
  title: string;
  pcs_per_case: number;
  pcs_per_box: number;
  unit: string;
  sort_order: number;
  id: string | number;
};

export type StockSummaryItem = StockRecord & {
  product_barcode: string;
  qty: number;
  product: StockProductDisplay;
};

export type StockSummaryRow = {
  employee_code: string;
  name: string;
  is_active: boolean;
  itemCount: number;
  negativeCount: number;
  totalQty: number;
  lastUpdated: string;
  items: StockSummaryItem[];
};

export type StockSummaryMetrics = {
  totalEmployees: number;
  recordCount: number;
  totalQty: number;
};

export type StockImportRow = {
  line: number;
  employee_code: string;
  product_barcode: string;
  qty: number;
};

export type StockImportPayloadRow = Omit<StockImportRow, 'line'>;

export type StockImportParseResult = {
  parsed: StockImportRow[];
  errors: string[];
};

export type StockImportMergeResult = {
  rows: StockImportPayloadRow[];
  duplicateCount: number;
};

export type StockBaselineResult = {
  imported_baseline_rows?: number | null;
  written_stock_rows?: number | null;
  employees?: number | null;
  [key: string]: unknown;
};

export type StockSummaryXlsxCell = { v: unknown; t?: string; z?: string };
export type StockSummaryWorksheet = Record<string, unknown> & {
  '!cols'?: Array<{ wch: number }>;
};
export type StockSummaryWorkbook = {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
};
export type StockSummaryXlsxLibrary = {
  read(data: ArrayBuffer, options: { type: 'array'; cellDates: false }): StockSummaryWorkbook;
  utils: {
    sheet_to_json(
      worksheet: unknown,
      options: { header: 1; raw: false; defval: '' }
    ): unknown[][];
    aoa_to_sheet(rows: Array<Array<string | number>>): StockSummaryWorksheet;
    book_new(): unknown;
    book_append_sheet(workbook: unknown, worksheet: StockSummaryWorksheet, name: string): void;
  };
  writeFile(workbook: unknown, filename: string): void;
};

export function stockNumber(value: unknown): number {
  return Number(value || 0);
}

export function formatStockQuantity(value: unknown): string {
  return stockNumber(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

export function formatStockDate(value: unknown): string {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function productSortValue(product: StockProduct): number {
  const sortOrder = Number(product.sort_order);
  if (Number.isFinite(sortOrder) && sortOrder > 0) return sortOrder;
  const id = Number(product.id || 0);
  return Number.isFinite(id) && id > 0 ? id * 10 : 999999;
}

export function compareStockProducts(a: StockProduct, b: StockProduct): number {
  const difference = productSortValue(a) - productSortValue(b);
  if (difference !== 0) return difference;
  return productDisplayName(a, String(a.barcode || '')).localeCompare(
    productDisplayName(b, String(b.barcode || '')),
    'zh-CN',
    { numeric: true }
  );
}

export function stockProductDisplay(
  barcode: unknown,
  products: ReadonlyMap<string, StockProduct>
): StockProductDisplay {
  const normalizedBarcode = String(barcode || '');
  const product = products.get(normalizedBarcode);
  if (!product) {
    return {
      title: normalizedBarcode || '未知条码',
      pcs_per_case: 0,
      pcs_per_box: 0,
      unit: '个',
      sort_order: 999999,
      id: 0
    };
  }
  return {
    title: productDisplayName(product, normalizedBarcode),
    pcs_per_case: stockNumber(product.pcs_per_case),
    pcs_per_box: stockNumber(product.pcs_per_box),
    unit: product.unit || '个',
    sort_order: productSortValue(product),
    id: product.id || 0
  };
}

export function formatStockUnits(totalPcs: unknown, product: Pick<StockProductDisplay, 'pcs_per_case' | 'pcs_per_box' | 'unit'>): string {
  const pieces = stockNumber(totalPcs);
  const piecesPerCase = stockNumber(product.pcs_per_case);
  const piecesPerBox = stockNumber(product.pcs_per_box);
  const unit = product.unit || '个';
  if (piecesPerCase <= 0) return `${formatStockQuantity(pieces)}${unit}`;
  const sign = pieces < 0 ? '-' : '';
  let remainder = Math.abs(pieces);
  const cases = Math.floor(remainder / piecesPerCase);
  remainder %= piecesPerCase;
  if (piecesPerBox > 0) {
    const boxes = Math.floor(remainder / piecesPerBox);
    const loose = remainder % piecesPerBox;
    return `${sign}${cases}件 ${boxes}盒 ${loose}${unit}`;
  }
  return `${sign}${cases}件 ${remainder}${unit}`;
}

export function buildStockSummaryRows(
  stocks: readonly StockRecord[],
  employees: readonly StockEmployee[],
  products: readonly StockProduct[],
  searchText = ''
): StockSummaryRow[] {
  const search = String(searchText || '').trim().toLowerCase();
  const employeeMap = new Map(employees.map(employee => [String(employee.employee_code || ''), employee]));
  const productMap = new Map(products.map(product => [String(product.barcode || ''), product]));
  const grouped = new Map<string, StockSummaryRow>();

  stocks.forEach(stock => {
    const employeeCode = String(stock.employee_code || '');
    const barcode = String(stock.product_barcode || '');
    const amount = stockNumber(stock.qty);
    const employee = employeeMap.get(employeeCode) || { employee_code: employeeCode, name: '' };
    const product = stockProductDisplay(barcode, productMap);
    const haystack = [employeeCode, employee.name, barcode, product.title].join(' ').toLowerCase();
    if (search && !haystack.includes(search)) return;

    if (!grouped.has(employeeCode)) {
      grouped.set(employeeCode, {
        employee_code: employeeCode,
        name: employee.name || '',
        is_active: employee.is_active !== false,
        itemCount: 0,
        negativeCount: 0,
        totalQty: 0,
        lastUpdated: '',
        items: []
      });
    }

    const row = grouped.get(employeeCode)!;
    row.itemCount += 1;
    row.totalQty += amount;
    if (amount < 0) row.negativeCount += 1;
    if (!row.lastUpdated || String(stock.updated_at || '') > row.lastUpdated) {
      row.lastUpdated = String(stock.updated_at || '');
    }
    row.items.push({ ...stock, product_barcode: barcode, product, qty: amount });
  });

  return Array.from(grouped.values())
    .map(row => {
      row.items.sort((a, b) => (
        a.product.sort_order - b.product.sort_order
        || a.product_barcode.localeCompare(b.product_barcode, 'zh-CN', { numeric: true })
      ));
      return row;
    })
    .sort((a, b) => (
      a.totalQty - b.totalQty
      || b.itemCount - a.itemCount
      || a.employee_code.localeCompare(b.employee_code, 'zh-CN', { numeric: true })
    ));
}

export function stockSummaryMetrics(stocks: readonly StockRecord[]): StockSummaryMetrics {
  return {
    totalEmployees: new Set(
      stocks.map(stock => String(stock.employee_code || '')).filter(Boolean)
    ).size,
    recordCount: stocks.length,
    totalQty: stocks.reduce((sum, stock) => sum + stockNumber(stock.qty), 0)
  };
}

export function toggleExpandedEmployee(currentEmployeeCode: string, clickedEmployeeCode: string): string {
  return currentEmployeeCode === clickedEmployeeCode ? '' : clickedEmployeeCode;
}

export function buildStockExportRows(rows: readonly StockSummaryRow[]): Array<Array<string | number>> {
  const data: Array<Array<string | number>> = [STOCK_EXPORT_HEADERS.slice()];
  rows.forEach(row => row.items.forEach(item => data.push([
    row.name || '',
    row.employee_code,
    item.product.title,
    String(item.product_barcode || ''),
    item.qty
  ])));
  return data;
}

export function forceStockBarcodeTextCells(worksheet: StockSummaryWorksheet, dataRowCount: number): StockSummaryWorksheet {
  for (let row = 2; row < 2 + Number(dataRowCount || 0); row += 1) {
    const reference = `D${row}`;
    const cell = (worksheet[reference] || { v: '', t: 's' }) as StockSummaryXlsxCell;
    cell.v = String(cell.v == null ? '' : cell.v);
    cell.t = 's';
    cell.z = '@';
    worksheet[reference] = cell;
  }
  return worksheet;
}

export function stockExportFileName(now = new Date()): string {
  return `库存管理_${now.toISOString().slice(0, 10)}.xlsx`;
}

export function createStockSummaryWorkbook(xlsx: StockSummaryXlsxLibrary, rows: readonly StockSummaryRow[]): unknown {
  const data = buildStockExportRows(rows);
  const worksheet = xlsx.utils.aoa_to_sheet(data);
  forceStockBarcodeTextCells(worksheet, data.length - 1);
  worksheet['!cols'] = [14, 14, 38, 18, 12].map(wch => ({ wch }));
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, '库存管理');
  return workbook;
}

export function normalizeImportText(value: unknown): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

export function normalizeImportCode(value: unknown): string {
  const text = normalizeImportText(value);
  return /^\d+\.0$/.test(text) ? text.replace(/\.0$/, '') : text;
}

export function parseImportQuantity(value: unknown): number {
  const text = normalizeImportText(value).replace(/,/g, '');
  return text === '' ? Number.NaN : Number(text);
}

export function parseStockImportRows(rows: readonly unknown[][]): StockImportParseResult {
  const parsed: StockImportRow[] = [];
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const line = index + 1;
    const employeeCode = normalizeImportCode(row[0]);
    const barcode = normalizeImportCode(row[1]);
    const quantityValue = parseImportQuantity(row[2]);
    const isBlank = !employeeCode && !barcode && !normalizeImportText(row[2]);
    if (isBlank) return;
    const looksLikeHeader = line === 1
      && /员工|employee/i.test(employeeCode)
      && /条码|barcode/i.test(barcode);
    if (looksLikeHeader) return;
    if (!employeeCode || !barcode || !Number.isFinite(quantityValue) || !Number.isInteger(quantityValue)) {
      errors.push(`第 ${line} 行格式错误：A列员工编号、B列条码、C列整数散数都不能为空`);
      return;
    }
    parsed.push({
      line,
      employee_code: employeeCode,
      product_barcode: barcode,
      qty: quantityValue
    });
  });
  return { parsed, errors };
}

export function splitStockImportChunks<T>(values: readonly T[], size = 500): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function mergeStockImportRows(rows: readonly StockImportRow[]): StockImportMergeResult {
  const merged = new Map<string, StockImportPayloadRow>();
  let duplicateCount = 0;
  rows.forEach(row => {
    const key = `${row.employee_code}|${row.product_barcode}`;
    if (merged.has(key)) duplicateCount += 1;
    merged.set(key, {
      employee_code: row.employee_code,
      product_barcode: row.product_barcode,
      qty: row.qty
    });
  });
  return { rows: Array.from(merged.values()), duplicateCount };
}

export function missingStockImportValues(
  parsed: readonly StockImportRow[],
  validEmployees: ReadonlySet<string>,
  validProducts: ReadonlySet<string>
): { missingEmployees: string[]; missingProducts: string[] } {
  const employeeCodes = parsed.map(row => row.employee_code);
  const barcodes = parsed.map(row => row.product_barcode);
  return {
    missingEmployees: Array.from(new Set(employeeCodes.filter(code => !validEmployees.has(code)))),
    missingProducts: Array.from(new Set(barcodes.filter(code => !validProducts.has(code))))
  };
}

export function stockImportMissingValuesMessage(missingEmployees: readonly string[], missingProducts: readonly string[]): string {
  const parts: string[] = [];
  if (missingEmployees.length) {
    parts.push(`员工编号不存在：${missingEmployees.slice(0, 20).join('、')}${missingEmployees.length > 20 ? ' 等' : ''}`);
  }
  if (missingProducts.length) {
    parts.push(`商品条码不存在：${missingProducts.slice(0, 20).join('、')}${missingProducts.length > 20 ? ' 等' : ''}`);
  }
  return parts.join('\n');
}

export function stockImportConfirmation(rows: readonly StockImportPayloadRow[]): string {
  const affectedEmployees = new Set(rows.map(row => row.employee_code)).size;
  const includesProtectedEmployee = rows.some(
    row => row.employee_code.toLowerCase() === 's260401018'
  );
  const specialNote = includesProtectedEmployee
    ? '\n\n文件包含 S260401018：他的原68条保留库存会由本文件中的期初库存替换。'
    : '\n\n文件未包含 S260401018：他的原68条保留库存保持不变。';
  return `将导入 ${rows.length} 条 2026-07-01 期初库存，涉及 ${affectedEmployees} 名员工。\n\n系统会替换这些员工的期初库存，并自动减去 2026-07-01 及之后的全部订单销量。${specialNote}\n\n确认继续吗？`;
}

export function stockImportSuccessMessage(options: {
  result: StockBaselineResult;
  rows: readonly StockImportPayloadRow[];
  duplicateCount: number;
  loadedStockCount: number;
}): string {
  const { result, rows, duplicateCount, loadedStockCount } = options;
  const affectedEmployees = new Set(rows.map(row => row.employee_code)).size;
  const negativeCount = rows.filter(row => row.qty < 0).length;
  return `导入完成：期初库存 ${result.imported_baseline_rows ?? rows.length} 条，重算库存 ${result.written_stock_rows ?? '-'} 条，页面已读取 ${loadedStockCount} 条完整库存，涉及 ${result.employees ?? affectedEmployees} 名员工${negativeCount ? `，负数期初库存 ${negativeCount} 条` : ''}${duplicateCount ? `，重复行按最后一行覆盖 ${duplicateCount} 条` : ''}。`;
}
