import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const files = [
  'stock-adjustment-api.js',
  'store-stock-adjustment.js',
  'stock-adjustment-review.js',
  'inventory-movements-page.js',
];
const reactFiles = [
  'src/domain/inventory-movements.ts',
  'src/services/inventory-movement-repository.ts',
  'src/inventory-movements/DateRangePicker.tsx',
  'src/inventory-movements/InventoryMovementsPage.tsx',
  'src/inventory-movements/InventoryMovementsTable.tsx',
  'src/inventory-movements/main.tsx',
];
const mojibake = /搴撳瓨|澧炲姞|鍑忓皯|鏁\?|鍔犺浇澶辫触|鏌ヨ澶辫触|锛\?|銆\?/;

test('stock adjustment sources stay valid UTF-8 without mojibake', () => {
  for (const file of [...files, ...reactFiles]) {
    const source = fs.readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
    assert.doesNotMatch(source, mojibake, `${file} contains mojibake`);
    assert.doesNotMatch(source, /\uFFFD/, `${file} contains replacement characters`);
  }
});

test('stock adjustment JavaScript parses successfully', () => {
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file} failed syntax check:\n${result.stderr}`);
  }
});
