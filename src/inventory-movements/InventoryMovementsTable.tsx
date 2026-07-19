import {
  formatSpecFlavor,
  inventoryMovementTypeLabel,
  quantityClass,
  shanghaiTableTime,
  signedQuantity,
  type InventoryMovement
} from '../domain/inventory-movements';

type InventoryMovementsTableProps = {
  hasLoaded: boolean;
  movements: readonly InventoryMovement[];
};

function movementKey(row: InventoryMovement, index: number): string {
  return String(row.movement_id || row.id || [
    row.employee_code,
    row.product_barcode,
    row.occurred_at,
    row.source_no,
    index
  ].join('|'));
}

export function InventoryMovementsTable({ hasLoaded, movements }: InventoryMovementsTableProps) {
  return (
    <section className="page-card">
      <div className="table-head">
        <h2>库存变化明细</h2>
        <span id="tableCount" className="table-count">{movements.length} 条</span>
      </div>
      <div className="table-wrap movements-table-wrap">
        <table className="movements-table">
          <thead>
            <tr>
              <th>工号</th><th>条码</th><th>规格口味</th><th>原因</th><th>数量</th><th>时间</th>
              <th>类型</th><th>来源单号</th><th>前库存</th><th>后库存</th><th>操作人</th>
            </tr>
          </thead>
          <tbody id="rows">
            {!hasLoaded ? (
              <tr className="empty-row"><td colSpan={11}>正在加载...</td></tr>
            ) : movements.length === 0 ? (
              <tr className="empty-row"><td colSpan={11}>暂无库存流水</td></tr>
            ) : movements.map((row, index) => (
              <tr key={movementKey(row, index)}>
                <td className="cell-nowrap">{row.employee_code}</td>
                <td className="cell-nowrap">{row.product_barcode}</td>
                <td>{formatSpecFlavor(row)}</td>
                <td>{row.reason_display}</td>
                <td className={`cell-number ${quantityClass(row.quantity_delta)}`}>{signedQuantity(row.quantity_delta)}</td>
                <td className="cell-nowrap">{shanghaiTableTime(row.occurred_at)}</td>
                <td className="cell-nowrap">{inventoryMovementTypeLabel(row.movement_type)}</td>
                <td className="cell-nowrap">{row.source_no}</td>
                <td className="cell-number stock-number">{Number(row.quantity_before)}</td>
                <td className="cell-number stock-number">{Number(row.quantity_after)}</td>
                <td className="cell-nowrap">{row.operator_code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
