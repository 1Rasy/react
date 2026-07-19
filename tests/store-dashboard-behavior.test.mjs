import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const storeApp = readFileSync(join(root, 'store-app.js'), 'utf8');
const dashboard = readFileSync(join(root, 'dashboard.html'), 'utf8');
const storeStyle = readFileSync(join(root, 'store-style.css'), 'utf8');

assert.ok(storeApp.includes("p.set('emp',currentEmployee.code)"), 'split store URLs should keep employee code');
assert.ok(!storeApp.includes("p.set('name'"), 'split store URLs should not append employee name');
const employeeQueryBody = storeApp.match(/function employeeQueryString\(\)\{([\s\S]*?)\}function storePageUrl/)?.[1] || '';
assert.ok(!employeeQueryBody.includes('currentEmployee.name'), 'split store URL builder should not depend on employee name');
assert.ok(storeApp.includes("target='emp='+encodeURIComponent(currentEmployee.code)"), 'store pages should normalize the URL to emp only');

assert.ok(storeApp.includes("<div class='pack-hint'>") && storeApp.includes('${packSize(p)}${unitOf(p)}'), 'order product hint should keep whole-unit deduction info');
assert.ok(!storeApp.includes('?=?'), 'order product hint should not contain mojibake');
assert.ok(storeApp.includes('flavor-badge'), 'order flavor name should use a stronger badge style');

assert.ok(storeApp.includes('function syncSpecFlavorPrice'), 'order price changes should sync same brand/spec flavor prices');
assert.ok(storeApp.includes('const price=Number(value)||0;syncSpecFlavorPrice(id,key,price);syncSpecFlavorPriceInputs(id,key,price);calculateLiveOrderAmounts()'), 'changePrice should sync data and visible inputs before recalculating totals');
assert.ok(storeApp.includes('target.brand===source.brand&&target.spec===source.spec'), 'price sync should be scoped to same brand and spec');

assert.ok(storeApp.includes('function orderDateToCreatedAt'), 'order submission should convert selected order date into a created_at timestamp');
assert.ok(storeApp.includes("client.from('sales_orders').update({created_at:orderDateToCreatedAt(orderData.date)})"), 'order submission should persist the selected date to sales_orders.created_at');
assert.ok(storeApp.includes("throw new Error(dateError.message)"), 'order date update failures should not show a false success');

assert.ok(storeApp.includes('order-date-row'), 'order date controls should use a dedicated spaced row');
assert.ok(storeApp.includes('order-date-action'), 'order date edit button should have its own compact action style');
assert.ok(storeApp.includes('pack-hint'), 'order pack deduction hint should use a separated hint style');

assert.ok(dashboard.includes('function renderTrendLine'), 'dashboard should render trend as a line chart helper');
assert.ok(dashboard.includes("currentRange='7d';syncRangeButtons(currentRange);"), 'dashboard should default to the recent seven-day range');
assert.ok(dashboard.includes('const g=new Map();orders.forEach'), 'dashboard trend should keep existing date aggregation logic');
assert.ok(dashboard.includes('<polyline'), 'dashboard trend should use an SVG polyline');
assert.ok(dashboard.includes('function formatTrendDate') && dashboard.includes("Number(parts[1])+'.'+String(Number(parts[2])).padStart(2,'0')"), 'dashboard trend labels should use M.DD format');
assert.ok(dashboard.includes('.trend-axis{display:flex;justify-content:space-between'), 'dashboard trend labels should use evenly spaced visible labels');
assert.ok(dashboard.includes("Array.from({length:7}") && dashboard.includes("currentRange!=='7d'"), 'seven-day trend should include every day in the range');
assert.ok(dashboard.includes("const labelStep=labelAll?1") && dashboard.includes("currentRange==='7d'"), 'seven-day trend should show all seven date labels');
assert.ok(dashboard.includes('const highLabel=') && dashboard.includes("values.filter(v=>v>0)"), 'trend should show high and non-zero low amounts');
assert.ok(dashboard.includes("padY=46,padBottom=38") && dashboard.includes("const highLabel='¥ '+money(max),lowLabel="), 'trend amount labels should be separated from the line without high-low wording');
assert.ok(dashboard.includes('Math.ceil(points.length/7)'), 'trend should show up to seven complete date labels outside the weekly range');
assert.ok(!dashboard.includes('background:var(--primary);border-radius:8px 8px 2px 2px'), 'dashboard trend should no longer render bar columns');
assert.ok(dashboard.includes('customRangeText') && dashboard.includes('dateRangePanel'), 'dashboard date filter should use one range input with a picker panel');
assert.ok(!dashboard.includes('customStartDate') && !dashboard.includes('customEndDate'), 'dashboard date filter should not expose two separate date inputs');
assert.ok(dashboard.includes('function openDateRangePicker') && dashboard.includes('function pickRangeDate'), 'dashboard should support selecting a custom date range from one picker');
assert.ok(dashboard.includes('normalizeCustomDateRange'), 'dashboard should normalize reversed custom date ranges');
assert.ok(dashboard.includes('function getExportDateLabel'), 'dashboard export filename should use active date range label');
assert.ok(dashboard.includes('XLSX.writeFile(wb,getExportFileName()'), 'dashboard export filename should include the selected date range');
assert.ok(!dashboard.includes('trend-summary'), 'dashboard trend should not show extra text summary above the line');
assert.ok(!dashboard.includes('preserveAspectRatio="none"'), 'dashboard trend SVG should avoid non-uniform scaling that distorts circles');
assert.ok(dashboard.includes('preserveAspectRatio="xMidYMid meet"'), 'dashboard trend SVG should keep circles round');

assert.ok(storeApp.includes("selectedReportDate='today'"), 'store report state should default to today');
assert.ok(storeApp.includes("openSaleReport('today')"), 'store report entry should default to today');
assert.ok(storeApp.includes("['custom','\u65e5\u671f\u9009\u62e9']"), 'store report filters should append a date selection button');
assert.ok(storeApp.includes('type="date" class="real-date-input"'), 'store report date selection should use a native date input');
assert.ok(storeApp.includes('\u5b9e\u6536\uff1a${money(s)}'), 'order page should show receipt wording in live amount');
assert.ok(!storeApp.includes('\ud83d\udcb5'), 'store app should not show money icon');
assert.ok(storeApp.includes('\u5b9e\u6536\uff1a${money(o.saleSum||0)}'), 'history cards should show receipt wording');
assert.ok(storeApp.includes('\u5b9e\u6536\uff1a${money(r.netRevenue)}'), 'report cards should show receipt wording');
assert.ok(storeApp.includes('\u603b\u5b9e\u6536\uff1a${money(netSum)}'), 'report summary should show total receipt wording');
assert.ok(storeApp.includes('\u5b9e\u6536\uff1a${money(sum)}'), 'order detail should show receipt wording');

assert.ok(storeApp.includes('function openReportDatePicker'), 'report date selection should open picker from a button');
assert.ok(storeApp.includes('onchange="handleReportCustomDate(this.value)"'), 'report date selection should only apply after a date change');
assert.ok(!storeApp.includes('onchange="openSaleReport(\'custom\',this.value)"'), 'report date input should not auto-confirm today on first open');

assert.ok(storeApp.includes('class="real-date-input report-date-input"'), 'report date input should use a separate non-overlay class');
assert.ok(storeStyle.includes('.report-date-input{width:1px;height:1px;pointer-events:none}'), 'report date input should not cover the date button');

assert.ok(storeApp.includes('>提交账单</button>'), 'submit button should not use a rocket icon');
assert.ok(!storeApp.includes('🚀 提交账单'), 'submit button should not include rocket icon');
assert.ok(storeStyle.includes('button,.smallbtn,.ios-picker,.brand-badge,.spec-badge,.float-submit{touch-action:manipulation'), 'interactive controls should globally prevent double tap zoom');
