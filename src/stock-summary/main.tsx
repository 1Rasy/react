import { createClient } from '@supabase/supabase-js';
import { createRoot } from 'react-dom/client';
import type { StockSummaryXlsxLibrary } from '../domain/stock-summary';
import { createStockSummaryRepository } from '../services/stock-summary-repository';
import { StockSummaryPage } from './StockSummaryPage';

const client = createClient(
  'https://wyjbnnqhiehjccmojbbg.supabase.co',
  'sb_publishable_WwTC7079N2e8ZQwPKUj-Gw_ewFiviFG'
);
const repository = createStockSummaryRepository(client);
const root = document.getElementById('root');
const xlsx = (window as unknown as { XLSX?: StockSummaryXlsxLibrary }).XLSX;

if (!root) throw new Error('库存管理页面根节点不存在');

createRoot(root).render(
  <StockSummaryPage repository={repository} xlsx={xlsx} />
);
