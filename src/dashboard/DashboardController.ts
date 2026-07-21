import {
  buildDashboardExportRows,
  createDashboardWorkbook,
  getDashboardExportFileName,
  resolveDashboardDateRange,
  type DashboardEmployee,
  type DashboardOrder,
  type DashboardRange,
  type DashboardXlsxLibrary
} from '../domain/dashboard.ts';
import {
  DashboardDataLoadError,
  type DashboardRepository
} from '../services/dashboard-repository.ts';

export type DashboardSelection = {
  range: DashboardRange;
  customStart: string;
  customEnd: string;
};

export type DashboardLoadResult =
  | { ok: true; orders: DashboardOrder[]; employees: DashboardEmployee[] }
  | { ok: false; message: string };

export type DashboardControllerOptions = {
  repository: DashboardRepository;
  xlsx?: DashboardXlsxLibrary;
  alert: (message: string) => void;
  warn: (message: string, error: unknown) => void;
  now?: () => Date;
};

function errorMessage(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error || '未知错误');
}

export function createDashboardController(options: DashboardControllerOptions) {
  const {
    repository,
    xlsx,
    alert,
    warn,
    now = () => new Date()
  } = options;

  function dates(selection: DashboardSelection) {
    return resolveDashboardDateRange(
      selection.range,
      selection.customStart,
      selection.customEnd,
      now()
    );
  }

  return {
    async loadDashboard(selection: DashboardSelection): Promise<DashboardLoadResult> {
      try {
        const data = await repository.loadDashboard(dates(selection));
        return { ok: true, ...data };
      } catch (error) {
        if (error instanceof DashboardDataLoadError) {
          console.error(error.rawError);
          const prefix = error.source === 'orders'
            ? '卖进数据加载失败：'
            : '员工数据加载失败：';
          return { ok: false, message: prefix + error.message };
        }
        console.error(error);
        return { ok: false, message: '卖进数据加载失败：' + errorMessage(error) };
      }
    },

    async loadPendingStockAdjustmentCount(): Promise<number> {
      try {
        return await repository.loadPendingStockAdjustmentCount();
      } catch (error) {
        warn('待审核库存修改数量加载失败', error);
        return 0;
      }
    },

    async exportOrderExcel(
      selection: DashboardSelection,
      employeeCode: string
    ): Promise<boolean> {
      if (!xlsx) {
        alert('Excel 导出组件加载失败，请刷新页面后重试');
        return false;
      }

      let sourceRows;
      try {
        sourceRows = await repository.loadDashboardExportRows(
          dates(selection),
          employeeCode
        );
      } catch (error) {
        console.error(error);
        alert('开单数据加载失败：' + errorMessage(error));
        return false;
      }
      if (!sourceRows.length) {
        alert('当前筛选没有可导出的开单明细');
        return false;
      }

      const rows = buildDashboardExportRows(sourceRows);
      if (!rows.length) {
        alert('当前筛选没有开单明细可导出');
        return false;
      }
      const workbook = createDashboardWorkbook(xlsx, rows);
      xlsx.writeFile(
        workbook,
        getDashboardExportFileName(
          selection.range,
          selection.customStart,
          selection.customEnd,
          now()
        ),
        { cellStyles: true }
      );
      return true;
    }
  };
}

export type DashboardController = ReturnType<typeof createDashboardController>;

