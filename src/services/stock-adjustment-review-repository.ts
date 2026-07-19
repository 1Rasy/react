import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  StockAdjustmentEmployee,
  StockAdjustmentReviewEntry,
  StockAdjustmentReviewPageData
} from '../domain/stock-adjustment-review';

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

export type StockAdjustmentReviewRepository = ReturnType<typeof createStockAdjustmentReviewRepository>;

export function createStockAdjustmentReviewRepository(client: UntypedSupabaseClient) {
  if (!client || typeof client.rpc !== 'function') {
    throw new Error('Supabase client 未初始化');
  }

  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    let response: { data?: unknown; error?: unknown } | null;
    try {
      response = await client.rpc(name, args);
    } catch (error) {
      throw normalizeRpcError(error);
    }
    if (response?.error) throw normalizeRpcError(response.error);
    return response?.data as T;
  }

  return {
    async loadReviewPage(): Promise<StockAdjustmentReviewPageData> {
      const [pendingRows, historyRows, employeesResult] = await Promise.all([
        rpc<unknown>('get_pending_stock_adjustment_requests', {}),
        rpc<unknown>('get_stock_adjustment_review_history', { p_limit: 100 }),
        client.from('employees').select('employee_code,name')
      ]);

      if (employeesResult.error) throw employeesResult.error;
      return {
        pendingRows: Array.isArray(pendingRows) ? pendingRows as StockAdjustmentReviewEntry[] : [],
        historyRows: Array.isArray(historyRows) ? historyRows as StockAdjustmentReviewEntry[] : [],
        employees: Array.isArray(employeesResult.data) ? employeesResult.data as StockAdjustmentEmployee[] : []
      };
    },

    approve(requestId: string, adminCode: string): Promise<unknown> {
      return rpc('approve_stock_adjustment_request', {
        p_request_id: requestId,
        p_admin_code: adminCode
      });
    },

    reject(requestId: string, adminCode: string, reason: string): Promise<unknown> {
      return rpc('reject_stock_adjustment_request', {
        p_request_id: requestId,
        p_admin_code: adminCode,
        p_rejection_reason: reason
      });
    }
  };
}
