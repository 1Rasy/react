import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  buildStockSummaryRows,
  compareStockProducts,
  createStockSummaryWorkbook,
  formatStockQuantity,
  stockExportFileName,
  stockSummaryMetrics,
  toggleExpandedEmployee,
  type StockSummaryXlsxLibrary
} from '../domain/stock-summary';
import type {
  StockSummaryPageData,
  StockSummaryRepository
} from '../services/stock-summary-repository';
import { createStockImportController, type StockImportStatus } from './StockImportController';
import { StockSummaryTable } from './StockSummaryTable';

type StockSummaryPageProps = {
  repository: StockSummaryRepository;
  xlsx?: StockSummaryXlsxLibrary;
};

type PageStatus = { kind: 'normal' | 'error'; text: string } | null;

function errorText(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error || '未知错误');
}

export function StockSummaryPage({ repository, xlsx }: StockSummaryPageProps) {
  const [data, setData] = useState<StockSummaryPageData | null>(null);
  const [search, setSearch] = useState('');
  const [expandedEmployee, setExpandedEmployee] = useState('');
  const [status, setStatus] = useState<PageStatus>({ kind: 'normal', text: '正在加载库存...' });
  const fileInput = useRef<HTMLInputElement>(null);

  const loadSummary = useCallback(async (): Promise<{ stockCount: number }> => {
    setStatus({ kind: 'normal', text: '正在分页加载全部库存...' });
    try {
      const loaded = await repository.loadSummary();
      const nextData = {
        ...loaded,
        products: [...loaded.products].sort(compareStockProducts)
      };
      setData(nextData);
      setStatus(null);
      return { stockCount: nextData.stocks.length };
    } catch (error) {
      console.error(error);
      setStatus({ kind: 'error', text: `库存加载失败：${errorText(error)}` });
      throw error;
    }
  }, [repository]);

  useEffect(() => {
    void loadSummary().catch(() => undefined);
  }, [loadSummary]);

  const rows = useMemo(() => data
    ? buildStockSummaryRows(data.stocks, data.employees, data.products, search)
    : [], [data, search]);
  const metrics = useMemo(() => data ? stockSummaryMetrics(data.stocks) : null, [data]);

  const importController = useMemo(() => createStockImportController({
    repository,
    xlsx,
    confirm: message => window.confirm(message),
    alert: message => window.alert(message)
  }), [repository, xlsx]);

  function openImportFile() {
    if (!fileInput.current) return;
    fileInput.current.value = '';
    fileInput.current.click();
  }

  async function importStockExcel(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      await importController.importFile({
        file,
        reload: loadSummary,
        setStatus: (next: StockImportStatus) => setStatus({
          kind: next.kind || 'normal',
          text: next.text
        })
      });
    } catch (error) {
      console.error(error);
      const message = `库存导入失败：${errorText(error)}`;
      setStatus({ kind: 'error', text: message });
      window.alert(message);
    } finally {
      input.value = '';
    }
  }

  function exportEmployeeStocks() {
    if (!xlsx) {
      window.alert('Excel 导出组件加载失败，请刷新页面后重试');
      return;
    }
    const workbook = createStockSummaryWorkbook(xlsx, rows);
    xlsx.writeFile(workbook, stockExportFileName());
  }

  return (
    <main className="shell">
      <section className="card">
        <div className="top">
          <div><h1>库存管理</h1></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => { window.location.href = 'dashboard.html'; }} type="button">返回管理看板</button>
            <button className="btn" onClick={openImportFile} type="button">导入7月1日期初库存</button>
            <button className="btn" onClick={exportEmployeeStocks} type="button">导出</button>
            <button className="btn primary" onClick={() => void loadSummary().catch(() => undefined)} type="button">刷新</button>
            <input
              accept=".xlsx,.xls"
              id="stockImportFile"
              onChange={event => void importStockExcel(event)}
              ref={fileInput}
              style={{ display: 'none' }}
              type="file"
            />
          </div>
        </div>
        <div className="filters">
          <input
            id="searchInput"
            className="input"
            onChange={event => setSearch(event.currentTarget.value)}
            placeholder="搜索员工/工号/商品/条码"
            value={search}
          />
          <button className="btn" onClick={() => setSearch('')} type="button">清空搜索</button>
        </div>
        <nav className="inventory-tools" aria-label="库存管理工具">
          <a className="btn inventory-tool-link" href="stock-adjustment-review">库存修改审核</a>
          <a className="btn inventory-tool-link" href="inventory-movements">库存流水</a>
        </nav>
      </section>

      <div id="status" className={`status${status ? '' : ' hide'}${status?.kind === 'error' ? ' error' : ''}`}>
        {status?.text || ''}
      </div>

      <section className="metric-grid" id="metricGrid">
        {metrics ? (
          <>
            <div className="metric"><div className="label">参与库存员工</div><div className="value">{metrics.totalEmployees}</div></div>
            <div className="metric"><div className="label">库存记录总数</div><div className="value">{metrics.recordCount.toLocaleString('zh-CN')}</div></div>
            <div className="metric"><div className="label">当前库存合计</div><div className="value">{formatStockQuantity(metrics.totalQty)}</div></div>
          </>
        ) : null}
      </section>

      <StockSummaryTable
        expandedEmployee={expandedEmployee}
        hasLoaded={Boolean(data)}
        onToggle={employeeCode => setExpandedEmployee(current => toggleExpandedEmployee(current, employeeCode))}
        rows={rows}
      />
    </main>
  );
}
