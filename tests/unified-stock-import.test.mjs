import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dashboard = readFileSync(join(root, 'dashboard.html'), 'utf8');
const stockImport = readFileSync(join(root, 'stock_import.html'), 'utf8');

assert.ok(dashboard.includes("location.href='stock_import'"), 'dashboard should link to the unified stock import page');
assert.ok(!dashboard.includes("location.href='stock_jn'"), 'dashboard should remove the JN stock import button');
assert.ok(!dashboard.includes("location.href='stock_ct'"), 'dashboard should remove the CT stock import button');
assert.ok(stockImport.includes('class="import-grid"'), 'stock import should render the two importer components in one grid');
assert.ok(stockImport.includes("title:'吉能'"), 'stock import should render the JN importer');
assert.ok(stockImport.includes("title:'长涛'"), 'stock import should render the CT importer');
assert.ok(stockImport.includes('>导入</button>'), 'stock import should use the concise import button label');
assert.ok(stockImport.includes("prefix:'JN'"), 'stock import should keep the JN configuration');
assert.ok(stockImport.includes("prefix:'CT'"), 'stock import should keep the CT configuration');
assert.ok(stockImport.includes("from('raw_dealer_outbounds').upsert"), 'stock import should retain the outbound write flow');

console.log('unified stock import checks ok');
