import { legacyPages } from './legacy-pages';
import './react-migration-shell.css';

export function ReactMigrationShell() {
  return (
    <main className="migration-shell">
      <header>
        <p className="eyebrow">React + TypeScript migration</p>
        <h1>旧页面回退入口</h1>
        <p>此页面只用于本地迁移核对。库存流水已由 React 接管，并保留独立旧版回退入口。</p>
      </header>
      <table>
        <thead>
          <tr><th>页面</th><th>HTML</th><th>clean URL</th><th>风险</th></tr>
        </thead>
        <tbody>
          {legacyPages.map(page => (
            <tr key={page.file}>
              <td>{page.title}</td>
              <td><a href={`/${page.file}`}>{page.file}</a></td>
              <td><a href={page.cleanPath}>{page.cleanPath}</a></td>
              <td>{page.risk}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
