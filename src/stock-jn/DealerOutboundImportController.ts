import {
  DEALER_OUTBOUND_EMPTY_EXCEL_ERROR,
  buildJnDealerOutboundRows,
  dealerOutboundReadyStatus,
  dealerOutboundSuccessStatus,
  dealerOutboundZeroRowsError,
  type DealerOutboundXlsxLibrary
} from '../domain/dealer-outbound-import.ts';
import type { DealerOutboundImportRepository } from '../services/dealer-outbound-import-repository.ts';

export type DealerOutboundImportControllerOptions = {
  repository: DealerOutboundImportRepository;
  xlsx?: DealerOutboundXlsxLibrary;
  alert: (message: string) => void;
  now?: () => number;
};

export type DealerOutboundRunOptions = {
  file: Pick<File, 'arrayBuffer'>;
  setStatus: (text: string, error?: boolean) => void;
};

export function createDealerOutboundImportController(options: DealerOutboundImportControllerOptions) {
  const { repository, xlsx, alert, now = Date.now } = options;

  return {
    async importFile({ file, setStatus }: DealerOutboundRunOptions): Promise<void> {
      if (!xlsx) throw new Error('Excel 组件加载失败，请刷新页面后重试');

      setStatus('正在解析 Excel 数据...');
      const buffer = await file.arrayBuffer();
      setStatus('正在读取客户编号白名单...');
      const whitelist = await repository.loadCustomerWhitelist();
      const workbook = xlsx.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        dateNF: 'yyyy-mm-dd hh:mm:ss',
        blankrows: false
      });
      if (!rows || !rows.length) throw new Error(DEALER_OUTBOUND_EMPTY_EXCEL_ERROR);

      const result = buildJnDealerOutboundRows(rows, whitelist, now());
      if (!result.payload.length) throw new Error(dealerOutboundZeroRowsError(result));
      setStatus(dealerOutboundReadyStatus(result));
      await repository.upsertOutboundRows(result.payload, (written, total) => {
        setStatus(`正在写入数据库 ${written} / ${total} 条...`);
      });
      setStatus(dealerOutboundSuccessStatus(result));
      alert(`导入成功，共处理 ${result.payload.length} 条记录`);
    }
  };
}
