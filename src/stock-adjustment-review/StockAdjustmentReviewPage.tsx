import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createReviewActionGuard,
  errorMessage,
  reviewMetrics,
  type StockAdjustmentReviewPageData
} from '../domain/stock-adjustment-review';
import type { StockAdjustmentReviewRepository } from '../services/stock-adjustment-review-repository';
import { ReviewHistoryItem } from './ReviewHistoryItem';
import { ReviewRequestCard } from './ReviewRequestCard';

type StockAdjustmentReviewPageProps = {
  adminCode: string;
  repository: StockAdjustmentReviewRepository;
};

export function StockAdjustmentReviewPage({ adminCode, repository }: StockAdjustmentReviewPageProps) {
  const [data, setData] = useState<StockAdjustmentReviewPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const actionGuard = useRef(createReviewActionGuard());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setData(await repository.loadReviewPage());
    } catch (error) {
      console.error(error);
      setLoadError(errorMessage(error, '未知错误'));
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = data ? reviewMetrics(data.pendingRows) : null;
  const employeeNames = useMemo(() => new Map(
    (data?.employees || []).map(employee => [String(employee.employee_code || ''), employee.name])
  ), [data]);

  async function runAction(action: () => Promise<unknown>) {
    if (!actionGuard.current.begin()) return;
    setSubmitting(true);
    try {
      await action();
      await load();
    } catch (error) {
      window.alert(errorMessage(error, '审核失败'));
    } finally {
      actionGuard.current.end();
      setSubmitting(false);
    }
  }

  function approve(requestId: string) {
    void runAction(() => repository.approve(requestId, adminCode));
  }

  function reject(requestId: string) {
    const reason = window.prompt('驳回理由（必填）');
    if (!reason?.trim()) return;
    void runAction(() => repository.reject(requestId, adminCode, reason.trim()));
  }

  const reviewStatus = loading ? '正在加载...' : loadError ? '加载失败' : `${metrics?.requestCount || 0} 个申请`;
  const historyStatus = loading ? '正在加载...' : loadError ? '加载失败' : `最近 ${data?.historyRows.length || 0} 条`;

  return (
    <main className="shell admin-stock-page">
      <section className="page-card page-header-card">
        <div className="page-header">
          <div className="page-title-wrap"><h1>库存调整审核</h1></div>
          <div className="page-actions">
            <button className="btn" onClick={() => { window.location.href = 'stock_summary'; }} type="button">返回库存管理</button>
            <button id="refresh" className="btn primary" onClick={() => void load()} type="button">刷新</button>
          </div>
        </div>
      </section>

      <section id="reviewMetrics" className="metric-grid">
        <div className="metric"><div className="metric-label">待审核申请</div><div className="metric-value">{metrics?.requestCount ?? '-'}</div></div>
        <div className="metric"><div className="metric-label">待审核商品行</div><div className="metric-value">{metrics?.itemCount ?? '-'}</div></div>
      </section>

      <section className="page-card">
        <div className="table-head"><h2>待审核队列</h2><span id="reviewStatus" className="table-count">{reviewStatus}</span></div>
        <div id="queue" className="review-list">
          {loading ? <div className="loading-state">正在加载待审核申请...</div>
            : loadError ? <div className="error-state">加载失败：{loadError}</div>
              : data?.pendingRows.length ? data.pendingRows.map((entry, index) => (
                <ReviewRequestCard
                  disabled={submitting}
                  entry={entry}
                  key={String(entry.request?.id || entry.request?.request_no || index)}
                  onApprove={approve}
                  onReject={reject}
                />
              )) : <div className="empty-state">暂无待审核申请。</div>}
        </div>
      </section>

      <section className="page-card">
        <div className="table-head"><h2>审核历史</h2><span id="historyStatus" className="table-count">{historyStatus}</span></div>
        <div id="history" className="review-history-list">
          {loading ? <div className="loading-state">正在加载审核历史...</div>
            : loadError ? <div className="error-state">加载失败：{loadError}</div>
              : data?.historyRows.length ? data.historyRows.map((entry, index) => (
                <ReviewHistoryItem
                  employeeNames={employeeNames}
                  entry={entry}
                  key={String(entry.request?.id || entry.request?.request_no || index)}
                />
              )) : <div className="empty-state">暂无审核历史。</div>}
        </div>
      </section>
    </main>
  );
}
