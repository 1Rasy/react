import { createClient } from '@supabase/supabase-js';
import { createRoot } from 'react-dom/client';
import { createStockAdjustmentReviewRepository } from '../services/stock-adjustment-review-repository';
import { StockAdjustmentReviewPage } from './StockAdjustmentReviewPage';

const client = createClient(
  'https://wyjbnnqhiehjccmojbbg.supabase.co',
  'sb_publishable_WwTC7079N2e8ZQwPKUj-Gw_ewFiviFG'
);
const repository = createStockAdjustmentReviewRepository(client);
const root = document.getElementById('root');
const adminCode = sessionStorage.getItem('admin_employee_code') || 'ADMIN';

if (!root) throw new Error('库存调整审核页面根节点不存在');

createRoot(root).render(
  <StockAdjustmentReviewPage adminCode={adminCode} repository={repository} />
);
