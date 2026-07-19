import { createClient } from '@supabase/supabase-js';
import { createRoot } from 'react-dom/client';
import type { XlsxLibrary } from '../domain/inventory-movements';
import { createInventoryMovementRepository } from '../services/inventory-movement-repository';
import { InventoryMovementsPage } from './InventoryMovementsPage';

declare global {
  interface Window { XLSX?: XlsxLibrary }
}

const client = createClient(
  'https://wyjbnnqhiehjccmojbbg.supabase.co',
  'sb_publishable_WwTC7079N2e8ZQwPKUj-Gw_ewFiviFG'
);
const repository = createInventoryMovementRepository(client);
const root = document.getElementById('root');

if (!root) throw new Error('库存流水页面根节点不存在');

createRoot(root).render(
  <InventoryMovementsPage repository={repository} xlsx={window.XLSX} />
);
