import {
  buildStoreImportPayloads,
  type StoreImportExcelRow,
  type StoreImportXlsxLibrary
} from '../domain/store-import.ts';
import {
  StoreImportQueryError,
  type StoreImportRepository
} from '../services/store-import-repository.ts';

export type StoreImportStatusSetter = (text: string) => void;

export type StoreImportControllerOptions = {
  repository: StoreImportRepository | null;
  xlsx?: StoreImportXlsxLibrary;
  alert: (message: string) => void;
  readFile?: (file: Blob) => Promise<ArrayBuffer>;
};

export function readStoreImportFileAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const result = event.target?.result;
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error('Excel 文件读取失败'));
    };
    reader.onerror = () => reject(reader.error || new Error('Excel 文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

function errorMessage(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error);
}

export function createStoreImportController(options: StoreImportControllerOptions) {
  const {
    repository,
    xlsx,
    alert,
    readFile = readStoreImportFileAsArrayBuffer
  } = options;
  let employeeWhitelist = new Set<string>();
  let rawExcelRows: StoreImportExcelRow[] | null = null;

  return {
    async initialize(setStatus: StoreImportStatusSetter): Promise<void> {
      if (!repository) {
        setStatus('错误：Supabase 配置缺失');
        return;
      }
      try {
        employeeWhitelist = await repository.loadEmployeeWhitelist();
        if (!employeeWhitelist.size) {
          setStatus('警告：employees 表中未检测到任何员工工号');
          return;
        }
        setStatus(`已加载 ${employeeWhitelist.size} 位员工。`);
      } catch (error) {
        console.error(error);
        if (error instanceof StoreImportQueryError) {
          setStatus(`数据库错误 [${error.code}]: ${error.message}`);
          return;
        }
        setStatus(`网络或系统异常: ${errorMessage(error)}`);
      }
    },

    async processExcelFile(file: Blob, setStatus: StoreImportStatusSetter): Promise<boolean> {
      if (!employeeWhitelist.size) {
        alert('基础白名单为空，中止操作');
        return false;
      }
      if (!xlsx) throw new Error('Excel 组件加载失败，请刷新页面后重试');

      setStatus('正在解析 Excel 文件...');
      const data = new Uint8Array(await readFile(file));
      const workbook = xlsx.read(data, { type: 'array' });
      rawExcelRows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      setStatus(`文件解析成功，共计 ${rawExcelRows.length} 行数据，等待执行导入。`);
      return true;
    },

    async executeImport(setStatus: StoreImportStatusSetter): Promise<'success' | 'invalid' | 'skipped'> {
      if (!rawExcelRows || !repository) return 'skipped';

      setStatus('正在解析门店数据...');
      const payloads = buildStoreImportPayloads(rawExcelRows, employeeWhitelist);
      if (!payloads.length) {
        setStatus('导入失败：本次文件没有可导入的门店。');
        alert('未发现可导入的门店，请检查员工工号和门店信息。');
        return 'invalid';
      }

      setStatus(`正在导入 ${payloads.length} 条门店...`);
      try {
        await repository.replaceStores(payloads);
        setStatus(`导入成功：本次导入 ${payloads.length} 家门店。`);
        alert('门店导入成功。');
        return 'success';
      } catch (error) {
        console.error(error);
        setStatus('异常：数据库同步操作失败');
        alert(`导入失败: ${errorMessage(error)}`);
        return 'skipped';
      }
    }
  };
}
