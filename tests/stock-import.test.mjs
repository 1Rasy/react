import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('stock_summary.html', 'utf8');

assert.match(html, /导入7月1日期初库存/, '库存页应显示期初库存导入按钮');
assert.match(html, /openImportFile\(\)/, '导入按钮应打开文件选择器');
assert.match(html, /id="stockImportFile"/, '应保留隐藏的Excel文件输入框');
assert.match(html, /accept="\.xlsx,\.xls"/, '导入文件应限制为Excel');
assert.match(html, /A列员工编号、B列条码、C列整数散数都不能为空/, '导入解析应固定使用 A/B/C 列');
assert.doesNotMatch(html, /导入格式：/, '库存页应保持已移除导入说明的当前界面');
assert.match(html, /client\.rpc\('import_van_stock_baseline'/, '导入应调用安全的库存基准RPC');
assert.match(html, /INVENTORY_BASELINE_ID='2026-07-01-opening'/, '应固定7月1日期初库存批次');
assert.match(html, /INVENTORY_CUTOFF='2026-07-01T00:00:00\+08:00'/, '应固定中国时区7月1日起算时间');
assert.match(html, /S260401018/, '页面应说明保留库存员工的特殊处理');
assert.match(html, /原68条保留库存保持不变/, '未导入S260401018时应提示保留原库存');
assert.match(html, /原68条保留库存会由本文件中的期初库存替换/, '显式导入S260401018时应提示覆盖规则');
assert.match(html, /const PAGE_SIZE=1000/, '库存读取应按1000条分页');
assert.match(html, /async function fetchAllRows/, '应提供完整分页读取函数');
assert.match(html, /\.range\(from,from\+PAGE_SIZE-1\)/, '每页应使用Supabase range读取');
assert.match(html, /fetchAllRows\('van_stocks'/, '库存表应通过分页读取');
assert.doesNotMatch(html, /\.limit\(20000\)/, '不应依赖超过服务端上限的单次limit');
assert.doesNotMatch(html, /from\('van_stocks'\)\.upsert/, '页面不应直接覆盖van_stocks');
assert.match(html, /onclick="exportEmployeeStocks\(\)"/, '库存页应保留导出功能');

console.log('opening inventory import and pagination checks ok');
