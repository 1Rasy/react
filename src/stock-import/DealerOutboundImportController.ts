import {
  DEALER_OUTBOUND_EMPTY_EXCEL_ERROR,
  buildCtDealerOutboundRows,
  buildJnDealerOutboundRows,
  ctDealerOutboundZeroRowsError,
  dealerOutboundReadyStatus,
  dealerOutboundZeroRowsError,
  type DealerOutboundBuildResult,
  type DealerOutboundXlsxLibrary
} from '../domain/dealer-outbound-import.ts';
import type { DealerOutboundImportRepository } from '../services/dealer-outbound-import-repository.ts';

export type DealerOutboundImporterKind = 'jn' | 'ct';

export type UnifiedDealerOutboundImportControllerOptions = {
  repository: DealerOutboundImportRepository;
  xlsx?: DealerOutboundXlsxLibrary;
  alert: (message: string) => void;
  now?: () => number;
};

export type UnifiedDealerOutboundRunOptions = {
  kind: DealerOutboundImporterKind;
  file: Pick<File, 'arrayBuffer'>;
  setStatus: (text: string, error?: boolean) => void;
};

function buildRows(
  kind: DealerOutboundImporterKind,
  rows: readonly unknown[][],
  whitelist: ReadonlySet<string>,
  now: number
): DealerOutboundBuildResult {
  return kind === 'jn'
    ? buildJnDealerOutboundRows(rows, whitelist, now)
    : buildCtDealerOutboundRows(rows, whitelist, now);
}

function zeroRowsError(kind: DealerOutboundImporterKind, result: DealerOutboundBuildResult): string {
  return kind === 'jn'
    ? dealerOutboundZeroRowsError(result)
    : ctDealerOutboundZeroRowsError(result);
}

export function unifiedDealerOutboundSuccessStatus(result: DealerOutboundBuildResult): string {
  return `原始记录导入完成。\n原始数据 ${result.total} 行，实际导入/更新 ${result.payload.length} 行。\n本次导入不会改变当前库存。`;
}

export function createUnifiedDealerOutboundImportController(
  options: UnifiedDealerOutboundImportControllerOptions
) {
  const { repository, xlsx, alert, now = Date.now } = options;

  return {
    async importFile({ kind, file, setStatus }: UnifiedDealerOutboundRunOptions): Promise<void> {
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

      const result = buildRows(kind, rows, whitelist, now());
      if (!result.payload.length) throw new Error(zeroRowsError(kind, result));
      setStatus(dealerOutboundReadyStatus(result));
      await repository.upsertOutboundRows(result.payload, (written, total) => {
        setStatus(`正在写入原始记录 ${written} / ${total} 条...`);
      });
      setStatus(unifiedDealerOutboundSuccessStatus(result));
      alert(`原始记录导入成功，共处理 ${result.payload.length} 条；当前库存不受影响`);
    }
  };
}
