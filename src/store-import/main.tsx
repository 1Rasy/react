import { createClient } from '@supabase/supabase-js';
import { createRoot } from 'react-dom/client';
import type { StoreImportXlsxLibrary } from '../domain/store-import.ts';
import { createStoreImportRepository } from '../services/store-import-repository.ts';
import { StoreImportPage } from './StoreImportPage.tsx';

const SUPABASE_URL = 'https://wyjbnnqhiehjccmojbbg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WwTC7079N2e8ZQwPKUj-Gw_ewFiviFG';
const client = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
const repository = client ? createStoreImportRepository(client) : null;
const root = document.getElementById('root');
const xlsx = (window as unknown as { XLSX?: StoreImportXlsxLibrary }).XLSX;

if (!root) throw new Error('门店导入页面根节点不存在');

createRoot(root).render(
  <StoreImportPage repository={repository} xlsx={xlsx} />
);
