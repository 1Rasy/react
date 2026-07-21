import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  DASHBOARD_EXPORT_HEADERS,
  buildDashboardEmployeeRows,
  buildDashboardExportRows,
  buildDashboardMetrics,
  buildDashboardTrendRows,
  createDashboardWorkbook,
  dashboardTrendBounds,
  dashboardTrendLabelIndexes,
  exportProductName,
  filterDashboardOrders,
  formatDashboardTrendDate,
  formatPendingStockAdjustmentCount,
  normalizeCustomDateRange,
  resolveDashboardDateRange,
  visibleDashboardEmployees
} from '../src/domain/dashboard.ts';
import { createDashboardController } from '../src/dashboard/DashboardController.ts';
import {
  DashboardDataLoadError,
  createDashboardRepository
} from '../src/services/dashboard-repository.ts';

const root = join(import.meta.dirname, '..');
const read = file => readFileSync(join(root, file), 'utf8');
const fixedNow = new Date(2026, 6, 21, 15, 30, 0);

test('dashboard date ranges default to seven days and preserve preset/custom semantics', () => {
  const sevenDays = resolveDashboardDateRange('7d', '', '', fixedNow);
  assert.equal(sevenDays.start?.getFullYear(), 2026);
  assert.equal(sevenDays.start?.getMonth(), 6);
  assert.equal(sevenDays.start?.getDate(), 15);
  assert.equal(sevenDays.start?.getHours(), 0);
  assert.equal(sevenDays.end, null);

  const today = resolveDashboardDateRange('today', '', '', fixedNow);
  assert.deepEqual(
    [today.start?.getDate(), today.start?.getHours(), today.end],
    [21, 0, null]
  );
  const yesterday = resolveDashboardDateRange('yesterday', '', '', fixedNow);
  assert.deepEqual(
    [
      yesterday.start?.getDate(),
      yesterday.start?.getHours(),
      yesterday.end?.getDate(),
      yesterday.end?.getHours(),
      yesterday.end?.getMinutes(),
      yesterday.end?.getSeconds()
    ],
    [20, 0, 20, 23, 59, 59]
  );
  const month = resolveDashboardDateRange('month', '', '', fixedNow);
  assert.deepEqual([month.start?.getDate(), month.start?.getHours(), month.end], [1, 0, null]);
  assert.deepEqual(resolveDashboardDateRange('all', '', '', fixedNow), {
    start: null,
    end: null
  });

  assert.deepEqual(normalizeCustomDateRange('2026-07-20', ''), {
    start: '2026-07-20',
    end: '2026-07-20'
  });
  assert.deepEqual(normalizeCustomDateRange('2026-07-21', '2026-07-19'), {
    start: '2026-07-19',
    end: '2026-07-21'
  });
  const custom = resolveDashboardDateRange(
    'custom',
    '2026-07-21',
    '2026-07-19',
    fixedNow
  );
  assert.deepEqual(
    [
      custom.start?.getDate(),
      custom.start?.getHours(),
      custom.end?.getDate(),
      custom.end?.getHours(),
      custom.end?.getMinutes(),
      custom.end?.getSeconds()
    ],
    [19, 0, 21, 23, 59, 59]
  );
});

test('metrics and the employee filter use the same filtered order set', () => {
  const orders = [
    { employee_code: 'E1', total_amount: '10.5' },
    { employee_code: 'E2', total_amount: 20 },
    { employee_code: 'E1', total_amount: 5 }
  ];
  const filtered = filterDashboardOrders(orders, 'E1');
  assert.equal(filtered.length, 2);
  assert.deepEqual(buildDashboardMetrics(filtered), {
    totalAmount: 15.5,
    orderCount: 2,
    avgOrderAmount: 7.75
  });
  assert.deepEqual(buildDashboardMetrics([]), {
    totalAmount: 0,
    orderCount: 0,
    avgOrderAmount: 0
  });
  assert.deepEqual(
    visibleDashboardEmployees([
      { employee_code: 'E1', is_active: true },
      { employee_code: 'E2', is_active: false },
      { employee_code: 'E3', is_active: null }
    ]).map(row => row.employee_code),
    ['E1', 'E3']
  );
});

test('employee ranking aggregates, falls back to employee code, sorts and keeps latest order', () => {
  const rows = buildDashboardEmployeeRows([
    { employee_code: 'E1', total_amount: 10, created_at: '2026-07-20T08:00:00Z' },
    { employee_code: 'E1', total_amount: 30, created_at: '2026-07-21T08:00:00Z' },
    { employee_code: 'E2', total_amount: 60, created_at: '2026-07-19T08:00:00Z' }
  ], [
    { employee_code: 'E1', name: '甲' }
  ]);
  assert.deepEqual(rows.map(row => [row.code, row.name, row.total, row.count, row.last]), [
    ['E2', 'E2', 60, 1, '2026-07-19T08:00:00Z'],
    ['E1', '甲', 40, 2, '2026-07-21T08:00:00Z']
  ]);
});

test('seven-day trends fill zero dates and use fixed M.DD labels', () => {
  const rows = buildDashboardTrendRows([
    { created_at: '2026-07-15T04:00:00+08:00', total_amount: 12 },
    { created_at: '2026-07-21T09:00:00+08:00', total_amount: 30 }
  ], '7d', fixedNow);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[0], ['2026-07-15', 12]);
  assert.deepEqual(rows[6], ['2026-07-21', 30]);
  assert.equal(rows.filter(row => row[1] === 0).length, 5);
  assert.equal(formatDashboardTrendDate(rows[0][0]), '7.15');
  assert.deepEqual(dashboardTrendLabelIndexes(7, true), [0, 1, 2, 3, 4, 5, 6]);
});

test('non-week trends keep actual dates and sample at most about seven labels', () => {
  const orders = Array.from({ length: 15 }, (_, index) => ({
    created_at: `2026-07-${String(index + 1).padStart(2, '0')}T08:00:00+08:00`,
    total_amount: index + 1
  }));
  const rows = buildDashboardTrendRows(orders, 'month', fixedNow);
  assert.equal(rows.length, 15);
  assert.deepEqual(dashboardTrendLabelIndexes(rows.length, false), [0, 3, 6, 9, 12, 14]);
});

test('trend bounds keep a minimum ceiling of one and the smallest positive lower label', () => {
  assert.deepEqual(dashboardTrendBounds([
    ['2026-07-20', 0],
    ['2026-07-21', 0]
  ]), { max: 1, min: null });
  assert.deepEqual(dashboardTrendBounds([
    ['2026-07-20', 8],
    ['2026-07-21', 3]
  ]), { max: 8, min: 3 });
});

function queryThenable(result, log) {
  const query = {
    select(columns) { log.push(['select', columns]); return query; },
    order(column, options) { log.push(['order', column, options]); return query; },
    limit(value) { log.push(['limit', value]); return query; },
    gte(column, value) { log.push(['gte', column, value]); return query; },
    lte(column, value) { log.push(['lte', column, value]); return query; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
  return query;
}

test('repository preserves exact selects, ordering, limit, ISO filters and parallel queries', async () => {
  const log = [];
  let releaseOrders;
  let releaseEmployees;
  const ordersPromise = new Promise(resolve => { releaseOrders = resolve; });
  const employeesPromise = new Promise(resolve => { releaseEmployees = resolve; });
  const ordersQuery = queryThenable(ordersPromise, log);
  const employeesQuery = queryThenable(employeesPromise, log);
  const client = {
    from(table) {
      log.push(['from', table]);
      return table === 'sales_orders' ? ordersQuery : employeesQuery;
    },
    rpc() { throw new Error('not used'); }
  };
  const repository = createDashboardRepository(client);
  const start = new Date('2026-07-15T00:00:00+08:00');
  const end = new Date('2026-07-21T23:59:59+08:00');
  const pending = repository.loadDashboard({ start, end });

  assert.ok(log.some(item => item[0] === 'from' && item[1] === 'employees'));
  assert.deepEqual(log.find(item => item[0] === 'select' && String(item[1]).startsWith('id,')), [
    'select',
    'id, order_no, created_at, employee_code, atom_code, store_name, total_amount, status'
  ]);
  assert.ok(log.some(item =>
    item[0] === 'select' && item[1] === 'employee_code, name, is_active'
  ));
  assert.ok(log.some(item =>
    item[0] === 'order' && item[1] === 'created_at' && item[2].ascending === false
  ));
  assert.ok(log.some(item => item[0] === 'limit' && item[1] === 2000));
  assert.ok(log.some(item => item[0] === 'gte' && item[2] === start.toISOString()));
  assert.ok(log.some(item => item[0] === 'lte' && item[2] === end.toISOString()));

  releaseOrders({ data: [{ id: 1 }], error: null });
  releaseEmployees({ data: [{ employee_code: 'E1' }], error: null });
  assert.deepEqual(await pending, {
    orders: [{ id: 1 }],
    employees: [{ employee_code: 'E1' }]
  });
});

test('repository preserves original query errors and controller maps the exact Chinese copy', async () => {
  const raw = { message: 'permission denied', code: '42501' };
  const client = {
    from(table) {
      return queryThenable(
        table === 'sales_orders'
          ? { data: null, error: raw }
          : { data: [], error: null },
        []
      );
    },
    rpc() { throw new Error('not used'); }
  };
  const repository = createDashboardRepository(client);
  await assert.rejects(
    repository.loadDashboard({ start: null, end: null }),
    error => error instanceof DashboardDataLoadError && error.rawError === raw
  );
  const controller = createDashboardController({
    repository,
    alert() {},
    warn() {},
    now: () => fixedNow
  });
  const result = await controller.loadDashboard({
    range: 'all',
    customStart: '',
    customEnd: ''
  });
  assert.deepEqual(result, {
    ok: false,
    message: '卖进数据加载失败：permission denied'
  });
});

test('pending badge and export RPCs keep exact names, parameters and error isolation', async () => {
  const calls = [];
  let pendingError = null;
  const client = {
    from() { throw new Error('not used'); },
    async rpc(name, parameters) {
      calls.push([name, parameters]);
      if (name === 'get_pending_stock_adjustment_requests') {
        return pendingError
          ? { data: null, error: pendingError }
          : { data: Array.from({ length: 100 }), error: null };
      }
      return { data: [{ order_no: 'O1' }], error: null };
    }
  };
  const repository = createDashboardRepository(client);
  assert.equal(await repository.loadPendingStockAdjustmentCount(), 100);
  const start = new Date('2026-07-19T00:00:00+08:00');
  const end = new Date('2026-07-21T23:59:59+08:00');
  assert.deepEqual(await repository.loadDashboardExportRows({ start, end }, ''), [
    { order_no: 'O1' }
  ]);
  assert.deepEqual(calls[1], [
    'get_dashboard_export_order_items',
    {
      p_start_at: start.toISOString(),
      p_end_at: end.toISOString(),
      p_employee_code: null
    }
  ]);

  const warnings = [];
  pendingError = { message: 'offline' };
  const controller = createDashboardController({
    repository,
    alert() {},
    warn: (...args) => warnings.push(args)
  });
  assert.equal(await controller.loadPendingStockAdjustmentCount(), 0);
  assert.deepEqual(warnings[0], ['待审核库存修改数量加载失败', pendingError]);
  assert.equal(formatPendingStockAdjustmentCount(0), '');
  assert.equal(formatPendingStockAdjustmentCount(99), '99');
  assert.equal(formatPendingStockAdjustmentCount(100), '99+');
});

test('export conversion preserves whole, loose, mix-box, product and sorting rules', () => {
  const rows = buildDashboardExportRows([
    {
      order_no: 'O1', barcode: 'B2', sale_unit: '整', sale_qty: 2,
      sale_unit_price: 20, amount: 40, atom_code: 'A2', store_name: '乙',
      employee_code: 'E1', employee_name: '甲', created_at: '2026-07-21',
      spec: '  大盒 ', flavor: ' 原味 '
    },
    {
      order_no: 'O1', barcode: 'B2', sale_unit: '整', qty: 1,
      unit_price: 20, amount: 20, atom_code: 'A2', store_name: '乙',
      employee_code: 'E1', created_at: '2026-07-21',
      spec: '大盒', flavor: '原味'
    },
    {
      order_no: 'O2', barcode: 'B1', sale_unit: '散', qty: 3,
      unit_price: 4, amount: 12, atom_code: 'A1', store_name: '甲',
      employee_code: 'E2', created_at: '2026-07-20'
    },
    {
      order_no: 'O3', barcode: 'B3', sale_unit: '拼盒', sale_qty: 6,
      sale_unit_price: 30, pcs_per_box: 5, amount: 30,
      atom_code: 'NEW_1', store_name: '线外', employee_code: 'E3',
      created_at: '2026-07-19', spec: '', flavor: ''
    }
  ]);
  assert.deepEqual(rows.map(row => row.barcode), ['B1', 'B2', 'B3']);
  assert.equal(rows[0].product, 'B1');
  assert.equal(rows[1].product, '大盒 原味');
  assert.deepEqual(
    [rows[1].wholeQty, rows[1].wholePrice, rows[1].amount],
    [3, 20, 60]
  );
  assert.deepEqual(
    [rows[2].looseQty, rows[2].loosePrice, rows[2].amount],
    [6, 6, 30]
  );
  assert.equal(exportProductName({ name: '禁止回退', barcode: 'B4' }), 'B4');
});

function mockXlsx() {
  const workbook = { SheetNames: [], Sheets: {} };
  const utils = {
    book_new: () => workbook,
    aoa_to_sheet(data) {
      const sheet = { '!ref': `A1:L${data.length}`, __data: data };
      data.forEach((row, r) => row.forEach((value, c) => {
        sheet[String.fromCharCode(65 + c) + (r + 1)] = { v: value };
      }));
      return sheet;
    },
    book_append_sheet(target, sheet, name) {
      target.SheetNames.push(name);
      target.Sheets[name] = sheet;
    },
    decode_range(reference) {
      const match = /([A-Z])(\d+):([A-Z])(\d+)/.exec(reference);
      return {
        s: { c: match[1].charCodeAt(0) - 65, r: Number(match[2]) - 1 },
        e: { c: match[3].charCodeAt(0) - 65, r: Number(match[4]) - 1 }
      };
    },
    encode_cell({ r, c }) {
      return String.fromCharCode(65 + c) + (r + 1);
    }
  };
  return { utils, writeFile() {}, workbook };
}

test('workbook keeps headers, styles, widths, autofilter and optional offline sheet', () => {
  const xlsx = mockXlsx();
  const rows = buildDashboardExportRows([
    {
      order_no: 'O1', barcode: 'B1', sale_unit: '散', qty: 1,
      unit_price: 2, amount: 2, atom_code: 'A1', store_name: '普通',
      created_at: '2026-07-21'
    },
    {
      order_no: 'O2', barcode: 'B2', sale_unit: '散', qty: 1,
      unit_price: 3, amount: 3, atom_code: 'NEW_1', store_name: '线外',
      created_at: '2026-07-21'
    }
  ]);
  const workbook = createDashboardWorkbook(xlsx, rows);
  assert.deepEqual(workbook.SheetNames, ['开单明细', '线外门店']);
  const sheet = workbook.Sheets['开单明细'];
  assert.deepEqual(sheet.__data[0], [...DASHBOARD_EXPORT_HEADERS]);
  assert.equal(sheet.A1.s.fill.fgColor.rgb, '4A154B');
  assert.equal(sheet['!rows'][0].hpt, 24);
  assert.equal(sheet['!rows'][1].hpt, 22);
  assert.deepEqual(sheet['!autofilter'], { ref: sheet['!ref'] });
  assert.equal(sheet['!cols'].length, 12);

  const onlyNormal = createDashboardWorkbook(mockXlsx(), rows.slice(0, 1));
  assert.deepEqual(onlyNormal.SheetNames, ['开单明细']);
});

test('React entry, routes, separation, UI states and exact legacy blob stay fixed', () => {
  const entry = read('dashboard.html');
  const legacy = read('dashboard-legacy.html');
  const page = read('src/dashboard/DashboardPage.tsx');
  const controller = read('src/dashboard/DashboardController.ts');
  const domain = read('src/domain/dashboard.ts');
  const repository = read('src/services/dashboard-repository.ts');
  const redirects = read('_redirects');
  const pages = read('src/migration/legacy-pages.ts');

  assert.match(entry, /src="\/src\/dashboard\/main\.tsx"/);
  assert.match(redirects, /\/dashboard-legacy \/dashboard-legacy\.html 200/);
  assert.ok(pages.includes("file: 'dashboard-legacy.html'"));
  assert.equal((pages.match(/file: '/g) || []).length, 26);

  for (const source of [page, domain, controller]) {
    assert.doesNotMatch(source, /client\.from\(|client\.rpc\(/);
  }
  assert.match(repository, /client\s*\.from\('sales_orders'\)/);
  assert.match(repository, /client\.rpc\('get_dashboard_export_order_items'/);

  for (const text of [
    '管理后台', '员工开单入口', '刷新数据', '导入门店', '库存导入',
    '库存管理', '商品表', '员工管理', '本日', '昨日', '近 7 天',
    '本月', '全部历史', '选择日期范围', '全部员工', '卖进金额',
    '卖进单据', '平均客单价', '卖进趋势', '卖进排行',
    '导出开单单据', '暂无趋势数据', '暂无数据'
  ]) {
    assert.ok(page.includes(text), `${text} must remain visible`);
  }
  assert.match(page, /useState<DashboardRange>\('7d'\)/);
  assert.match(page, /setSelectedEmployeeCode\(code\)/);
  assert.match(page, /date-range-panel/);
  assert.match(page, /pendingCount > 0/);
  assert.match(page, /正在加载\.\.\./);
  assert.match(controller, /Excel 导出组件加载失败/);
  assert.ok(entry.includes('.shell{max-width:1220px'));
  assert.ok(entry.includes('@media(max-width:640px)'));
  assert.ok(entry.includes('preserveAspectRatio') === false);
  assert.ok(page.includes('preserveAspectRatio="xMidYMid meet"'));

  const bytes = Buffer.from(legacy.replace(/\r\n/g, '\n'));
  const blob = createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest('hex');
  assert.equal(blob, '1f71852d5d6914a3341d7417683a778b4b53b0e7');
});
