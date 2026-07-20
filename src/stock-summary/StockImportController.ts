import {
  mergeStockImportRows,
  missingStockImportValues,
  parseStockImportRows,
  stockImportConfirmation,
  stockImportMissingValuesMessage,
  stockImportSuccessMessage,
  type StockSummaryXlsxLibrary
} from '../domain/stock-summary.ts';
import type { StockSummaryRepository } from '../services/stock-summary-repository';

export type StockImportStatus = {
  kind?: 'normal' | 'error';
  text: string;
};

export type StockImportControllerOptions = {
  repository: StockSummaryRepository;
  xlsx?: StockSummaryXlsxLibrary;
  confirm: (message: string) => boolean;
  alert: (message: string) => void;
};

export type StockImportRunOptions = {
  file: Pick<File, 'arrayBuffer'>;
  reload: () => Promise<{ stockCount: number }>;
  setStatus: (status: StockImportStatus) => void;
};

export function createStockImportController(options: StockImportControllerOptions) {
  const { repository, xlsx, confirm, alert } = options;

  return {
    async importFile({ file, reload, setStatus }: StockImportRunOptions): Promise<'success' | 'cancelled' | 'invalid'> {
      if (!xlsx) throw new Error('Excel 组件加载失败，请刷新页面后重试');

      setStatus({ text: '正在读取 Excel...' });
      const workbook = xlsx.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) throw new Error('Excel 中没有可读取的工作表');
      const matrix = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
      const { parsed, errors } = parseStockImportRows(matrix);

      if (errors.length) {
        alert(`导入失败，共 ${errors.length} 行格式错误。\n\n${errors.slice(0, 12).join('\n')}`);
        setStatus({ text: '导入已取消：Excel 格式有错误', kind: 'error' });
        return 'invalid';
      }
      if (!parsed.length) {
        throw new Error('没有读取到库存数据。请确认 A列员工编号、B列条码、C列散数。');
      }

      setStatus({ text: `正在校验 ${parsed.length} 行库存...` });
      const employeeCodes = parsed.map(row => row.employee_code);
      const barcodes = parsed.map(row => row.product_barcode);
      const [validEmployees, validProducts] = await Promise.all([
        repository.existingEmployees(employeeCodes),
        repository.existingProducts(barcodes)
      ]);
      const { missingEmployees, missingProducts } = missingStockImportValues(
        parsed,
        validEmployees,
        validProducts
      );
      if (missingEmployees.length || missingProducts.length) {
        throw new Error(stockImportMissingValuesMessage(missingEmployees, missingProducts));
      }

      const { rows, duplicateCount } = mergeStockImportRows(parsed);
      if (!confirm(stockImportConfirmation(rows))) {
        setStatus({ text: '已取消导入' });
        return 'cancelled';
      }

      setStatus({ text: '正在保存期初库存并按7月1日后全部订单重算...' });
      const result = await repository.importBaseline(rows);
      const { stockCount } = await reload();
      setStatus({
        text: stockImportSuccessMessage({
          result,
          rows,
          duplicateCount,
          loadedStockCount: stockCount
        })
      });
      return 'success';
    }
  };
}
