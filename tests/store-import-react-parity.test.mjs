import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {
  STORE_IMPORT_ATOM_HEADER,
  STORE_IMPORT_EMPLOYEE_HEADER,
  STORE_IMPORT_NAME_HEADER,
  buildStoreImportPayloads
} from '../src/domain/store-import.ts';
import {
  StoreImportQueryError,
  createStoreImportRepository
} from '../src/services/store-import-repository.ts';
import { createStoreImportController } from '../src/store-import/StoreImportController.ts';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('store import domain keeps exact headers, trimming, quote removal, whitelist and first-row dedupe', () => {
  const rows = [
    {
      [STORE_IMPORT_EMPLOYEE_HEADER]: ' "E001" ',
      [STORE_IMPORT_ATOM_HEADER]: " 'A001' ",
      [STORE_IMPORT_NAME_HEADER]: ' 门店一 '
    },
    {
      [STORE_IMPORT_EMPLOYEE_HEADER]: 'E002',
      [STORE_IMPORT_ATOM_HEADER]: 'A001',
      [STORE_IMPORT_NAME_HEADER]: '后续重复'
    },
    {
      [STORE_IMPORT_EMPLOYEE_HEADER]: 'E999',
      [STORE_IMPORT_ATOM_HEADER]: 'A002',
      [STORE_IMPORT_NAME_HEADER]: '非白名单'
    },
    {
      [STORE_IMPORT_EMPLOYEE_HEADER]: 'E001',
      [STORE_IMPORT_ATOM_HEADER]: '',
      [STORE_IMPORT_NAME_HEADER]: '缺字段'
    },
    {
      门店负责人员工号错误: 'E001',
      [STORE_IMPORT_ATOM_HEADER]: 'A003',
      [STORE_IMPORT_NAME_HEADER]: '错误表头'
    },
    {
      [STORE_IMPORT_EMPLOYEE_HEADER]: 'E002',
      [STORE_IMPORT_ATOM_HEADER]: 'A004',
      [STORE_IMPORT_NAME_HEADER]: ' 门店四 '
    }
  ];

  assert.deepEqual(buildStoreImportPayloads(rows, new Set(['E001', 'E002'])), [
    { employee_code: 'E001', atom_code: 'A001', store_name: '门店一' },
    { employee_code: 'E002', atom_code: 'A004', store_name: '门店四' }
  ]);
});

function controllerFixture({ whitelist = new Set(['E001']), rows = [], replaceError } = {}) {
  const calls = [];
  const repository = {
    loadEmployeeWhitelist() {
      calls.push(['whitelist']);
      return Promise.resolve(whitelist);
    },
    replaceStores(payloads) {
      calls.push(['replace', payloads]);
      return replaceError ? Promise.reject(replaceError) : Promise.resolve();
    }
  };
  const xlsx = {
    read(data, options) {
      calls.push(['read', data instanceof Uint8Array, options]);
      return { SheetNames: ['第一页', '第二页'], Sheets: { 第一页: rows, 第二页: [['ignored']] } };
    },
    utils: {
      sheet_to_json(sheet, options) {
        calls.push(['sheet_to_json', sheet, options]);
        return sheet;
      }
    }
  };
  const controller = createStoreImportController({
    repository,
    xlsx,
    alert: message => calls.push(['alert', message]),
    readFile: file => {
      calls.push(['readAsArrayBuffer', file]);
      return Promise.resolve(new ArrayBuffer(8));
    }
  });
  return { calls, controller };
}

test('controller reads one ArrayBuffer, first sheet and current object-mode XLSX options', async () => {
  const rows = [{
    [STORE_IMPORT_EMPLOYEE_HEADER]: 'E001',
    [STORE_IMPORT_ATOM_HEADER]: 'A001',
    [STORE_IMPORT_NAME_HEADER]: '门店一'
  }];
  const { calls, controller } = controllerFixture({ rows });
  const statuses = [];
  await controller.initialize(text => statuses.push(text));
  assert.equal(await controller.processExcelFile({}, text => statuses.push(text)), true);
  assert.deepEqual(calls.find(call => call[0] === 'read'), ['read', true, { type: 'array' }]);
  assert.deepEqual(calls.find(call => call[0] === 'sheet_to_json'), ['sheet_to_json', rows, undefined]);
  assert.ok(calls.some(call => call[0] === 'readAsArrayBuffer'));
  assert.deepEqual(statuses, [
    '已加载 1 位员工。',
    '正在解析 Excel 文件...',
    '文件解析成功，共计 1 行数据，等待执行导入。'
  ]);
});

test('whitelist initialization preserves config, success, empty, query and network copy', async () => {
  const statuses = [];
  await createStoreImportController({ repository: null, alert() {} })
    .initialize(text => statuses.push(text));

  await createStoreImportController({
    repository: { loadEmployeeWhitelist: () => Promise.resolve(new Set()), replaceStores() {} },
    alert() {}
  }).initialize(text => statuses.push(text));

  await createStoreImportController({
    repository: {
      loadEmployeeWhitelist: () => Promise.reject(new StoreImportQueryError('42501', 'permission denied')),
      replaceStores() {}
    },
    alert() {}
  }).initialize(text => statuses.push(text));

  await createStoreImportController({
    repository: {
      loadEmployeeWhitelist: () => Promise.reject(new Error('offline')),
      replaceStores() {}
    },
    alert() {}
  }).initialize(text => statuses.push(text));

  assert.deepEqual(statuses, [
    '错误：Supabase 配置缺失',
    '警告：employees 表中未检测到任何员工工号',
    '数据库错误 [42501]: permission denied',
    '网络或系统异常: offline'
  ]);
});

function repositoryClient(options = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', table, columns]);
          return Promise.resolve({
            data: options.employeeRows ?? [{ employee_code: ' E001 ' }, { employee_code: '' }],
            error: options.selectError || null
          });
        },
        delete() {
          calls.push(['delete', table]);
          return {
            neq(column, value) {
              calls.push(['neq', table, column, value]);
              return Promise.resolve({ error: options.clearError || null });
            }
          };
        },
        insert(payloads) {
          calls.push(['insert', table, payloads]);
          return Promise.resolve({ error: options.insertError || null });
        }
      };
    },
    rpc(name) {
      calls.push(['rpc', name]);
      return Promise.resolve({ error: options.rpcError || null });
    }
  };
  return client;
}

test('repository queries exact employee field and trims non-empty whitelist values', async () => {
  const client = repositoryClient();
  const whitelist = await createStoreImportRepository(client).loadEmployeeWhitelist();
  assert.deepEqual([...whitelist], ['E001']);
  assert.deepEqual(client.calls, [
    ['from', 'employees'],
    ['select', 'employees', 'employee_code']
  ]);

  const failed = repositoryClient({ selectError: { code: '42501', message: 'employee read denied' } });
  await assert.rejects(createStoreImportRepository(failed).loadEmployeeWhitelist(), {
    name: 'StoreImportQueryError', code: '42501', message: 'employee read denied'
  });
});

test('repository strictly runs clear then insert then RPC and never uses filtered import RPC', async () => {
  const payloads = [{ employee_code: 'E001', atom_code: 'A001', store_name: '门店一' }];
  const client = repositoryClient();
  await createStoreImportRepository(client).replaceStores(payloads);
  assert.deepEqual(client.calls, [
    ['from', 'temp_upload_assets'],
    ['delete', 'temp_upload_assets'],
    ['neq', 'temp_upload_assets', 'employee_code', '_clear_all_'],
    ['from', 'temp_upload_assets'],
    ['insert', 'temp_upload_assets', payloads],
    ['rpc', 'sync_and_mask_assets']
  ]);
  assert.equal(client.calls.some(call => call.includes('import_filtered_store_assets')), false);
});

test('repository stops on each database error and preserves its original message', async () => {
  const payloads = [{ employee_code: 'E001', atom_code: 'A001', store_name: '门店一' }];
  for (const [option, message, expectedKinds] of [
    ['clearError', 'clear denied', ['from', 'delete', 'neq']],
    ['insertError', 'insert denied', ['from', 'delete', 'neq', 'from', 'insert']],
    ['rpcError', 'rpc denied', ['from', 'delete', 'neq', 'from', 'insert', 'rpc']]
  ]) {
    const client = repositoryClient({ [option]: { message } });
    await assert.rejects(createStoreImportRepository(client).replaceStores(payloads), { message });
    assert.deepEqual(client.calls.map(call => call[0]), expectedKinds);
  }
});

test('controller preserves empty-payload, progress, success and raw database error alerts', async () => {
  const invalid = controllerFixture({ rows: [{
    [STORE_IMPORT_EMPLOYEE_HEADER]: 'OTHER',
    [STORE_IMPORT_ATOM_HEADER]: 'A001',
    [STORE_IMPORT_NAME_HEADER]: '门店一'
  }] });
  const invalidStatuses = [];
  await invalid.controller.initialize(text => invalidStatuses.push(text));
  await invalid.controller.processExcelFile({}, text => invalidStatuses.push(text));
  assert.equal(await invalid.controller.executeImport(text => invalidStatuses.push(text)), 'invalid');
  assert.deepEqual(invalid.calls.at(-1), ['alert', '未发现可导入的门店，请检查员工工号和门店信息。']);
  assert.equal(invalidStatuses.at(-1), '导入失败：本次文件没有可导入的门店。');

  const validRow = {
    [STORE_IMPORT_EMPLOYEE_HEADER]: 'E001',
    [STORE_IMPORT_ATOM_HEADER]: 'A001',
    [STORE_IMPORT_NAME_HEADER]: '门店一'
  };
  const success = controllerFixture({ rows: [validRow] });
  const successStatuses = [];
  await success.controller.initialize(text => successStatuses.push(text));
  await success.controller.processExcelFile({}, text => successStatuses.push(text));
  assert.equal(await success.controller.executeImport(text => successStatuses.push(text)), 'success');
  assert.ok(successStatuses.includes('正在解析门店数据...'));
  assert.ok(successStatuses.includes('正在导入 1 条门店...'));
  assert.equal(successStatuses.at(-1), '导入成功：本次导入 1 家门店。');
  assert.deepEqual(success.calls.at(-1), ['alert', '门店导入成功。']);

  const failed = controllerFixture({ rows: [validRow], replaceError: new Error('sync raw failure') });
  const failedStatuses = [];
  await failed.controller.initialize(text => failedStatuses.push(text));
  await failed.controller.processExcelFile({}, text => failedStatuses.push(text));
  assert.equal(await failed.controller.executeImport(text => failedStatuses.push(text)), 'skipped');
  assert.equal(failedStatuses.at(-1), '异常：数据库同步操作失败');
  assert.deepEqual(failed.calls.at(-1), ['alert', '导入失败: sync raw failure']);
});

test('empty whitelist aborts file work with the exact alert', async () => {
  const { calls, controller } = controllerFixture({ whitelist: new Set() });
  await controller.initialize(() => {});
  assert.equal(await controller.processExcelFile({}, () => {}), false);
  assert.deepEqual(calls, [
    ['whitelist'],
    ['alert', '基础白名单为空，中止操作']
  ]);
});

test('React page and controller keep interaction states while Supabase stays in the repository', () => {
  const entry = read('store_import.html');
  const page = read('src/store-import/StoreImportPage.tsx');
  const controller = read('src/store-import/StoreImportController.ts');
  assert.match(entry, /src="\/src\/store-import\/main\.tsx"/);
  assert.match(page, /useState\('系统初始化中\.\.\.'\)/);
  assert.match(page, /dragover \? ' dragover'/);
  assert.match(page, /onDragEnter/);
  assert.match(page, /onDragOver/);
  assert.match(page, /onDragLeave/);
  assert.match(page, /onDrop/);
  assert.match(page, /accept="\.xlsx, \.xls"/);
  assert.doesNotMatch(page, /client\.(from|rpc)\(/);
  assert.doesNotMatch(controller, /client\.(from|rpc)\(/);
  assert.match(controller, /repository\.loadEmployeeWhitelist\(\)/);
  assert.match(controller, /repository\.replaceStores\(payloads\)/);
  assert.match(controller, /reader\.readAsArrayBuffer\(file\)/);
});

test('React entry preserves legacy CSS, responsive dimensions and exact legacy Git blob', () => {
  const style = html => html.match(/<style>\s*([\s\S]*?)\s*<\/style>/)[1];
  const reactEntry = read('store_import.html');
  const legacyEntry = read('store_import-legacy.html');
  assert.equal(style(reactEntry), style(legacyEntry));
  assert.match(reactEntry, /\.container \{ max-width:553px/);
  assert.match(reactEntry, /body \{[^}]*padding:16px/);
  assert.match(reactEntry, /@media\(max-width:700px\)\{ body\{padding:12px\} \.page-title\{font-size:23px\}/);

  const normalized = Buffer.from(legacyEntry.replace(/\r\n/g, '\n'));
  const gitBlob = createHash('sha1')
    .update(`blob ${normalized.length}\0`)
    .update(normalized)
    .digest('hex');
  assert.equal(gitBlob, '386aa31d54c2350d6d42c0171e7bf1c7b5f12e6c');
});
