export const DEALER_OUTBOUND_CHUNK_SIZE = 500;
export const DEALER_OUTBOUND_EMPTY_WHITELIST_ERROR = 'dealer_employee_mappings 里没有可用的客户编号白名单';
export const DEALER_OUTBOUND_EMPTY_EXCEL_ERROR = 'Excel 未包含任何可读取内容';
export const DEALER_OUTBOUND_FILE_TYPE_ERROR = '文件格式错误，请选择 .xlsx 或 .xls';

export const JN_IMPORT_CONFIG = Object.freeze({
  prefix: 'JN',
  hint: 'A单号、D客户编号、G条形码',
  columns: {
    order_no: 0,
    bill_date: 2,
    customer_code: 3,
    customer_name: 4,
    barcode: 6,
    product_name: 7,
    package_reg: 8,
    qty_piece: 9,
    qty_scatter: 11
  },
  required: [0, 3, 6]
} as const);

export const CT_IMPORT_CONFIG = Object.freeze({
  prefix: 'CT',
  hint: 'X单号、Q客户编号、AA条形码',
  columns: {
    order_no: 23,
    bill_date: 0,
    customer_code: 16,
    customer_name: 17,
    barcode: 26,
    product_name: 2,
    package_reg: 3,
    qty_piece: 5,
    qty_scatter: 6
  },
  required: [23, 16, 26]
} as const);

export type DealerOutboundRow = {
  import_batch_id: string;
  is_processed: false;
  source_row_no: number;
  order_no: string;
  bill_date: string;
  customer_code: string;
  customer_name: string;
  barcode: string;
  product_name: string;
  package_reg: number;
  qty_piece: number;
  qty_scatter: number;
  import_uid: string;
};

export type DealerOutboundBuildResult = {
  payload: DealerOutboundRow[];
  total: number;
  skipBad: number;
  skipMap: number;
  skipDup: number;
  invalid: string[];
};

export type DealerOutboundWorkbook = {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
};

export type DealerOutboundXlsxLibrary = {
  read(
    data: Uint8Array,
    options: { type: 'array'; cellDates: true }
  ): DealerOutboundWorkbook;
  utils: {
    sheet_to_json(
      worksheet: unknown,
      options: {
        header: 1;
        raw: false;
        dateNF: 'yyyy-mm-dd hh:mm:ss';
        blankrows: false;
      }
    ): unknown[][];
  };
};

export function dealerOutboundText(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

export function dealerOutboundNumber(value: unknown): number {
  const normalized = dealerOutboundText(value).replace(/,/g, '');
  if (!normalized) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

export function dealerOutboundKeyNumber(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 1_000_000) / 1_000_000) : '0';
}

export function normalizeDealerOutboundBarcode(value: unknown): string {
  const normalized = dealerOutboundText(value);
  if (!normalized) return '';
  if (/^[0-9]+(\.0+)?$/.test(normalized)) return normalized.replace(/\.0+$/, '');
  const number = Number(normalized);
  if (Number.isFinite(number) && /e\+?/i.test(normalized)) return String(Math.trunc(number));
  return normalized;
}

export function normalizeDealerOutboundDate(value: unknown): string {
  return dealerOutboundText(value).replace(/\//g, '-').replace(/\s+/g, ' ');
}

export function safeDealerOutboundUidValue(value: unknown): string {
  return dealerOutboundText(value).replace(/\s+/g, ' ').replace(/[|]/g, '/');
}

export function isBadDealerOutboundRequiredValue(value: unknown): boolean {
  const normalized = dealerOutboundText(value).toLowerCase();
  return !normalized || normalized === 'undefined' || normalized === 'null';
}

export function hash16(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const character = value.charCodeAt(index);
    first = Math.imul(first ^ character, 16777619);
    second = Math.imul(second ^ (character + index), 1597334677);
  }
  return `i${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function dealerOutboundImportUid(
  row: Pick<DealerOutboundRow, 'order_no' | 'bill_date' | 'barcode' | 'qty_piece' | 'qty_scatter'>
): string {
  return hash16([
    safeDealerOutboundUidValue(row.order_no),
    normalizeDealerOutboundDate(row.bill_date),
    safeDealerOutboundUidValue(row.barcode),
    dealerOutboundKeyNumber(row.qty_piece),
    dealerOutboundKeyNumber(row.qty_scatter)
  ].join('|'));
}

export function normalizeJnCells(cells: unknown): unknown[] {
  const normalized = Array.isArray(cells) ? cells : [];
  const first = dealerOutboundText(normalized[0]);
  const missesRequiredColumn = JN_IMPORT_CONFIG.required.some(index => normalized[index] === undefined);
  if (first.includes('\t') && (normalized.length <= 2 || missesRequiredColumn)) return first.split('\t');
  return normalized;
}

export function normalizeCtCells(cells: unknown): unknown[] {
  const normalized = Array.isArray(cells) ? cells : [];
  const first = dealerOutboundText(normalized[0]);
  const missesRequiredColumn = CT_IMPORT_CONFIG.required.some(index => normalized[index] === undefined);
  if (first.includes('\t') && (normalized.length <= 2 || missesRequiredColumn)) return first.split('\t');
  return normalized;
}

export function hasDealerOutboundValues(cells: unknown): boolean {
  return normalizeJnCells(cells).some(value => dealerOutboundText(value) !== '');
}

export function isDealerOutboundHeader(cells: unknown): boolean {
  const joined = normalizeJnCells(cells).map(dealerOutboundText).join('|').toLowerCase();
  return (joined.includes('客户') || joined.includes('customer'))
    && (joined.includes('条形码') || joined.includes('barcode'))
    && (joined.includes('单号') || joined.includes('order'));
}

export function dealerOutboundDataRows(rows: readonly unknown[][]): Array<{ cells: unknown[]; sourceRowNo: number }> {
  const values = (rows || [])
    .map((cells, index) => ({ cells: cells || [], sourceRowNo: index + 1 }))
    .filter(row => hasDealerOutboundValues(row.cells));
  return values.length && isDealerOutboundHeader(values[0].cells) ? values.slice(1) : values;
}

export function ctDealerOutboundDataRows(rows: readonly unknown[][]): Array<{ cells: unknown[]; sourceRowNo: number }> {
  const values = (rows || [])
    .map((cells, index) => ({ cells: cells || [], sourceRowNo: index + 1 }))
    .filter(row => normalizeCtCells(row.cells).some(value => dealerOutboundText(value) !== ''));
  if (!values.length) return values;
  const joined = normalizeCtCells(values[0].cells).map(dealerOutboundText).join('|').toLowerCase();
  const isHeader = (joined.includes('客户') || joined.includes('customer'))
    && (joined.includes('条形码') || joined.includes('barcode'))
    && (joined.includes('单号') || joined.includes('order'));
  return isHeader ? values.slice(1) : values;
}

export function makeJnDealerOutboundRow(cells: unknown, batchId: string, sourceRowNo: number): DealerOutboundRow {
  const normalized = normalizeJnCells(cells);
  const columns = JN_IMPORT_CONFIG.columns;
  const row: DealerOutboundRow = {
    import_batch_id: batchId,
    is_processed: false,
    source_row_no: sourceRowNo,
    order_no: dealerOutboundText(normalized[columns.order_no]),
    bill_date: normalizeDealerOutboundDate(normalized[columns.bill_date]),
    customer_code: dealerOutboundText(normalized[columns.customer_code]),
    customer_name: dealerOutboundText(normalized[columns.customer_name]),
    barcode: normalizeDealerOutboundBarcode(normalized[columns.barcode]),
    product_name: dealerOutboundText(normalized[columns.product_name]),
    package_reg: dealerOutboundNumber(normalized[columns.package_reg]),
    qty_piece: dealerOutboundNumber(normalized[columns.qty_piece]),
    qty_scatter: dealerOutboundNumber(normalized[columns.qty_scatter]),
    import_uid: ''
  };
  row.import_uid = dealerOutboundImportUid(row);
  return row;
}

export function makeCtDealerOutboundRow(cells: unknown, batchId: string, sourceRowNo: number): DealerOutboundRow {
  const normalized = normalizeCtCells(cells);
  const columns = CT_IMPORT_CONFIG.columns;
  const row: DealerOutboundRow = {
    import_batch_id: batchId,
    is_processed: false,
    source_row_no: sourceRowNo,
    order_no: dealerOutboundText(normalized[columns.order_no]),
    bill_date: normalizeDealerOutboundDate(normalized[columns.bill_date]),
    customer_code: dealerOutboundText(normalized[columns.customer_code]),
    customer_name: dealerOutboundText(normalized[columns.customer_name]),
    barcode: normalizeDealerOutboundBarcode(normalized[columns.barcode]),
    product_name: dealerOutboundText(normalized[columns.product_name]),
    package_reg: dealerOutboundNumber(normalized[columns.package_reg]),
    qty_piece: dealerOutboundNumber(normalized[columns.qty_piece]),
    qty_scatter: dealerOutboundNumber(normalized[columns.qty_scatter]),
    import_uid: ''
  };
  row.import_uid = dealerOutboundImportUid(row);
  return row;
}

export function buildJnDealerOutboundRows(
  rows: readonly unknown[][],
  whitelist: ReadonlySet<string>,
  now = Date.now()
): DealerOutboundBuildResult {
  const batchId = `${JN_IMPORT_CONFIG.prefix}_${now}`;
  const seen = new Set<string>();
  const payload: DealerOutboundRow[] = [];
  const invalid: string[] = [];
  let skipBad = 0;
  let skipMap = 0;
  let skipDup = 0;
  const list = dealerOutboundDataRows(rows);

  list.forEach(source => {
    const row = makeJnDealerOutboundRow(source.cells, batchId, source.sourceRowNo);
    if (
      isBadDealerOutboundRequiredValue(row.order_no)
      || isBadDealerOutboundRequiredValue(row.barcode)
      || isBadDealerOutboundRequiredValue(row.customer_code)
    ) {
      skipBad += 1;
      if (invalid.length < 5) {
        invalid.push(`第${source.sourceRowNo}行：单号=${row.order_no || '空'}，客户编号=${row.customer_code || '空'}，条码=${row.barcode || '空'}`);
      }
      return;
    }
    if (!whitelist.has(row.customer_code)) {
      skipMap += 1;
      return;
    }
    if (seen.has(row.import_uid)) {
      skipDup += 1;
      return;
    }
    seen.add(row.import_uid);
    payload.push(row);
  });

  return { payload, total: list.length, skipBad, skipMap, skipDup, invalid };
}

export function buildCtDealerOutboundRows(
  rows: readonly unknown[][],
  whitelist: ReadonlySet<string>,
  now = Date.now()
): DealerOutboundBuildResult {
  const batchId = `${CT_IMPORT_CONFIG.prefix}_${now}`;
  const seen = new Set<string>();
  const payload: DealerOutboundRow[] = [];
  const invalid: string[] = [];
  let skipBad = 0;
  let skipMap = 0;
  let skipDup = 0;
  const list = ctDealerOutboundDataRows(rows);

  list.forEach(source => {
    const row = makeCtDealerOutboundRow(source.cells, batchId, source.sourceRowNo);
    if (
      isBadDealerOutboundRequiredValue(row.order_no)
      || isBadDealerOutboundRequiredValue(row.barcode)
      || isBadDealerOutboundRequiredValue(row.customer_code)
    ) {
      skipBad += 1;
      if (invalid.length < 5) {
        invalid.push(`第${source.sourceRowNo}行：单号=${row.order_no || '空'}，客户编号=${row.customer_code || '空'}，条码=${row.barcode || '空'}`);
      }
      return;
    }
    if (!whitelist.has(row.customer_code)) {
      skipMap += 1;
      return;
    }
    if (seen.has(row.import_uid)) {
      skipDup += 1;
      return;
    }
    seen.add(row.import_uid);
    payload.push(row);
  });

  return { payload, total: list.length, skipBad, skipMap, skipDup, invalid };
}

export function dealerOutboundZeroRowsError(result: DealerOutboundBuildResult): string {
  const sample = result.invalid.length ? `\n\n无效行示例：\n${result.invalid.join('\n')}` : '';
  return `有效行解析为0。原始数据 ${result.total} 行，未匹配白名单 ${result.skipMap} 行，无效行 ${result.skipBad} 行。请检查 ${JN_IMPORT_CONFIG.hint} 是否在固定列。${sample}`;
}

export function ctDealerOutboundZeroRowsError(result: DealerOutboundBuildResult): string {
  const sample = result.invalid.length ? `\n\n无效行示例：\n${result.invalid.join('\n')}` : '';
  return `有效行解析为0。原始数据 ${result.total} 行，未匹配白名单 ${result.skipMap} 行，无效行 ${result.skipBad} 行。请检查 ${CT_IMPORT_CONFIG.hint} 是否在固定列。${sample}`;
}

export function dealerOutboundReadyStatus(result: DealerOutboundBuildResult): string {
  return `原始数据 ${result.total} 行\n白名单命中 ${result.payload.length} 行\n跳过未匹配客户 ${result.skipMap} 行\n跳过无效行 ${result.skipBad} 行\n跳过本文件内重复 ${result.skipDup} 行\n正在写入...`;
}

export function dealerOutboundSuccessStatus(result: DealerOutboundBuildResult): string {
  return `数据导入完成。\n原始数据 ${result.total} 行，实际导入/更新 ${result.payload.length} 行。`;
}

export function isDealerOutboundExcelFileName(fileName: string): boolean {
  const extension = String(fileName || '').split('.').pop()?.toLowerCase();
  return extension === 'xlsx' || extension === 'xls';
}

export function splitDealerOutboundChunks<T>(values: readonly T[], size = DEALER_OUTBOUND_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
