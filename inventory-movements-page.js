(function() {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
  const stockAdjustmentApi = StockAdjustmentApi.create(client);
  let data = [];
  let currentRange = 'all';
  let customRangeStart = '';
  let customRangeEnd = '';
  let rangeCalendarBase = null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());

  function quantityClass(value) {
    const amount = Number(value);
    if (amount > 0) return 'qty-positive';
    if (amount < 0) return 'qty-negative';
    return 'qty-zero';
  }

  function dateOnlyValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function rangeDisplayValue(start, end) {
    if (!start && !end) return '';
    if (start && !end) return start;
    return `${start} - ${end || start}`;
  }

  function getCustomDateValues() {
    let start = customRangeStart;
    let end = customRangeEnd || customRangeStart;
    if (start && end && end < start) [start, end] = [end, start];
    return { start, end };
  }

  function updateDateRangeText() {
    $('customRangeText').value = rangeDisplayValue(customRangeStart, customRangeEnd || customRangeStart);
  }

  function applyRangeValues() {
    const values = getCustomDateValues();
    $('start').value = currentRange === 'all' ? '2000-01-01' : (values.start || today);
    $('end').value = currentRange === 'all' ? today : (values.end || values.start || today);
  }

  function setRange(range) {
    currentRange = range;
    $('range_all').classList.toggle('active', range === 'all');
    closeDateRangePicker();
    applyRangeValues();
    query();
  }

  function setRangeCalendarBase(date) {
    rangeCalendarBase = new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function openDateRangePicker() {
    currentRange = 'custom';
    $('range_all').classList.remove('active');
    if (!rangeCalendarBase) {
      const base = customRangeStart ? new Date(`${customRangeStart}T00:00:00`) : new Date(`${today}T00:00:00`);
      setRangeCalendarBase(base);
    }
    renderDateRangePanel();
    $('dateRangePanel').classList.remove('hide');
  }

  function closeDateRangePicker() {
    $('dateRangePanel').classList.add('hide');
  }

  function shiftRangeMonth(delta) {
    const base = rangeCalendarBase || new Date(`${today}T00:00:00`);
    setRangeCalendarBase(new Date(base.getFullYear(), base.getMonth() + delta, 1));
    renderDateRangePanel();
  }

  function pickRangeDate(value) {
    if (!customRangeStart || customRangeEnd) {
      customRangeStart = value;
      customRangeEnd = '';
    } else {
      customRangeEnd = value;
      const values = getCustomDateValues();
      customRangeStart = values.start;
      customRangeEnd = values.end;
      updateDateRangeText();
      applyRangeValues();
      closeDateRangePicker();
      query();
      return;
    }
    updateDateRangeText();
    applyRangeValues();
    renderDateRangePanel();
    query();
  }

  function renderMonth(base, offset) {
    const first = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    const year = first.getFullYear();
    const month = first.getMonth();
    const start = new Date(year, month, 1 - first.getDay());
    const selected = getCustomDateValues();
    let html = `<div><div class="range-month-title">${year}-${String(month + 1).padStart(2, '0')}</div><div class="range-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div class="range-days">`;
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const value = dateOnlyValue(date);
      const muted = date.getMonth() !== month;
      const active = value === selected.start || value === selected.end;
      const inRange = selected.start && selected.end && value > selected.start && value < selected.end;
      html += `<button class="range-day ${muted ? 'muted ' : ''}${inRange ? 'in-range ' : ''}${active ? 'active' : ''}" onclick="pickRangeDate('${value}')">${date.getDate()}</button>`;
    }
    return `${html}</div></div>`;
  }

  function renderDateRangePanel() {
    const base = rangeCalendarBase || new Date(`${today}T00:00:00`);
    setRangeCalendarBase(base);
    $('dateRangePanel').innerHTML = `<div class="range-cal-head"><button onclick="shiftRangeMonth(-1)">&lsaquo;</button><span>${rangeDisplayValue(customRangeStart, customRangeEnd || customRangeStart)}</span><button onclick="shiftRangeMonth(1)">&rsaquo;</button></div><div class="range-cal-grid">${renderMonth(rangeCalendarBase, 0)}${renderMonth(rangeCalendarBase, 1)}</div><div class="range-picker-actions"><button onclick="clearDateRange()">清空</button><button onclick="closeDateRangePicker()">关闭</button></div>`;
  }

  function clearDateRange() {
    customRangeStart = '';
    customRangeEnd = '';
    updateDateRangeText();
    renderDateRangePanel();
  }

  function draw() {
    if (!data.length) {
      $('rows').innerHTML = '<tr class="empty-row"><td colspan="11">暂无库存流水</td></tr>';
    } else {
      $('rows').innerHTML = data.map(row => `<tr>
        <td class="cell-nowrap">${esc(row.employee_code)}</td>
        <td class="cell-nowrap">${esc(row.product_barcode)}</td>
        <td>${esc(StockAdjustmentCore.formatSpecFlavor(row))}</td>
        <td>${esc(row.reason_display)}</td>
        <td class="cell-number ${quantityClass(row.quantity_delta)}">${Number(row.quantity_delta) > 0 ? '+' : ''}${Number(row.quantity_delta)}</td>
        <td class="cell-nowrap">${esc(new Date(row.occurred_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))}</td>
        <td class="cell-nowrap">${esc(InventoryMovementExport.TYPE_LABELS[row.movement_type] || row.movement_type)}</td>
        <td class="cell-nowrap">${esc(row.source_no)}</td>
        <td class="cell-number stock-number">${Number(row.quantity_before)}</td>
        <td class="cell-number stock-number">${Number(row.quantity_after)}</td>
        <td class="cell-nowrap">${esc(row.operator_code)}</td>
      </tr>`).join('');
    }
    $('status').className = 'status';
    $('status').textContent = `共 ${data.length} 条`;
    $('tableCount').textContent = `${data.length} 条`;
  }

  async function query() {
    $('status').className = 'status';
    $('status').textContent = '正在查询库存流水...';
    try {
      data = await stockAdjustmentApi.movements($('start').value, $('end').value, $('employee').value, $('type').value);
      if (!Array.isArray(data)) data = [];
      draw();
    } catch (error) {
      console.error(error);
      $('status').className = 'status error';
      $('status').textContent = `查询失败：${error.message || '未知错误'}`;
    }
  }

  async function init() {
    const { data: employees, error } = await client.from('employees').select('employee_code,name').eq('is_active', true).order('employee_code');
    if (error) throw error;
    $('employee').innerHTML += (employees || []).map(employee => `<option value="${esc(employee.employee_code)}">${esc(employee.name)}</option>`).join('');
    $('employee').onchange = query;
    $('type').onchange = query;
    $('refresh').onclick = query;
    $('export').onclick = () => {
      const book = InventoryMovementExport.createWorkbook(XLSX, data);
      XLSX.writeFile(book, InventoryMovementExport.inventoryExportFileName($('start').value, $('end').value));
    };
    applyRangeValues();
    await query();
  }

  window.setRange = setRange;
  window.openDateRangePicker = openDateRangePicker;
  window.closeDateRangePicker = closeDateRangePicker;
  window.shiftRangeMonth = shiftRangeMonth;
  window.pickRangeDate = pickRangeDate;
  window.clearDateRange = clearDateRange;

  init().catch(error => {
    $('status').className = 'status error';
    $('status').textContent = `加载失败：${error.message || '未知错误'}`;
  });
})();
