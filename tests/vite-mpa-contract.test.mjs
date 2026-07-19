import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const read = file => readFileSync(join(root, file), 'utf8');

test('Vite MPA includes every legacy HTML entry without attaching React to it', () => {
  const pages = read('src/migration/legacy-pages.ts');
  const vite = read('vite.config.ts');
  const legacyEntries = [...read('docs/migration/LEGACY_BEHAVIOR_CONTRACT.md').matchAll(/`([^`]+\.html)`/g)]
    .map(match => match[1])
    .filter(value => /^[\w-]+\.html$/.test(value))
    .filter((value, index, all) => all.indexOf(value) === index);

  legacyEntries.forEach(file => assert.ok(pages.includes(`file: '${file}'`), `${file} is missing from MPA inputs`));
  assert.ok(vite.includes("'react-shell.html'"));
  assert.doesNotMatch(read('store.html'), /src\/migration\/main\.tsx/);
  assert.doesNotMatch(read('dashboard.html'), /src\/migration\/main\.tsx/);
});

test('Vite development and preview preserve legacy clean URLs', () => {
  const vite = read('vite.config.ts');
  assert.ok(vite.includes('legacyCleanUrlFallback()'));
  assert.ok(vite.includes('configureServer'));
  assert.ok(vite.includes('configurePreviewServer'));
  assert.ok(vite.includes('url.search'));
});

test('Vite build copies unchanged classic scripts for the legacy fallback', () => {
  const vite = read('vite.config.ts');
  assert.ok(vite.includes('copyLegacyClassicScripts()'));
  assert.ok(vite.includes("file.endsWith('.js')"));
  assert.ok(vite.includes("'_redirects'"));
  assert.ok(vite.includes("fileName: file"));
});

test('inventory movement clean and html URLs use React with an explicit legacy fallback', () => {
  const redirects = read('_redirects');
  const pages = read('src/migration/legacy-pages.ts');
  const reactEntry = read('inventory-movements.html');
  const legacyEntry = read('inventory-movements-legacy.html');

  assert.match(redirects, /\/inventory-movements\.html \/inventory-movements 301/);
  assert.match(redirects, /\/inventory-movements \/inventory-movements\.html 200/);
  assert.match(redirects, /\/inventory-movements-legacy\.html \/inventory-movements-legacy 301/);
  assert.match(redirects, /\/inventory-movements-legacy \/inventory-movements-legacy\.html 200/);
  assert.ok(pages.includes("file: 'inventory-movements-legacy.html'"));
  assert.match(reactEntry, /src="\/src\/inventory-movements\/main\.tsx"/);
  assert.match(legacyEntry, /src="inventory-movements-page\.js"/);
});

test('stock adjustment review clean and html URLs use React with an explicit legacy fallback', () => {
  const redirects = read('_redirects');
  const pages = read('src/migration/legacy-pages.ts');
  const reactEntry = read('stock-adjustment-review.html');
  const legacyEntry = read('stock-adjustment-review-legacy.html');

  assert.match(redirects, /\/stock-adjustment-review\.html \/stock-adjustment-review 301/);
  assert.match(redirects, /\/stock-adjustment-review \/stock-adjustment-review\.html 200/);
  assert.match(redirects, /\/stock-adjustment-review-legacy\.html \/stock-adjustment-review-legacy 301/);
  assert.match(redirects, /\/stock-adjustment-review-legacy \/stock-adjustment-review-legacy\.html 200/);
  assert.ok(pages.includes("file: 'stock-adjustment-review-legacy.html'"));
  assert.match(reactEntry, /src="\/src\/stock-adjustment-review\/main\.tsx"/);
  assert.match(legacyEntry, /src="stock-adjustment-review\.js"/);
});
