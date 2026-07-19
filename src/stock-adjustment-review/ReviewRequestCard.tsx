import {
  formatReviewDate,
  formatSpecFlavor,
  quantityClass,
  reasonLabel,
  requestDetailNote,
  signedQuantity,
  stockBeforeByBarcode,
  type StockAdjustmentReviewEntry
} from '../domain/stock-adjustment-review';

type ReviewRequestCardProps = {
  disabled: boolean;
  entry: StockAdjustmentReviewEntry;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
};

export function ReviewRequestCard({ disabled, entry, onApprove, onReject }: ReviewRequestCardProps) {
  const request = entry.request || {};
  const stock = stockBeforeByBarcode(entry);
  const detailNote = requestDetailNote(request);
  const requestId = String(request.id || '');

  return (
    <article className="review-request-card">
      <div className="review-request-head">
        <div className="review-request-title">
          <span>{request.request_no}</span>
          <span className="employee-pill">{request.employee_code}</span>
        </div>
        <div className="review-request-time">提交于 {formatReviewDate(request.submitted_at)}</div>
      </div>
      <div className="review-request-reason">
        <div><strong>调整原因：</strong>{reasonLabel(request.reason_code)}</div>
        <div className="review-request-note">{detailNote || '无补充说明'}</div>
      </div>
      <div className="review-request-table">
        <div className="table-wrap">
          <table className="review-table">
            <thead>
              <tr><th>规格口味</th><th>条码</th><th>当前库存</th><th>调整</th><th>审核后库存</th></tr>
            </thead>
            <tbody>
              {(entry.items || []).map((item, index) => {
                const before = stock.get(item.product_barcode) || 0;
                const delta = Number(item.adjustment_qty);
                const after = before + delta;
                return (
                  <tr key={`${item.product_barcode || ''}|${index}`}>
                    <td>{formatSpecFlavor(item) || item.product_barcode}</td>
                    <td className="cell-nowrap">{item.product_barcode}</td>
                    <td className="cell-number stock-number">{before}</td>
                    <td className={`cell-number ${quantityClass(delta)}`}>{signedQuantity(delta)}</td>
                    <td className={`cell-number ${after < 0 ? 'qty-negative' : 'stock-number'}`}>{after}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="review-request-actions">
        <button className="danger-outline" disabled={disabled} onClick={() => onReject(requestId)} type="button">驳回</button>
        <button className="primary" disabled={disabled} onClick={() => onApprove(requestId)} type="button">同意</button>
      </div>
    </article>
  );
}
