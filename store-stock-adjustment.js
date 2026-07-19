(function() {
  let adjustmentMode = false;
  let editingRequestId = null;
  let editMeta = null;
  let requestPanelsHtml = '';
  let failedSubmissionMeta = null;
  const adjustments = new Map();
  const stockAdjustmentApi = StockAdjustmentApi.create(client);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
  const initialAdjust = new URLSearchParams(location.search).get('adjust') === '1';
  const originalOpenStockManagement = window.openStockManagement;
  const originalSelectBrand = window.selectBrand;
  const originalSelectSpec = window.selectSpec;

  function setBaseBackVisible(visible) {
    const back = $('back');
    if (back) back.classList.toggle('hide', !visible);
  }

  window.openStockManagement = async function() {
    await originalOpenStockManagement();
    if (initialAdjust) await window.openStockAdjustmentMode();
  };

  window.selectBrand = function(value) {
    if (!adjustmentMode) return originalSelectBrand(value);
    currentSelectedBrand = value;
    currentSelectedSpec = getSpecsForBrand(value)[0] || '';
    renderAdjustmentProductArea();
  };

  window.selectSpec = function(value) {
    if (!adjustmentMode) return originalSelectSpec(value);
    currentSelectedSpec = value;
    renderAdjustmentProductArea();
  };

  function rows() {
    return orderedProducts(products.filter(product => (
      product.brand === currentSelectedBrand && product.spec === currentSelectedSpec
    )));
  }

  function draftFor(id) {
    return adjustments.get(String(id)) || { direction: 'plus', qty: 0 };
  }

  function signed(row) {
    return row.direction === 'minus' ? -row.qty : row.qty;
  }

  function clearEditState() {
    editingRequestId = null;
    editMeta = null;
    failedSubmissionMeta = null;
    adjustments.clear();
  }

  function setDraft(id, field, value) {
    const key = String(id);
    const row = { ...draftFor(key) };
    if (field === 'qty') {
      const qty = Number(value);
      row.qty = Number.isSafeInteger(qty) && qty >= 0 ? qty : 0;
    } else if (field === 'direction' && (value === 'plus' || value === 'minus')) {
      row.direction = value;
    }
    adjustments.set(key, row);
    updateAdjustmentRow(key);
    updateAdjustmentSummary();
  }

  window.stockAdjustmentChange = function(id, field, value) {
    setDraft(id, field, value);
  };

  function directionButton(id, value, label, selected) {
    return `<button type="button" class="smallbtn stock-adjustment-direction-btn${selected ? ' active' : ''}" onclick="stockAdjustmentChange('${esc(id)}','direction','${value}')">${label}</button>`;
  }

  function adjustmentCard(product) {
    const row = draftFor(product.id);
    const current = Number(stockData.currentStockMap[product.id] || 0);
    const projected = current + signed(row);
    return `<div class="stock-row stock-adjustment-row" id="stock-adjustment-row-${esc(product.id)}">
      <div class="prod-info">
        <div class="prod-name flavor-badge">${esc(product.product_name)}</div>
        <div class="stock-qty stock-adjustment-current">当前库存：<strong>${formatQtyToUnits(current, product.pcs_per_case, product.pcs_per_box, unitOf(product))}</strong> (${current}${esc(unitOf(product))})</div>
        <div class="stock-adjustment-projected">预计库存：<strong>${projected}${esc(unitOf(product))}</strong></div>
      </div>
      <div class="stock-adjustment-controls">
        <div class="stock-adjustment-direction" aria-label="调整方向">
          ${directionButton(product.id, 'plus', '增加', row.direction === 'plus')}
          ${directionButton(product.id, 'minus', '减少', row.direction === 'minus')}
        </div>
        <div class="sell-line stock-adjustment-sell-line">
          <span class="sell-tag" style="background:#756676;">散</span>
          <select class="ios-picker" onchange="stockAdjustmentChange('${esc(product.id)}','qty',this.value)">${makeQtyOptions(100,row.qty)}</select>
          <span class="sell-unit">${esc(unitOf(product))}</span>
        </div>
      </div>
    </div>`;
  }

  function selectedHtml() {
    const selected = products
      .map(product => ({ product, row: draftFor(product.id) }))
      .filter(entry => entry.row.qty > 0);
    if (!selected.length) {
      return '<div class="sub stock-adjustment-empty-summary">选择非零散数后将自动加入申请。</div>';
    }
    return `<div class="sub stock-adjustment-selected-summary">已选择商品：${selected.map(({ product, row }) => {
      const projected = Number(stockData.currentStockMap[product.id] || 0) + signed(row);
      return `${esc(product.product_name)} ${row.direction === 'minus' ? '减少' : '增加'} ${row.qty}${esc(unitOf(product))}，预计 ${projected}${esc(unitOf(product))}`;
    }).join('；')}</div>`;
  }

  function updateAdjustmentRow(id) {
    const product = products.find(item => String(item.id) === String(id));
    const node = $(`stock-adjustment-row-${id}`);
    if (product && node) node.outerHTML = adjustmentCard(product);
  }

  function updateAdjustmentSummary() {
    const node = $('stock-adjustment-summary');
    if (node) node.innerHTML = selectedHtml();
  }

  function renderAdjustmentProductArea() {
    const filters = $('stock-adjustment-filters');
    const list = $('stock-adjustment-products');
    if (filters) filters.innerHTML = generateFilterHeaderHtml();
    if (list) list.innerHTML = rows().map(adjustmentCard).join('');
  }

  function requestActionLabel(status) {
    if (status === 'pending_review') return '撤回并修改';
    if (status === 'draft') return '继续修改';
    return '修改并重新提交';
  }

  function historyItemsHtml(items) {
    return (items || []).map(item => {
      const quantity = Number(item.adjustment_qty) || 0;
      const label = StockAdjustmentCore.formatSpecFlavor(item) || item.product_barcode;
      return `<div class="stock-adjustment-history-line" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid #f0ebf1"><span>${esc(label)}</span><strong class="stock-adjustment-history-qty ${quantity > 0 ? 'qty-positive' : 'qty-negative'}" style="font-size:15px;color:${quantity > 0 ? '#16a34a' : '#dc2626'}">${quantity > 0 ? '+' : ''}${quantity}</strong></div>`;
    }).join('');
  }

  function requestBlock(title, list, editable, openByDefault, history) {
    return `<details class="stock-adjustment-request-group"${openByDefault && list.length ? ' open' : ''}>
      <summary>${title}<span>${list.length}</span></summary>
      <div class="stock-adjustment-request-list">
        ${list.map(entry => `<div class="item stock-adjustment-request-item">
          <b>${esc(entry.request.request_no)} · ${esc(StockAdjustmentCore.statusLabel(entry.request.status))}</b>
          ${history ? `<div class="stock-adjustment-history-items">${historyItemsHtml(entry.items)}</div>` : `<div class="sub">${(entry.items || []).map(item => `${esc(StockAdjustmentCore.formatSpecFlavor(item) || item.product_barcode)} ${Number(item.adjustment_qty) > 0 ? '增加' : '减少'} ${Math.abs(Number(item.adjustment_qty))}`).join('；')}${entry.request.rejection_reason ? `；驳回：${esc(entry.request.rejection_reason)}` : ''}</div>`}
          ${editable ? `<button class="smallbtn" onclick="editStockAdjustmentRequest('${esc(entry.request.id)}')">${requestActionLabel(entry.request.status)}</button>` : ''}
        </div>`).join('') || '<div class="sub stock-adjustment-request-empty">暂无记录</div>'}
      </div>
    </details>`;
  }

  function requestPanels(data) {
    const entries = Array.isArray(data) ? data : [];
    const byStatus = status => entries.filter(entry => entry.request.status === status);
    return requestBlock('待审核申请', byStatus('pending_review'), true, true)
      + requestBlock('已驳回申请', byStatus('rejected'), true, true)
      + requestBlock('未提交草稿', byStatus('draft'), true, false)
      + requestBlock('历史记录', byStatus('approved'), false, false, true)
      + requestBlock('已撤回申请', byStatus('withdrawn'), true, false);
  }

  async function loadPanels() {
    try {
      return requestPanels(await stockAdjustmentApi.mine(currentEmployee.code, true));
    } catch (error) {
      return `<div class="sub stock-adjustment-panel-error">${esc(error.message || '申请记录加载失败')}</div>`;
    }
  }

  function updateRequestPanels(html) {
    requestPanelsHtml = html;
    const node = $('stock-adjustment-request-panels');
    if (node) node.innerHTML = html;
  }

  async function refreshRequestPanels() {
    const html = await loadPanels();
    if (adjustmentMode) updateRequestPanels(html);
  }

  function buildSubmissionItems() {
    return [...adjustments.entries()]
      .map(([product_barcode, row]) => ({ product_barcode, adjustment_qty: signed(row) }))
      .filter(item => item.adjustment_qty !== 0);
  }

  function validateSubmissionItems(items) {
    if (!items.length) {
      alert('请选择至少一个非零散数');
      return false;
    }
    if (items.some(item => !Number.isSafeInteger(item.adjustment_qty))) {
      alert('散数必须是非负整数');
      return false;
    }
    return true;
  }

  function submitDialogHtml() {
    return `<div id="stockAdjustmentSubmitMask" class="stock-adjustment-submit-mask hide" onclick="stockAdjustmentSubmitMaskClick(event)">
      <div class="stock-adjustment-submit-sheet" role="dialog" aria-modal="true" aria-labelledby="stockAdjustmentSubmitTitle">
        <div class="stock-adjustment-submit-head">
          <div id="stockAdjustmentSubmitTitle">提交库存修改</div>
          <button type="button" class="stock-adjustment-submit-close" onclick="closeStockAdjustmentSubmitDialog()">×</button>
        </div>
        <label class="stock-adjustment-form-field">
          <span>修改原因</span>
          <select id="adjustReason" class="ios-picker stock-adjustment-reason-select" onchange="toggleStockAdjustmentReasonNote()">
            <option value="inventory_count">盘点差异</option>
            <option value="damage">破损报废</option>
            <option value="transfer">调货</option>
            <option value="other">其他</option>
          </select>
        </label>
        <label id="adjustReasonNoteField" class="stock-adjustment-form-field hide">
          <span>原因说明</span>
          <input id="adjustReasonNote" class="ios-picker stock-adjustment-text-input" placeholder="请填写具体原因">
        </label>
        <label class="stock-adjustment-form-field">
          <span>备注</span>
          <input id="adjustRemark" class="ios-picker stock-adjustment-text-input" placeholder="可选">
        </label>
        <div class="stock-adjustment-submit-actions">
          <button type="button" class="smallbtn" onclick="closeStockAdjustmentSubmitDialog()">取消</button>
          <button id="stockAdjustmentConfirmSubmit" type="button" class="smallbtn active" onclick="confirmStockAdjustmentSubmit()">确认提交</button>
        </div>
      </div>
    </div>`;
  }

  function presetSubmitDialog() {
    const allowed = ['inventory_count', 'damage', 'transfer', 'other'];
    let reason = failedSubmissionMeta?.reason || editMeta?.reason_code || 'inventory_count';
    let note = failedSubmissionMeta?.note ?? editMeta?.reason_note ?? '';
    if (!allowed.includes(reason)) {
      note = note || StockAdjustmentCore.reasonLabel(reason) || '';
      reason = 'other';
    }
    $('adjustReason').value = reason;
    $('adjustReasonNote').value = note;
    $('adjustRemark').value = failedSubmissionMeta?.remark ?? editMeta?.remark ?? '';
    window.toggleStockAdjustmentReasonNote();
  }

  window.toggleStockAdjustmentReasonNote = function() {
    const field = $('adjustReasonNoteField');
    if (field) field.classList.toggle('hide', $('adjustReason')?.value !== 'other');
  };

  window.stockAdjustmentSubmitMaskClick = function(event) {
    if (event.target?.id === 'stockAdjustmentSubmitMask') {
      window.closeStockAdjustmentSubmitDialog();
    }
  };

  window.openStockAdjustmentSubmitDialog = function() {
    const items = buildSubmissionItems();
    if (!validateSubmissionItems(items)) return;
    presetSubmitDialog();
    $('stockAdjustmentSubmitMask')?.classList.remove('hide');
    document.body.classList.add('stock-adjustment-submit-open');
  };

  window.closeStockAdjustmentSubmitDialog = function() {
    $('stockAdjustmentSubmitMask')?.classList.add('hide');
    document.body.classList.remove('stock-adjustment-submit-open');
  };

  window.openStockAdjustmentMode = async function() {
    adjustmentMode = true;
    STATE = 'STOCK_ADJUST';
    clearEditState();
    requestPanelsHtml = '<div class="sub stock-adjustment-panel-loading">正在加载申请记录...</div>';
    window.renderStockAdjustmentMode();
    await refreshRequestPanels();
  };

  window.closeStockAdjustmentMode = function() {
    adjustmentMode = false;
    clearEditState();
    window.closeStockAdjustmentSubmitDialog();
    setBaseBackVisible(true);
    STATE = 'STOCK';
    renderStockPage();
  };

  window.renderStockAdjustmentMode = function() {
    if (!adjustmentMode) return;
    const list = $('list');
    if (!list) return;
    list.innerHTML = `<div class="top-action-bar"><div class="back-btn" onclick="closeStockAdjustmentMode()">返回库存查看</div></div>
      <div class="big-store-title">申请修改库存</div>
      <div id="stock-adjustment-request-panels" class="stock-adjustment-panels">${requestPanelsHtml}</div>
      <div class="sub stock-adjustment-help">只调整散数；增加为正数、减少为负数，允许预计库存为负数。</div>
      <div id="stock-adjustment-filters"></div>
      <div id="stock-adjustment-products"></div>
      <div id="stock-adjustment-summary">${selectedHtml()}</div>
      <button id="stockAdjustmentSubmit" class="float-submit" onclick="openStockAdjustmentSubmitDialog()">保存并提交审核</button>
      ${submitDialogHtml()}`;
    setBaseBackVisible(false);
    renderAdjustmentProductArea();
  };

  window.editStockAdjustmentRequest = async function(id) {
    try {
      const data = await stockAdjustmentApi.mine(currentEmployee.code, true);
      const entry = (Array.isArray(data) ? data : []).find(item => item.request.id === id);
      if (!entry) throw new Error('未找到库存调整申请');
      if (entry.request.status === 'pending_review') {
        await stockAdjustmentApi.withdraw(id, currentEmployee.code);
      }
      adjustmentMode = true;
      STATE = 'STOCK_ADJUST';
      editingRequestId = id;
      editMeta = entry.request;
      adjustments.clear();
      (entry.items || []).forEach(item => adjustments.set(String(item.product_barcode), {
        direction: Number(item.adjustment_qty) < 0 ? 'minus' : 'plus',
        qty: Math.abs(Number(item.adjustment_qty)),
      }));
      requestPanelsHtml = '<div class="sub stock-adjustment-panel-loading">正在加载申请记录...</div>';
      window.renderStockAdjustmentMode();
      await refreshRequestPanels();
    } catch (error) {
      alert(error.message || '打开申请失败');
    }
  };

  window.confirmStockAdjustmentSubmit = async function() {
    const items = buildSubmissionItems();
    if (!validateSubmissionItems(items)) return;
    const reason = $('adjustReason').value;
    const note = $('adjustReasonNote').value;
    const remark = $('adjustRemark').value;
    if (reason === 'other' && !note.trim()) {
      alert('选择其他时必须填写说明');
      return;
    }

    const confirmButton = $('stockAdjustmentConfirmSubmit');
    const submitButton = $('stockAdjustmentSubmit');
    try {
      if (confirmButton) {
        confirmButton.disabled = true;
        confirmButton.textContent = '正在提交...';
      }
      if (submitButton) submitButton.disabled = true;
      await stockAdjustmentApi.saveAndSubmit(
        editingRequestId,
        currentEmployee.code,
        reason,
        note,
        remark,
        items,
      );
      window.closeStockAdjustmentSubmitDialog();
      alert('申请已提交审核');
      window.closeStockAdjustmentMode();
    } catch (error) {
      failedSubmissionMeta = { reason, note, remark };
      alert(error.message || '提交失败');
      if (confirmButton) {
        confirmButton.disabled = false;
        confirmButton.textContent = '确认提交';
      }
      if (submitButton) submitButton.disabled = false;
    }
  };

  window.submitStockAdjustmentRequest = window.openStockAdjustmentSubmitDialog;

  const oldRenderStockPage = window.renderStockPage;
  window.renderStockPage = function() {
    oldRenderStockPage();
    if (!adjustmentMode) {
      setBaseBackVisible(true);
      const title = $('list').querySelector('.sub');
      if (title) {
        title.insertAdjacentHTML('afterend', '<button class="smallbtn" style="margin:8px 0;" onclick="openStockAdjustmentMode()">申请修改库存</button>');
      }
    }
  };
})();
