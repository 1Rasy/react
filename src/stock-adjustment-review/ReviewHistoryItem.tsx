import {
  employeeName,
  formatReviewDate,
  formatSpecFlavor,
  historyStatusMeta,
  quantityClass,
  reasonLabel,
  requestDetailNote,
  signedQuantity,
  type StockAdjustmentReviewEntry
} from '../domain/stock-adjustment-review';

type ReviewHistoryItemProps = {
  employeeNames: ReadonlyMap<string, string | null | undefined>;
  entry: StockAdjustmentReviewEntry;
};

export function ReviewHistoryItem({ employeeNames, entry }: ReviewHistoryItemProps) {
  const request = entry.request || {};
  const status = historyStatusMeta(request.status);
  const note = requestDetailNote(request);

  return (
    <details className="review-history-card">
      <summary className="review-history-summary">
        <div className="review-history-title">
          <span>{request.request_no}</span>
          <span className="employee-pill">{employeeName(employeeNames, request.employee_code)}</span>
          <span className={`status-pill ${status.className}`}>{status.label}</span>
        </div>
        <div className="review-history-time">{formatReviewDate(request.reviewed_at)}</div>
      </summary>
      <div className="review-history-body">
        <div className="review-history-meta">
          <span><strong>审核人：</strong>{employeeName(employeeNames, request.reviewer_code)}</span>
          <span><strong>调整原因：</strong>{reasonLabel(request.reason_code)}</span>
          <span><strong>提交时间：</strong>{formatReviewDate(request.submitted_at)}</span>
        </div>
        <div className="review-request-note">{note || '无补充说明'}</div>
        {request.status === 'rejected' ? (
          <div className="review-history-rejection"><strong>驳回理由：</strong>{request.rejection_reason || '-'}</div>
        ) : null}
        <div className="table-wrap review-history-table-wrap">
          <table className="history-table">
            <thead><tr><th>规格口味</th><th>条码</th><th>调整数量</th></tr></thead>
            <tbody>
              {(entry.items || []).length ? (entry.items || []).map((item, index) => {
                const delta = Number(item.adjustment_qty);
                return (
                  <tr key={`${item.product_barcode || ''}|${index}`}>
                    <td>{formatSpecFlavor(item)}</td>
                    <td className="cell-nowrap">{item.product_barcode}</td>
                    <td className={`cell-number ${quantityClass(delta)}`}>{signedQuantity(delta)}</td>
                  </tr>
                );
              }) : <tr className="empty-row"><td colSpan={3}>无商品明细</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
