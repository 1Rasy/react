import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  DashboardDateRange,
  DashboardEmployee,
  DashboardExportSourceRow,
  DashboardOrder
} from '../domain/dashboard.ts';

type UntypedSupabaseClient = SupabaseClient<any, 'public', any>;

export type DashboardLoadData = {
  orders: DashboardOrder[];
  employees: DashboardEmployee[];
};

export class DashboardDataLoadError extends Error {
  readonly source: 'orders' | 'employees';
  readonly rawError: unknown;

  constructor(source: 'orders' | 'employees', rawError: unknown) {
    super(String((rawError as { message?: unknown } | null)?.message || rawError || '未知错误'));
    this.name = 'DashboardDataLoadError';
    this.source = source;
    this.rawError = rawError;
  }
}

export type DashboardRepository = {
  loadDashboard(dateRange: DashboardDateRange): Promise<DashboardLoadData>;
  loadPendingStockAdjustmentCount(): Promise<number>;
  loadDashboardExportRows(
    dateRange: DashboardDateRange,
    employeeCode: string
  ): Promise<DashboardExportSourceRow[]>;
};

export function createDashboardRepository(
  client: UntypedSupabaseClient
): DashboardRepository {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw new Error('Supabase client 未初始化');
  }

  return {
    async loadDashboard(dateRange) {
      let ordersQuery = client
        .from('sales_orders')
        .select('id, order_no, created_at, employee_code, atom_code, store_name, total_amount, status')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (dateRange.start) {
        ordersQuery = ordersQuery.gte('created_at', dateRange.start.toISOString());
      }
      if (dateRange.end) {
        ordersQuery = ordersQuery.lte('created_at', dateRange.end.toISOString());
      }

      const [ordersResult, employeesResult] = await Promise.all([
        ordersQuery,
        client.from('employees').select('employee_code, name, is_active')
      ]);

      if (ordersResult.error) {
        throw new DashboardDataLoadError('orders', ordersResult.error);
      }
      if (employeesResult.error) {
        throw new DashboardDataLoadError('employees', employeesResult.error);
      }
      return {
        orders: (Array.isArray(ordersResult.data) ? ordersResult.data : []) as DashboardOrder[],
        employees: (
          Array.isArray(employeesResult.data) ? employeesResult.data : []
        ) as DashboardEmployee[]
      };
    },

    async loadPendingStockAdjustmentCount() {
      const result = await client.rpc('get_pending_stock_adjustment_requests', {});
      if (result.error) throw result.error;
      return Array.isArray(result.data) ? result.data.length : 0;
    },

    async loadDashboardExportRows(dateRange, employeeCode) {
      const result = await client.rpc('get_dashboard_export_order_items', {
        p_start_at: dateRange.start ? dateRange.start.toISOString() : null,
        p_end_at: dateRange.end ? dateRange.end.toISOString() : null,
        p_employee_code: employeeCode || null
      });
      if (result.error) throw result.error;
      return (
        Array.isArray(result.data) ? result.data : []
      ) as DashboardExportSourceRow[];
    }
  };
}

export function createDashboardRepositoryFromConfig(
  url: string,
  key: string
): DashboardRepository {
  return createDashboardRepository(createClient(url, key));
}

