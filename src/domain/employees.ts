export type EmployeeId = string | number;

export type EmployeeSourceRow = {
  id: EmployeeId;
  employee_code?: string | null;
  name?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

export type EmployeeMapping = {
  id?: EmployeeId | null;
  customer_code?: string | null;
  customer_name?: string | null;
  employee_code?: string | null;
};

export type EmployeeRow = EmployeeSourceRow & {
  employee_code: string;
  name: string;
  is_active: boolean;
  original_employee_code: string;
  customer_code: string;
};

export type EmployeeEditableField = 'employee_code' | 'name' | 'is_active' | 'customer_code';
export type EmployeeDatabaseField = Exclude<EmployeeEditableField, 'customer_code'>;
export type EmployeeDirtyPatch = Partial<Record<EmployeeEditableField, string | boolean>>;
export type EmployeeDatabasePatch = Partial<Record<EmployeeDatabaseField, string | boolean>>;

export const EMPLOYEE_DATABASE_FIELDS: readonly EmployeeDatabaseField[] = [
  'employee_code',
  'name',
  'is_active'
];

export function normalizeCustomerCode(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parts = raw.split(/[\s,，;；]+/).map(part => part.trim()).filter(Boolean);
  return parts.length > 1 ? null : parts[0] || '';
}

export function normalizeEmployeeMappings(rows: readonly EmployeeMapping[]): EmployeeMapping[] {
  return rows.map(row => ({
    ...row,
    customer_code: String(row.customer_code || '').trim(),
    employee_code: String(row.employee_code || '').trim()
  }));
}

export function getEmployeeCustomerCode(
  mappings: readonly EmployeeMapping[],
  employeeCode: unknown
): string {
  const row = mappings.find(mapping => (
    String(mapping.employee_code || '') === String(employeeCode || '')
  ));
  return row ? String(row.customer_code || '').trim() : '';
}

export function buildEmployeeRows(
  rows: readonly EmployeeSourceRow[],
  mappings: readonly EmployeeMapping[]
): EmployeeRow[] {
  return rows.map(row => ({
    ...row,
    employee_code: String(row.employee_code || ''),
    name: String(row.name || ''),
    original_employee_code: String(row.employee_code || ''),
    is_active: row.is_active !== false,
    customer_code: getEmployeeCustomerCode(mappings, row.employee_code)
  }));
}

export function filterEmployees(rows: readonly EmployeeRow[], searchText: unknown): EmployeeRow[] {
  const query = String(searchText || '').trim().toLowerCase();
  return rows.filter(row => {
    const searchable = [row.employee_code, row.name, row.customer_code]
      .map(value => String(value || '').toLowerCase())
      .join(' ');
    return !query || searchable.includes(query);
  });
}

export function sortEmployees(rows: readonly EmployeeRow[]): EmployeeRow[] {
  return [...rows].sort((a, b) => String(a.employee_code || '').localeCompare(
    String(b.employee_code || ''),
    'zh-Hans-CN',
    { numeric: true }
  ));
}

export function normalizeEmployeeFieldValue(
  field: EmployeeEditableField,
  value: unknown
): string | boolean | null {
  if (field === 'is_active') return Boolean(value);
  if (field === 'customer_code') return normalizeCustomerCode(value);
  return String(value ?? '');
}

export function employeeDatabasePatch(patch: EmployeeDirtyPatch): EmployeeDatabasePatch {
  const result: EmployeeDatabasePatch = {};
  EMPLOYEE_DATABASE_FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      (result as Record<string, string | boolean>)[field] = patch[field] as string | boolean;
    }
  });
  return result;
}

export function employeeMappingPlan(
  mappings: readonly EmployeeMapping[],
  nextEmployeeCode: unknown,
  previousEmployeeCode: unknown,
  wantedCustomerCode: unknown
): { nextCode: string; previousCode: string; wantedCode: string | null; toUnassign: string[] } {
  const nextCode = String(nextEmployeeCode || '').trim();
  const previousCode = String(previousEmployeeCode || '').trim();
  const wantedCode = normalizeCustomerCode(wantedCustomerCode);
  if (wantedCode === null) return { nextCode, previousCode, wantedCode, toUnassign: [] };
  const ownedBefore = mappings
    .filter(row => {
      const mappedCode = String(row.employee_code || '').trim();
      return mappedCode === nextCode || Boolean(previousCode && mappedCode === previousCode);
    })
    .map(row => String(row.customer_code || '').trim())
    .filter(Boolean);
  return {
    nextCode,
    previousCode,
    wantedCode,
    toUnassign: ownedBefore.filter(code => code !== wantedCode)
  };
}

export function applyEmployeeMappingChange(
  mappings: readonly EmployeeMapping[],
  plan: { nextCode: string; previousCode: string; wantedCode: string; toUnassign: readonly string[] }
): EmployeeMapping[] {
  const updated = mappings.map(row => {
    const customerCode = String(row.customer_code || '').trim();
    if (customerCode === plan.wantedCode) return { ...row, employee_code: plan.nextCode };
    if (plan.toUnassign.includes(customerCode)) return { ...row, employee_code: '' };
    if (plan.previousCode && String(row.employee_code || '').trim() === plan.previousCode) {
      return { ...row, employee_code: plan.nextCode };
    }
    return row;
  });
  if (plan.wantedCode && !updated.some(row => (
    String(row.customer_code || '').trim() === plan.wantedCode
  ))) {
    updated.push({
      id: null,
      customer_code: plan.wantedCode,
      customer_name: '',
      employee_code: plan.nextCode
    });
  }
  return updated;
}

function errorText(error: unknown): string {
  const source = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown } | null;
  return [source?.message, source?.details, source?.hint, source?.code]
    .filter(Boolean)
    .join(' ');
}

export function isDuplicateEmployeeError(error: unknown): boolean {
  const text = errorText(error);
  return text.includes('employees_employee_code_key')
    || text.includes('duplicate key value')
    || text.includes('23505');
}

export function isEmployeeMappingDuplicateError(error: unknown): boolean {
  const text = errorText(error);
  return text.includes('dealer_employee_mappings_one_customer_per_employee')
    || text.includes('23505');
}

export function employeesSummary(
  employeeCount: number,
  filteredCount: number,
  dirtyCount: number
): string {
  return `共 ${employeeCount} 条，当前显示 ${filteredCount} 条。未保存修改 ${dirtyCount} 条。`;
}
