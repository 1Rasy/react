(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StockAdjustmentCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const REASONS = Object.freeze({
    inventory_count: '盘点差异',
    damage: '破损报废',
    transfer: '调货',
    other: '其他'
  });
  const STATUSES = Object.freeze({
    draft: '草稿', pending_review: '待审核', rejected: '已驳回',
    withdrawn: '已撤回', approved: '已通过'
  });

  function number(value) {
    const result = Number(value || 0);
    return Number.isFinite(result) ? result : 0;
  }

  function signedAdjustment(input) {
    const absolute = number(input.pieces);
    return input.direction === 'minus' ? -absolute : absolute;
  }

  function projectedStock(current, delta) {
    return number(current) + number(delta);
  }

  function validateAdjustmentDraft(draft) {
    const items = Array.isArray(draft.items) ? draft.items : [];
    if (!items.length) return '请至少添加一个商品';
    if (!draft.reasonCode || !REASONS[draft.reasonCode]) return '请选择调整原因';
    if (draft.reasonCode === 'other' && !String(draft.reasonNote || '').trim()) return '选择“其他”时必须填写说明';
    if (items.some(item => !Number.isSafeInteger(Number(item.adjustmentQty)))) return '调整数量必须是整数';
    if (items.some(item => !number(item.adjustmentQty))) return '调整数量不能为 0';
    return '';
  }

  function statusLabel(status) { return STATUSES[status] || String(status || ''); }
  function reasonLabel(code) { return REASONS[code] || String(code || ''); }

  function formatSpecFlavor(product) {
    return [product && product.spec, product && product.flavor]
      .map(value => String(value == null ? '' : value).trim())
      .filter(Boolean).join(' ');
  }

  function addDays(dateText, days) {
    const parts = String(dateText || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return '';
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
    return date.toISOString().slice(0, 10);
  }

  function buildShanghaiDateRange(startDate, endDate) {
    return { startDate: String(startDate || ''), endExclusiveDate: addDays(endDate, 1) };
  }

  return {
    REASONS, STATUSES, signedAdjustment, projectedStock, validateAdjustmentDraft,
    statusLabel, reasonLabel, formatSpecFlavor, buildShanghaiDateRange
  };
});
