import type { SupabaseClient } from '@supabase/supabase-js';

export type SalesOrderItemPayload = {
  barcode: string;
  product_name: string;
  qty: number;
  unit_price: number;
  amount: number;
  sale_unit: '整' | '散' | '拼盒';
  sale_qty: number;
  sale_unit_price: number;
};

export type StockUpdatePayload = {
  product_barcode: string;
  qty: number;
};

export type SubmitSalesOrderPayload = {
  orderNo: string;
  employeeCode: string;
  atomCode: string;
  storeName: string;
  totalAmount: number;
  items: SalesOrderItemPayload[];
  stockUpdates: StockUpdatePayload[];
};

// The legacy repository has no generated database types yet. Keep the client
// injectable so schema typing can be added without changing page behavior.
type UntypedSupabaseClient = SupabaseClient<any, 'public', any>;

export function createSalesOrderRepository(client: UntypedSupabaseClient) {
  return {
    async readEmployeeStocks(employeeCode: string) {
      return client
        .from('van_stocks')
        .select('*')
        .eq('employee_code', employeeCode);
    },

    async submit(payload: SubmitSalesOrderPayload) {
      return client.rpc('submit_sales_order_v2', {
        p_order_no: payload.orderNo,
        p_employee_code: payload.employeeCode,
        p_atom_code: payload.atomCode,
        p_store_name: payload.storeName,
        p_total_amount: payload.totalAmount,
        p_items: payload.items,
        p_stock_updates: payload.stockUpdates
      });
    },

    async updateOrderMetadata(
      orderNo: string,
      patch: { created_at: string; status?: string; remark?: string | null }
    ) {
      return client
        .from('sales_orders')
        .update(patch)
        .eq('order_no', orderNo);
    }
  };
}
