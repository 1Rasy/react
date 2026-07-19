import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EmployeeOption,
  InventoryMovement,
  InventoryMovementFilters
} from '../domain/inventory-movements';

type UntypedSupabaseClient = SupabaseClient<any, 'public', any>;

const MIGRATION_MESSAGE = '库存调整功能尚未完成数据库部署，请联系管理员。';

function normalizeRpcError(error: unknown): Error {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = String(candidate?.code || '');
  const message = String(candidate?.message || '');
  if (
    code === 'PGRST202'
    || code === '42883'
    || /could not find (the )?function|function .* does not exist|schema cache/i.test(message)
  ) {
    return new Error(MIGRATION_MESSAGE);
  }
  if (error instanceof Error) return error;
  return new Error(message || '库存调整操作失败');
}

function normalizeQueryError(error: unknown): Error {
  if (error instanceof Error) return error;
  const message = String((error as { message?: unknown } | null)?.message || '加载业务员失败');
  return new Error(message);
}

export type InventoryMovementRepository = ReturnType<typeof createInventoryMovementRepository>;

export function createInventoryMovementRepository(client: UntypedSupabaseClient) {
  return {
    async listEmployees(): Promise<EmployeeOption[]> {
      const { data, error } = await client
        .from('employees')
        .select('employee_code,name')
        .eq('is_active', true)
        .order('employee_code');

      if (error) throw normalizeQueryError(error);
      return Array.isArray(data) ? data as EmployeeOption[] : [];
    },

    async listMovements(filters: InventoryMovementFilters): Promise<InventoryMovement[]> {
      let response: { data?: unknown; error?: unknown } | null;
      try {
        response = await client.rpc('get_inventory_movement_details', {
          p_start_date: filters.startDate,
          p_end_date: filters.endDate,
          p_employee_code: filters.employeeCode || null,
          p_movement_type: filters.movementType || null
        });
      } catch (error) {
        throw normalizeRpcError(error);
      }

      if (response?.error) throw normalizeRpcError(response.error);
      return Array.isArray(response?.data) ? response.data as InventoryMovement[] : [];
    }
  };
}
