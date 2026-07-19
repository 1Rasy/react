(function (root, factory) {
  const api = factory(root.StockAdjustmentCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InventoryMovementExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  if (!core && typeof require === 'function') core = require('./stock-adjustment-core.js');
  const INVENTORY_EXPORT_HEADERS = Object.freeze([
    '工号', '条码', '规格口味', '库存变化原因', '库存变动数量', '库存变动时间',
    '库存变化类型', '来源单号', '变动前库存', '变动后库存', '操作人'
  ]);
  const TYPE_LABELS = Object.freeze({ manual_adjustment: '人工库存调整' });

  function shanghaiTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(date).replaceAll('/', '-');
  }

  function buildInventoryExportRows(movements) {
    return [INVENTORY_EXPORT_HEADERS.slice(), ...(movements || []).map(row => [
      String(row.employee_code || ''), String(row.product_barcode || ''),
      core.formatSpecFlavor(row), String(row.reason_display || ''), Number(row.quantity_delta || 0),
      shanghaiTime(row.occurred_at), TYPE_LABELS[row.movement_type] || String(row.movement_type || ''),
      String(row.source_no || ''), Number(row.quantity_before || 0), Number(row.quantity_after || 0),
      String(row.operator_code || '')
    ])];
  }

  function forceBarcodeTextCells(sheet, dataRowCount) {
    for (let row = 2; row < 2 + Number(dataRowCount || 0); row += 1) {
      const ref = `B${row}`;
      if (!sheet[ref]) sheet[ref] = { v: '', t: 's' };
      sheet[ref].v = String(sheet[ref].v == null ? '' : sheet[ref].v);
      sheet[ref].t = 's';
      sheet[ref].z = '@';
    }
    return sheet;
  }

  function inventoryExportFileName(startDate, endDate) {
    const compact = value => String(value || '').replaceAll('-', '');
    return `库存变动明细_${compact(startDate)}_${compact(endDate)}.xlsx`;
  }

  function createWorkbook(XLSX, movements) {
    const rows = buildInventoryExportRows(movements);
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    forceBarcodeTextCells(worksheet, rows.length - 1);
    worksheet['!cols'] = [12, 18, 24, 18, 14, 22, 18, 22, 14, 14, 16].map(wch => ({ wch }));
    worksheet['!autofilter'] = { ref: worksheet['!ref'] };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '库存变动明细');
    return workbook;
  }

  return { INVENTORY_EXPORT_HEADERS, TYPE_LABELS, buildInventoryExportRows, forceBarcodeTextCells, inventoryExportFileName, createWorkbook };
});

