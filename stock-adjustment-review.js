(function() {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
  const admin = sessionStorage.getItem('admin_employee_code') || 'ADMIN';
  const stockAdjustmentApi = StockAdjustmentApi.create(client);
  let employeeNames = new Map();

  function employeeName(employeeCode) {
    return employeeNames.get(String(employeeCode || '')) || '—';
  }

  function buttonsDisabled(disabled) {
    document.querySelectorAll('#queue button').forEach(button => {
      button.disabled = disabled;
    });
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  }

  function quantityClass(value) {
    const amount = Number(value);
    if (amount > 0) return 'qty-positive';
    if (amount < 0) return 'qty-negative';
    return 'qty-zero';
  }

  function renderMetrics(rows) {
    const requests = Array.isArray(rows) ? rows : [];
    const itemCount = requests.reduce((sum, entry) => sum + (Array.isArray(entry.items) ? entry.items.length : 0), 0);
    $('reviewMetrics').innerHTML = `
      <div class="metric"><div class="metric-label">待审核申请</div><div class="metric-value">${requests.length}</div></div>
      <div class="metric"><div class="metric-label">待审核商品行</div><div class="metric-value">${itemCount}</div></div>`;
    $('reviewStatus').textContent = `${requests.length} 个申请`;
  }

  function renderRequest(entry) {
    const request = entry.request;
    const stock = new Map((entry.stocks || []).map(item => [item.product_barcode, Number(item.qty)]));
    const reason = StockAdjustmentCore.reasonLabel(request.reason_code);
    const detailNote = [request.reason_note, request.remark ? `备注：${request.remark}` : ''].filter(Boolean).join('；');
    return `<article class="review-request-card">
      <div class="review-request-head">
        <div class="review-request-title"><span>${esc(request.request_no)}</span><span class="employee-pill">${esc(request.employee_code)}</span></div>
        <div class="review-request-time">提交于 ${esc(formatDate(request.submitted_at))}</div>
      </div>
      <div class="review-request-reason"><div><strong>调整原因：</strong>${esc(reason)}</div><div class="review-request-note">${detailNote ? esc(detailNote) : '无补充说明'}</div></div>
      <div class="review-request-table"><div class="table-wrap"><table class="review-table">
        <thead><tr><th>规格口味</th><th>条码</th><th>当前库存</th><th>调整</th><th>审核后库存</th></tr></thead>
        <tbody>${(entry.items || []).map(item => {
          const before = stock.get(item.product_barcode) || 0;
          const delta = Number(item.adjustment_qty);
          const after = before + delta;
          return `<tr><td>${esc(StockAdjustmentCore.formatSpecFlavor(item) || item.product_barcode)}</td><td class="cell-nowrap">${esc(item.product_barcode)}</td><td class="cell-number stock-number">${before}</td><td class="cell-number ${quantityClass(delta)}">${delta > 0 ? '+' : ''}${delta}</td><td class="cell-number ${after < 0 ? 'qty-negative' : 'stock-number'}">${after}</td></tr>`;
        }).join('')}</tbody>
      </table></div></div>
      <div class="review-request-actions"><button class="danger-outline" onclick="window.rejectAdjustment('${esc(request.id)}')">驳回</button><button class="primary" onclick="window.approveAdjustment('${esc(request.id)}')">同意</button></div>
    </article>`;
  }

  function historyStatusMeta(status) {
    if (status === 'approved') return { label: '已通过', className: 'status-approved' };
    return { label: '已驳回', className: 'status-rejected' };
  }

  function renderHistoryItem(entry) {
    const request = entry.request || {};
    const status = historyStatusMeta(request.status);
    const reason = StockAdjustmentCore.reasonLabel(request.reason_code);
    const note = [request.reason_note, request.remark ? `备注：${request.remark}` : ''].filter(Boolean).join('；');
    return `<details class="review-history-card">
      <summary class="review-history-summary">
        <div class="review-history-title"><span>${esc(request.request_no)}</span><span class="employee-pill">${esc(employeeName(request.employee_code))}</span><span class="status-pill ${status.className}">${status.label}</span></div>
        <div class="review-history-time">${esc(formatDate(request.reviewed_at))}</div>
      </summary>
      <div class="review-history-body">
        <div class="review-history-meta"><span><strong>审核人：</strong>${esc(employeeName(request.reviewer_code))}</span><span><strong>调整原因：</strong>${esc(reason)}</span><span><strong>提交时间：</strong>${esc(formatDate(request.submitted_at))}</span></div>
        <div class="review-request-note">${note ? esc(note) : '无补充说明'}</div>
        ${request.status === 'rejected' ? `<div class="review-history-rejection"><strong>驳回理由：</strong>${esc(request.rejection_reason || '-')}</div>` : ''}
        <div class="table-wrap review-history-table-wrap"><table class="history-table">
          <thead><tr><th>规格口味</th><th>条码</th><th>调整数量</th></tr></thead>
          <tbody>${(entry.items || []).map(item => {
            const delta = Number(item.adjustment_qty);
            return `<tr><td>${esc(StockAdjustmentCore.formatSpecFlavor(item))}</td><td class="cell-nowrap">${esc(item.product_barcode)}</td><td class="cell-number ${quantityClass(delta)}">${delta > 0 ? '+' : ''}${delta}</td></tr>`;
          }).join('') || '<tr class="empty-row"><td colspan="3">无商品明细</td></tr>'}</tbody>
        </table></div>
      </div>
    </details>`;
  }

  function renderHistory(rows) {
    const history = Array.isArray(rows) ? rows : [];
    $('historyStatus').textContent = `最近 ${history.length} 条`;
    $('history').innerHTML = history.map(renderHistoryItem).join('') || '<div class="empty-state">暂无审核历史。</div>';
  }

  async function load() {
    $('reviewStatus').textContent = '正在加载...';
    $('historyStatus').textContent = '正在加载...';
    $('queue').innerHTML = '<div class="loading-state">正在加载待审核申请...</div>';
    $('history').innerHTML = '<div class="loading-state">正在加载审核历史...</div>';
    try {
      const [pendingRows, historyRows, employeesResult] = await Promise.all([stockAdjustmentApi.pending(), stockAdjustmentApi.reviewHistory(100), client.from('employees').select('employee_code,name')]);
      if (employeesResult.error) throw employeesResult.error;
      employeeNames = new Map((employeesResult.data || []).map(employee => [String(employee.employee_code), employee.name]));
      const requests = Array.isArray(pendingRows) ? pendingRows : [];
      renderMetrics(requests);
      $('queue').innerHTML = requests.map(renderRequest).join('') || '<div class="empty-state">暂无待审核申请。</div>';
      renderHistory(historyRows);
    } catch (error) {
      console.error(error);
      $('reviewStatus').textContent = '加载失败';
      $('historyStatus').textContent = '加载失败';
      const message = `<div class="error-state">加载失败：${esc(error.message || '未知错误')}</div>`;
      $('queue').innerHTML = message;
      $('history').innerHTML = message;
    }
  }

  window.approveAdjustment = async id => {
    buttonsDisabled(true);
    try { await stockAdjustmentApi.approve(id, admin); await load(); }
    catch (error) { alert(error.message || '审核失败'); buttonsDisabled(false); }
  };

  window.rejectAdjustment = async id => {
    const reason = prompt('驳回理由（必填）');
    if (!reason?.trim()) return;
    buttonsDisabled(true);
    try { await stockAdjustmentApi.reject(id, admin, reason.trim()); await load(); }
    catch (error) { alert(error.message || '审核失败'); buttonsDisabled(false); }
  };

  $('refresh').onclick = load;
  load();
})();
