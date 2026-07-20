import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEALER_OUTBOUND_EMPTY_WHITELIST_ERROR,
  splitDealerOutboundChunks,
  dealerOutboundText,
  type DealerOutboundRow
} from '../domain/dealer-outbound-import.ts';

type UntypedSupabaseClient = SupabaseClient<any, 'public', any>;

export type DealerOutboundImportRepository = ReturnType<typeof createDealerOutboundImportRepository>;

function repositoryError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String((error as { message?: unknown } | null)?.message || error || 'Supabase 操作失败'));
}

export function createDealerOutboundImportRepository(client: UntypedSupabaseClient) {
  if (!client || typeof client.from !== 'function') throw new Error('Supabase client 未初始化');

  return {
    async loadCustomerWhitelist(): Promise<Set<string>> {
      const { data, error } = await client
        .from('dealer_employee_mappings')
        .select('customer_code,employee_code')
        .not('customer_code', 'is', null)
        .not('employee_code', 'is', null);

      if (error) throw repositoryError(error);
      const whitelist = new Set<string>();
      (Array.isArray(data) ? data : []).forEach(mapping => {
        const row = mapping as { customer_code?: unknown; employee_code?: unknown };
        const customerCode = dealerOutboundText(row.customer_code);
        const employeeCode = dealerOutboundText(row.employee_code);
        if (customerCode && employeeCode) whitelist.add(customerCode);
      });
      if (!whitelist.size) throw new Error(DEALER_OUTBOUND_EMPTY_WHITELIST_ERROR);
      return whitelist;
    },

    async upsertOutboundRows(
      rows: readonly DealerOutboundRow[],
      onProgress: (written: number, total: number) => void
    ): Promise<void> {
      let written = 0;
      for (const part of splitDealerOutboundChunks(rows)) {
        written += part.length;
        onProgress(written, rows.length);
        const { error } = await client
          .from('raw_dealer_outbounds')
          .upsert(part, { onConflict: 'import_uid' });
        if (error) throw repositoryError(error);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
  };
}
