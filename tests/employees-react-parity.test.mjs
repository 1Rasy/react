import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
  applyEmployeeMappingChange,
  buildEmployeeRows,
  employeeDatabasePatch,
  employeeMappingPlan,
  filterEmployees,
  isDuplicateEmployeeError,
  isEmployeeMappingDuplicateError,
  normalizeCustomerCode,
  normalizeEmployeeMappings,
  sortEmployees
} from '../src/domain/employees.ts';
import { createEmployeesController } from '../src/employees/EmployeesController.ts';
import { createEmployeesRepository } from '../src/services/employees-repository.ts';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function loadLegacyEmployees() {
  const html = read('employees-legacy.html');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const source = scripts.find(script => script.includes('function normalizeCustomerCode'));
  assert.ok(source, 'legacy employees inline script should remain available');
  const status = { className: '', textContent: '' };
  const context = {
    console,
    CSS: { escape: value => value },
    document: {
      getElementById(id) {
        if (id === 'status') return status;
        if (id === 'globalSearch') return { value: context.searchText };
        return null;
      },
      querySelector() { return null; }
    },
    setTimeout,
    searchText: '',
    supabase: { createClient: () => ({}) }
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/\nloadEmployees\(\);\s*$/, ''), context);
  return {
    call(expression) { return vm.runInContext(expression, context); },
    context,
    status
  };
}

function gitBlobHash(text) {
  const body = Buffer.from(text, 'utf8');
  return createHash('sha1').update(Buffer.concat([
    Buffer.from(`blob ${body.length}\0`, 'utf8'),
    body
  ])).digest('hex');
}

test('legacy employees page is preserved as the exact HEAD Git blob', () => {
  assert.equal(
    gitBlobHash(read('employees-legacy.html')),
    '53f4ec2e3fe94f0a72ee5d8e376232082b2afec5'
  );
});

test('customer-code normalization, search, active defaults and sorting preserve legacy behavior', () => {
  const legacy = loadLegacyEmployees();
  for (const value of ['', '  C001  ', 'C001，C002', 'C001; C002', 'C001；C002']) {
    const legacyValue = legacy.call(`normalizeCustomerCode(${JSON.stringify(value)})`);
    assert.equal(normalizeCustomerCode(value), legacyValue);
  }
  assert.equal(legacy.status.textContent, '保存失败：一个员工只能对应一个经销商客户编号。');

  const mappings = normalizeEmployeeMappings([
    { id: 1, customer_code: ' C02 ', customer_name: '二店', employee_code: ' E2 ' },
    { id: 2, customer_code: 'C10', customer_name: '十店', employee_code: 'E10' }
  ]);
  const rows = buildEmployeeRows([
    { id: 10, employee_code: 'E10', name: '张三', is_active: null, created_at: '2026-01-01' },
    { id: 2, employee_code: 'E2', name: '李四', is_active: false, created_at: '2026-01-02' }
  ], mappings);
  assert.deepEqual(rows.map(row => [row.employee_code, row.customer_code, row.is_active]), [
    ['E10', 'C10', true],
    ['E2', 'C02', false]
  ]);
  assert.deepEqual(filterEmployees(rows, '  c02  ').map(row => row.id), [2]);
  assert.deepEqual(filterEmployees(rows, '张三').map(row => row.id), [10]);
  assert.deepEqual(sortEmployees(rows).map(row => row.employee_code), ['E2', 'E10']);
  assert.deepEqual(employeeDatabasePatch({ employee_code: 'E3', customer_code: 'C3', is_active: false }), {
    employee_code: 'E3',
    is_active: false
  });
});

test('mapping plan keeps unassign-before-upsert semantics and updates the in-memory mapping view', () => {
  const mappings = [
    { id: 1, customer_code: 'C1', employee_code: 'E1' },
    { id: 2, customer_code: 'C2', employee_code: 'E2' }
  ];
  const plan = employeeMappingPlan(mappings, 'E9', 'E1', 'C3');
  assert.deepEqual(plan, {
    nextCode: 'E9',
    previousCode: 'E1',
    wantedCode: 'C3',
    toUnassign: ['C1']
  });
  assert.deepEqual(applyEmployeeMappingChange(mappings, { ...plan, wantedCode: 'C3' }), [
    { id: 1, customer_code: 'C1', employee_code: '' },
    { id: 2, customer_code: 'C2', employee_code: 'E2' },
    { id: null, customer_code: 'C3', customer_name: '', employee_code: 'E9' }
  ]);
  assert.equal(isDuplicateEmployeeError({ code: '23505' }), true);
  assert.equal(isDuplicateEmployeeError({ details: 'employees_employee_code_key' }), true);
  assert.equal(isEmployeeMappingDuplicateError({ message: 'dealer_employee_mappings_one_customer_per_employee' }), true);
});

function createQueryClient(responses = {}) {
  const calls = [];
  const result = (name, fallback) => Promise.resolve(responses[name] || fallback);
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      let action = 'load';
      const builder = {
        select(columns) {
          calls.push(['select', table, columns]);
          return builder;
        },
        order(column, options) {
          calls.push(['order', table, column, options]);
          return result(table === 'employees' ? 'employeesLoad' : 'mappingsLoad', { data: [], error: null });
        },
        insert(payload) {
          action = 'insert';
          calls.push(['insert', table, payload]);
          return builder;
        },
        update(payload) {
          action = table === 'employees' ? 'employeeUpdate' : 'mappingUnassign';
          calls.push(['update', table, payload]);
          return builder;
        },
        eq(column, value) {
          calls.push(['eq', table, column, value]);
          if (action === 'mappingUnassign') return result('mappingUnassign', { data: null, error: null });
          return builder;
        },
        upsert(payload, options) {
          calls.push(['upsert', table, payload, options]);
          return result('mappingUpsert', { data: null, error: null });
        },
        single() {
          calls.push(['single', table]);
          return result(action, { data: null, error: null });
        }
      };
      return builder;
    }
  };
}

test('repository uses the exact parallel queries and precise employee/mapping write chains', async () => {
  const client = createQueryClient({
    employeesLoad: { data: [{ id: 1, employee_code: 'E1' }], error: null },
    mappingsLoad: { data: [{ id: 2, customer_code: 'C1' }], error: null },
    insert: { data: { id: 3, employee_code: 'E3', name: '王五', is_active: true }, error: null },
    employeeUpdate: { data: { id: 1, employee_code: 'E9', name: '张三', is_active: true }, error: null }
  });
  const repository = createEmployeesRepository(client);
  assert.deepEqual(await repository.loadEmployees(), {
    employees: [{ id: 1, employee_code: 'E1' }],
    mappings: [{ id: 2, customer_code: 'C1' }]
  });
  await repository.insertEmployee({ employee_code: 'E3', name: '王五', is_active: true });
  await repository.updateEmployee('1', { employee_code: 'E9' });
  await repository.unassignCustomerCode('C1');
  await repository.upsertCustomerCode('C9', 'E9');
  assert.deepEqual(client.calls, [
    ['from', 'employees'],
    ['select', 'employees', 'id, employee_code, name, is_active, created_at'],
    ['order', 'employees', 'employee_code', { ascending: true }],
    ['from', 'dealer_employee_mappings'],
    ['select', 'dealer_employee_mappings', 'id, customer_code, customer_name, employee_code'],
    ['order', 'dealer_employee_mappings', 'customer_code', { ascending: true }],
    ['from', 'employees'],
    ['insert', 'employees', { employee_code: 'E3', name: '王五', is_active: true }],
    ['select', 'employees', 'id, employee_code, name, is_active, created_at'],
    ['single', 'employees'],
    ['from', 'employees'],
    ['update', 'employees', { employee_code: 'E9' }],
    ['eq', 'employees', 'id', '1'],
    ['select', 'employees', 'id, employee_code, name, is_active, created_at'],
    ['single', 'employees'],
    ['from', 'dealer_employee_mappings'],
    ['update', 'dealer_employee_mappings', { employee_code: null }],
    ['eq', 'dealer_employee_mappings', 'customer_code', 'C1'],
    ['from', 'dealer_employee_mappings'],
    ['upsert', 'dealer_employee_mappings', { customer_code: 'C9', employee_code: 'E9' }, { onConflict: 'customer_code' }]
  ]);
});

function memoryRepository(overrides = {}) {
  const calls = [];
  return {
    calls,
    loadEmployees() {
      calls.push(['load']);
      return Promise.resolve({
        employees: [{ id: 1, employee_code: 'E1', name: '张三', is_active: true, created_at: '2026-01-01' }],
        mappings: [{ id: 1, customer_code: 'C1', customer_name: '一店', employee_code: 'E1' }]
      });
    },
    insertEmployee(payload) {
      calls.push(['insert', payload]);
      return Promise.resolve({ id: 2, created_at: '2026-01-02', ...payload });
    },
    updateEmployee(id, patch) {
      calls.push(['update', id, patch]);
      return Promise.resolve({ id: Number(id), employee_code: 'E9', name: '张三', is_active: false, created_at: '2026-01-01' });
    },
    unassignCustomerCode(code) { calls.push(['unassign', code]); return Promise.resolve(); },
    upsertCustomerCode(code, employeeCode) { calls.push(['upsert', code, employeeCode]); return Promise.resolve(); },
    ...overrides
  };
}

test('controller loads, filters, tracks dirty fields, saves employee first, then mappings sequentially', async () => {
  const repository = memoryRepository();
  const controller = createEmployeesController({ repository });
  assert.equal(controller.getSnapshot().status, '正在加载员工...');
  assert.equal(await controller.loadEmployees(), true);
  assert.equal(controller.getSnapshot().status, '共 1 条，当前显示 1 条。未保存修改 0 条。');
  controller.setSearch(' c1 ');
  assert.equal(controller.getSnapshot().filtered.length, 1);
  controller.markDirty('1', 'employee_code', 'E9');
  controller.markDirty('1', 'is_active', false);
  controller.markDirty('1', 'customer_code', ' C9 ');
  assert.equal(controller.getSnapshot().dirtyMap.size, 1);
  assert.equal(controller.getSnapshot().employees[0].customer_code, 'C9');
  assert.equal(await controller.saveAllDirty(), true);
  assert.deepEqual(repository.calls.slice(1), [
    ['update', '1', { employee_code: 'E9', is_active: false }],
    ['unassign', 'C1'],
    ['upsert', 'C9', 'E9']
  ]);
  assert.equal(controller.getSnapshot().dirtyMap.size, 0);
  assert.equal(controller.getSnapshot().employees[0].original_employee_code, 'E9');
  assert.equal(controller.getSnapshot().employees[0].customer_code, 'C9');
  assert.equal(controller.getSnapshot().status, '全部修改已保存。');
});

test('controller keeps create validation, duplicate errors, inline state and final summary semantics', async () => {
  const repository = memoryRepository();
  const controller = createEmployeesController({ repository });
  await controller.loadEmployees();
  controller.openInlineEmployeeRow();
  assert.equal(controller.getSnapshot().showInlineNewEmployee, true);
  assert.equal(controller.getSnapshot().status, '请在列表最上方填写新员工，员工工号和姓名必填。');
  assert.equal(await controller.createEmployee({ employee_code: ' ', name: '王五', customer_code: '', is_active: true }), false);
  assert.equal(controller.getSnapshot().status, '新增失败：员工工号和姓名不能为空。');
  assert.equal(await controller.createEmployee({ employee_code: 'E2', name: ' 王五 ', customer_code: 'C2', is_active: true }), true);
  assert.deepEqual(repository.calls.slice(-2), [
    ['insert', { employee_code: 'E2', name: '王五', is_active: true }],
    ['upsert', 'C2', 'E2']
  ]);
  assert.equal(controller.getSnapshot().showInlineNewEmployee, false);
  assert.equal(controller.getSnapshot().employees[1].employee_code, 'E2');
  assert.equal(controller.getSnapshot().status, '共 2 条，当前显示 2 条。未保存修改 0 条。');

  const errors = [];
  const duplicate = createEmployeesController({
    repository: memoryRepository({
      insertEmployee() { return Promise.reject({ code: '23505', message: 'duplicate key value' }); }
    }),
    logError: error => errors.push(error)
  });
  await duplicate.loadEmployees();
  duplicate.openInlineEmployeeRow();
  assert.equal(await duplicate.createEmployee({ employee_code: 'E1', name: '重复', customer_code: '', is_active: true }), false);
  assert.equal(duplicate.getSnapshot().status, '新增失败：员工工号「E1」已存在。');
  assert.equal(errors.length, 1);
});

test('mapping failures stop the batch and retain the dirty row with exact error copy', async () => {
  const errors = [];
  const repository = memoryRepository({
    upsertCustomerCode() {
      return Promise.reject({ code: '23505', message: 'dealer_employee_mappings_one_customer_per_employee' });
    }
  });
  const controller = createEmployeesController({ repository, logError: error => errors.push(error) });
  await controller.loadEmployees();
  controller.markDirty('1', 'customer_code', 'C9');
  assert.equal(await controller.saveAllDirty(), false);
  assert.equal(controller.getSnapshot().dirtyMap.size, 1);
  assert.equal(controller.getSnapshot().status, '部分保存失败，剩余 1 条未保存。');
  assert.equal(errors.length, 1);
});

test('React page and controller contain no direct Supabase queries', () => {
  const page = read('src/employees/EmployeesPage.tsx');
  const controller = read('src/employees/EmployeesController.ts');
  const domain = read('src/domain/employees.ts');
  const repository = read('src/services/employees-repository.ts');
  for (const source of [page, controller, domain]) {
    assert.doesNotMatch(source, /client\.(from|rpc)\(/);
  }
  assert.match(repository, /client\s*\.from\('employees'\)/);
  assert.match(repository, /client\s*\.from\('dealer_employee_mappings'\)/);
  assert.doesNotMatch(repository, /client\.rpc\(/);
});
