import { createRoot } from 'react-dom/client';
import type { DashboardXlsxLibrary } from '../domain/dashboard.ts';
import { createDashboardRepositoryFromConfig } from '../services/dashboard-repository.ts';
import { createDashboardController } from './DashboardController.ts';
import { DashboardPage } from './DashboardPage.tsx';

const repository = createDashboardRepositoryFromConfig(
  'https://wyjbnnqhiehjccmojbbg.supabase.co',
  'sb_publishable_WwTC7079N2e8ZQwPKUj-Gw_ewFiviFG'
);
const controller = createDashboardController({
  repository,
  xlsx: (window as unknown as { XLSX?: DashboardXlsxLibrary }).XLSX,
  alert: message => window.alert(message),
  warn: (message, error) => console.warn(message, error)
});
const root = document.getElementById('root');

if (!root) throw new Error('管理后台页面根节点不存在');

createRoot(root).render(<DashboardPage controller={controller} />);
