import { createClient } from '@supabase/supabase-js';
import { createRoot } from 'react-dom/client';
import type { DealerOutboundXlsxLibrary } from '../domain/dealer-outbound-import.ts';
import { createDealerOutboundImportRepository } from '../services/dealer-outbound-import-repository.ts';
import { StockCtPage } from './StockCtPage.tsx';

const client = createClient(
  'https://wyjbnnqhiehjccmojbbg.supabase.co',
  'sb_publishable_WwTC7079N2e8ZQwPKUj-Gw_ewFiviFG'
);
const repository = createDealerOutboundImportRepository(client);
const root = document.getElementById('root');
const xlsx = (window as unknown as { XLSX?: DealerOutboundXlsxLibrary }).XLSX;

if (!root) throw new Error('长涛库存导入页面根节点不存在');

createRoot(root).render(
  <StockCtPage repository={repository} xlsx={xlsx} />
);
