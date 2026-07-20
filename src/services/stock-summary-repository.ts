import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INVENTORY_BASELINE_ID,
  INVENTORY_CUTOFF,
  STOCK_SUMMARY_MAX_ROWS,
  STOCK_SUMMARY_PAGE_SIZE,
  splitStockImportChunks,
  type StockBaselineResult,
  type StockEmployee,
  type StockImportPayloadRow,
  type StockProduct,
  type StockRecord
} from '../domain/stock-summary.ts';

type UntypedSupabaseClient = SupabaseClient<any, 'public', any>;
type StockSummaryTable = 'van_stocks' | 'employees' | 'products';
type StockSummaryLookupTable = 'employees' | 'products';
type StockSummaryOrder = { column: string; ascending?: boolean };

export type StockSummaryPageData = {
  stocks: StockRecord[];
  employees: StockEmployee[];
  products: StockProduct[];
};

export type StockSummaryRepository = ReturnType<typeof createStockSummaryRepository>;

function queryError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String((error as { message?: unknown } | null)?.message || error || 'Supabase 查询失败'));
}

export function createStockSummaryRepository(client: UntypedSupabaseClient) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw new Error('Supabase client 未初始化');
  }

  async function fetchAllRows<T>(
    table: StockSummaryTable,
    columns: string,
    orders: readonly StockSummaryOrder[]
  ): Promise<T[]> {
    const all: T[] = [];
    for (let from = 0; from < STOCK_SUMMARY_MAX_ROWS; from += STOCK_SUMMARY_PAGE_SIZE) {
      let query = client.from(table).select(columns);
      orders.forEach(order => {
        query = query.order(order.column, {
          ascending: order.ascending !== false,
          nullsFirst: false
        });
      });
      const { data, error } = await query.range(from, from + STOCK_SUMMARY_PAGE_SIZE - 1);
      if (error) throw queryError(error);
      const page = Array.isArray(data) ? data as T[] : [];
      all.push(...page);
      if (page.length < STOCK_SUMMARY_PAGE_SIZE) return all;
    }
    throw new Error(`${table} 数据超过安全读取上限`);
  }

  async function fetchExistingValues(
    table: StockSummaryLookupTable,
    column: 'employee_code' | 'barcode',
    values: readonly string[]
  ): Promise<Set<string>> {
    const result = new Set<string>();
    const uniqueValues = Array.from(new Set(values.map(value => String(value || '')).filter(Boolean)));
    for (const part of splitStockImportChunks(uniqueValues, 500)) {
      const { data, error } = await client.from(table).select(column).in(column, part);
      if (error) throw queryError(error);
      (Array.isArray(data) ? data : []).forEach(row => {
        result.add(String((row as Record<string, unknown>)[column] || ''));
      });
    }
    return result;
  }

  return {
    async loadSummary(): Promise<StockSummaryPageData> {
      const stocksPromise = fetchAllRows<StockRecord>(
        'van_stocks',
        'employee_code, product_barcode, qty, updated_at',
        [{ column: 'employee_code' }, { column: 'product_barcode' }]
      );
      const employeesPromise = fetchAllRows<StockEmployee>(
        'employees',
        'employee_code, name, is_active',
        [{ column: 'employee_code' }]
      );
      const productsPromise = fetchAllRows<StockProduct>(
        'products',
        'id, sort_order, barcode, brand, spec, flavor, pcs_per_case, pcs_per_box, unit, is_active',
        [{ column: 'sort_order' }, { column: 'id' }]
      );
      const [stocks, employees, products] = await Promise.all([
        stocksPromise,
        employeesPromise,
        productsPromise
      ]);
      return { stocks, employees, products };
    },

    existingEmployees(employeeCodes: readonly string[]): Promise<Set<string>> {
      return fetchExistingValues('employees', 'employee_code', employeeCodes);
    },

    existingProducts(barcodes: readonly string[]): Promise<Set<string>> {
      return fetchExistingValues('products', 'barcode', barcodes);
    },

    async importBaseline(rows: readonly StockImportPayloadRow[]): Promise<StockBaselineResult> {
      const { data, error } = await client.rpc('import_van_stock_baseline', {
        p_baseline_id: INVENTORY_BASELINE_ID,
        p_rows: rows,
        p_cutoff: INVENTORY_CUTOFF
      });
      if (error) throw queryError(error);
      return (data || {}) as StockBaselineResult;
    }
  };
}
