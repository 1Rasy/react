import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = file => readFileSync(join(root, file), 'utf8');

test('dashboard keeps the unified stock import navigation only', () => {
  const dashboard = read('src/dashboard/DashboardPage.tsx');
  assert.ok(dashboard.includes("navigate('stock_import')"));
  assert.ok(!dashboard.includes("navigate('stock_jn')"));
  assert.ok(!dashboard.includes("navigate('stock_ct')"));
});

test('unified stock import entry mounts the React TypeScript page', () => {
  const entry = read('stock_import.html');
  assert.ok(entry.includes('id="root"'));
  assert.ok(entry.includes('src="/src/stock-import/main.tsx"'));
  assert.ok(!entry.includes('supabase.createClient'));
  assert.ok(!entry.includes("from('raw_dealer_outbounds')"));
});

test('React page keeps the two importer cards and concise labels', () => {
  const page = read('src/stock-import/StockImportPage.tsx');
  assert.ok(page.includes('className="import-grid"'));
  assert.ok(page.includes("title: '吉能'"));
  assert.ok(page.includes("title: '长涛'"));
  assert.ok(page.includes('经销商erp导入'));
  assert.match(page, />\s*导入\s*<\/button>/);
});

test('shared domain and repository retain both importer prefixes and raw outbound writes', () => {
  const domain = read('src/domain/dealer-outbound-import.ts');
  const repository = read('src/services/dealer-outbound-import-repository.ts');
  assert.ok(domain.includes("prefix: 'JN'"));
  assert.ok(domain.includes("prefix: 'CT'"));
  assert.ok(repository.includes("from('raw_dealer_outbounds')"));
  assert.ok(repository.includes("upsert(part, { onConflict: 'import_uid' })"));
});
