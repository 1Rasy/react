export const STORE_IMPORT_EMPLOYEE_HEADER = '门店负责人员工号';
export const STORE_IMPORT_ATOM_HEADER = 'ATOM门店编号';
export const STORE_IMPORT_NAME_HEADER = '门店名称';

export type StoreImportExcelRow = Record<string, unknown>;

export type StoreImportPayload = {
  employee_code: string;
  atom_code: string;
  store_name: string;
};

export type StoreImportWorkbook = {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
};

export type StoreImportXlsxLibrary = {
  read(data: Uint8Array, options: { type: 'array' }): StoreImportWorkbook;
  utils: {
    sheet_to_json(worksheet: unknown): StoreImportExcelRow[];
  };
};

function cleanQuotedCode(value: unknown): string {
  return String(value).trim().replace(/["']/g, '');
}

export function buildStoreImportPayloads(
  rows: readonly StoreImportExcelRow[],
  employeeWhitelist: ReadonlySet<string>
): StoreImportPayload[] {
  const payloads: StoreImportPayload[] = [];
  const seenStoreCodes = new Set<string>();

  rows.forEach(row => {
    const rawEmployeeCode = row[STORE_IMPORT_EMPLOYEE_HEADER];
    const rawStoreCode = row[STORE_IMPORT_ATOM_HEADER];
    const rawStoreName = row[STORE_IMPORT_NAME_HEADER];
    if (!rawEmployeeCode || !rawStoreCode || !rawStoreName) return;

    const employeeCode = cleanQuotedCode(rawEmployeeCode);
    const storeCode = cleanQuotedCode(rawStoreCode);
    if (!employeeWhitelist.has(employeeCode) || seenStoreCodes.has(storeCode)) return;

    seenStoreCodes.add(storeCode);
    payloads.push({
      employee_code: employeeCode,
      atom_code: storeCode,
      store_name: String(rawStoreName).trim()
    });
  });

  return payloads;
}
