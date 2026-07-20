import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoreImportPayload } from '../domain/store-import.ts';

type UntypedSupabaseClient = SupabaseClient<any, 'public', any>;

export class StoreImportQueryError extends Error {
  readonly code: string;

  constructor(code: unknown, message: unknown) {
    super(String(message || 'Supabase 查询失败'));
    this.name = 'StoreImportQueryError';
    this.code = String(code || 'UNKNOWN');
  }
}

export type StoreImportRepository = ReturnType<typeof createStoreImportRepository>;

function repositoryError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String((error as { message?: unknown } | null)?.message || error || 'Supabase 操作失败'));
}

export function createStoreImportRepository(client: UntypedSupabaseClient) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw new Error('Supabase client 未初始化');
  }

  return {
    async loadEmployeeWhitelist(): Promise<Set<string>> {
      const { data, error } = await client.from('employees').select('employee_code');
      if (error) throw new StoreImportQueryError(error.code, error.message);

      const whitelist = new Set<string>();
      (Array.isArray(data) ? data : []).forEach(employee => {
        const value = (employee as { employee_code?: unknown }).employee_code;
        if (!value) return;
        const code = String(value).trim();
        if (code) whitelist.add(code);
      });
      return whitelist;
    },

    async replaceStores(payloads: readonly StoreImportPayload[]): Promise<void> {
      const { error: clearError } = await client
        .from('temp_upload_assets')
        .delete()
        .neq('employee_code', '_clear_all_');
      if (clearError) throw repositoryError(clearError);

      const { error: insertError } = await client
        .from('temp_upload_assets')
        .insert([...payloads]);
      if (insertError) throw repositoryError(insertError);

      const { error: rpcError } = await client.rpc('sync_and_mask_assets');
      if (rpcError) throw repositoryError(rpcError);
    }
  };
}
