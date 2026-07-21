import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EmployeeDatabasePatch,
  EmployeeMapping,
  EmployeeSourceRow
} from '../domain/employees.ts';

type UntypedSupabaseClient = SupabaseClient<any, 'public', any>;

export type NewEmployeePayload = {
  employee_code: string;
  name: string;
  is_active: boolean;
};

export type EmployeesPageData = {
  employees: EmployeeSourceRow[];
  mappings: EmployeeMapping[];
};

export type EmployeesRepositoryErrorSource =
  | 'employees-load'
  | 'mappings-load'
  | 'employee-insert'
  | 'employee-update'
  | 'mapping-unassign'
  | 'mapping-upsert';

export class EmployeesRepositoryError extends Error {
  readonly source: EmployeesRepositoryErrorSource;
  readonly rawError: unknown;

  constructor(
    source: EmployeesRepositoryErrorSource,
    rawError: unknown
  ) {
    super(String((rawError as { message?: unknown } | null)?.message || rawError || 'Supabase 请求失败'));
    this.name = 'EmployeesRepositoryError';
    this.source = source;
    this.rawError = rawError;
  }
}

export function createEmployeesRepository(client: UntypedSupabaseClient) {
  if (!client || typeof client.from !== 'function') {
    throw new Error('Supabase client 未初始化');
  }

  return {
    async loadEmployees(): Promise<EmployeesPageData> {
      const [employeeRes, mappingRes] = await Promise.all([
        client
          .from('employees')
          .select('id, employee_code, name, is_active, created_at')
          .order('employee_code', { ascending: true }),
        client
          .from('dealer_employee_mappings')
          .select('id, customer_code, customer_name, employee_code')
          .order('customer_code', { ascending: true })
      ]);
      if (employeeRes.error) {
        throw new EmployeesRepositoryError('employees-load', employeeRes.error);
      }
      if (mappingRes.error) {
        throw new EmployeesRepositoryError('mappings-load', mappingRes.error);
      }
      return {
        employees: (employeeRes.data || []) as EmployeeSourceRow[],
        mappings: (mappingRes.data || []) as EmployeeMapping[]
      };
    },

    async insertEmployee(payload: NewEmployeePayload): Promise<EmployeeSourceRow> {
      const { data, error } = await client
        .from('employees')
        .insert(payload)
        .select('id, employee_code, name, is_active, created_at')
        .single();
      if (error) throw new EmployeesRepositoryError('employee-insert', error);
      return data as EmployeeSourceRow;
    },

    async updateEmployee(id: string, patch: EmployeeDatabasePatch): Promise<EmployeeSourceRow> {
      const { data, error } = await client
        .from('employees')
        .update(patch)
        .eq('id', id)
        .select('id, employee_code, name, is_active, created_at')
        .single();
      if (error) throw new EmployeesRepositoryError('employee-update', error);
      return data as EmployeeSourceRow;
    },

    async unassignCustomerCode(customerCode: string): Promise<void> {
      const { error } = await client
        .from('dealer_employee_mappings')
        .update({ employee_code: null })
        .eq('customer_code', customerCode);
      if (error) throw new EmployeesRepositoryError('mapping-unassign', error);
    },

    async upsertCustomerCode(customerCode: string, employeeCode: string): Promise<void> {
      const { error } = await client
        .from('dealer_employee_mappings')
        .upsert(
          { customer_code: customerCode, employee_code: employeeCode },
          { onConflict: 'customer_code' }
        );
      if (error) throw new EmployeesRepositoryError('mapping-upsert', error);
    }
  };
}

export type EmployeesRepository = ReturnType<typeof createEmployeesRepository>;
