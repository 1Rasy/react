import { Fragment } from 'react';
import {
  formatStockDate,
  formatStockQuantity,
  formatStockUnits,
  type StockSummaryRow
} from '../domain/stock-summary';

type StockSummaryTableProps = {
  expandedEmployee: string;
  hasLoaded: boolean;
  rows: readonly StockSummaryRow[];
  onToggle: (employeeCode: string) => void;
};

function StockDetailRow({ row }: { row: StockSummaryRow }) {
  return (
    <tr className="detail-row">
      <td colSpan={6}>
        <div className="detail-box">
          <div className="detail-title">
            <strong>{row.name || row.employee_code} 的库存明细</strong>
            <span className="sub">共 {row.items.length} 个条码</span>
          </div>
          <div className="table-wrap">
            <table className="detail-table">
              <thead>
                <tr><th>规格口味</th><th>条码</th><th>库存散数</th><th>换算显示</th><th>箱规</th><th>盒规</th><th>更新时间</th></tr>
              </thead>
              <tbody>
                {row.items.map((item, index) => {
                  const quantityClass = item.qty < 0 ? 'qty-negative' : item.qty === 0 ? 'qty-zero' : 'amount';
                  return (
                    <tr key={`${item.product_barcode}|${index}`}>
                      <td><span className="detail-product">{item.product.title}</span></td>
                      <td>{item.product_barcode}</td>
                      <td className={quantityClass}>{formatStockQuantity(item.qty)}</td>
                      <td>{formatStockUnits(item.qty, item.product)}</td>
                      <td>{item.product.pcs_per_case || '-'}</td>
                      <td>{item.product.pcs_per_box || '-'}</td>
                      <td>{formatStockDate(item.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function StockSummaryTable({ expandedEmployee, hasLoaded, rows, onToggle }: StockSummaryTableProps) {
  return (
    <section className="card">
      <h2>员工库存汇总</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th style={{ width: 60 }}>展开</th><th>员工</th><th style={{ width: 110 }}>库存品项</th><th style={{ width: 120 }}>库存合计</th><th style={{ width: 120 }}>负数品项</th><th style={{ width: 160 }}>最近更新时间</th></tr>
          </thead>
          <tbody id="employeeRows">
            {!hasLoaded ? null : rows.length === 0 ? (
              <tr><td colSpan={6}><div className="empty">暂无库存数据</div></td></tr>
            ) : rows.map(row => {
              const open = expandedEmployee === row.employee_code;
              return (
                <Fragment key={row.employee_code}>
                  <tr className="clickable" onClick={() => onToggle(row.employee_code)}>
                    <td><span className="pill">{open ? '收起' : '展开'}</span></td>
                    <td><strong>{row.name || row.employee_code}</strong>{row.is_active ? null : <div className="sub">已停用</div>}</td>
                    <td className="amount">{row.itemCount}</td>
                    <td className="amount">{formatStockQuantity(row.totalQty)}</td>
                    <td>{row.negativeCount ? <span className="pill warn">{row.negativeCount}</span> : '0'}</td>
                    <td>{formatStockDate(row.lastUpdated)}</td>
                  </tr>
                  {open ? <StockDetailRow row={row} /> : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
