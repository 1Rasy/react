import { createClient } from '@supabase/supabase-js';
import { createRoot } from 'react-dom/client';
import { createEmployeesRepository } from '../services/employees-repository.ts';
import { createEmployeesController } from './EmployeesController.ts';
import { EmployeesPage } from './EmployeesPage.tsx';

const client = createClient(
  'https://wyjbnnqhiehjccmojbbg.supabase.co',
  'sb_publishable_WwTC7079N2e8ZQwPKUj-Gw_ewFiviFG'
);
const repository = createEmployeesRepository(client);
const controller = createEmployeesController({ repository });
const root = document.getElementById('root');

if (!root) throw new Error('员工管理页面根节点不存在');

createRoot(root).render(<EmployeesPage controller={controller} />);
