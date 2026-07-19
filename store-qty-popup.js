(function(){
  const QUICK_NUMBERS = Array.from({ length: 25 }, (_, i) => i + 1);
  const STATE = {
    select: null,
    trigger: null,
    productId: '',
    key: '',
    handler: '',
    max: 100
  };

  function maxOptionValue(select){
    const options = Array.from(select.options || []);
    return options.reduce((m,opt)=>Math.max(m, Number(opt.value) || 0), 0) || 100;
  }

  function parseQtySelect(select){
    const code = select.getAttribute('onchange') || '';
    const match = code.match(/changeQty\('([^']+)'\s*,\s*'([^']+)'\s*,\s*this\.value\)/);
    if(!match) return null;
    return { id: match[1], key: match[2], handler: 'order', max: maxOptionValue(select) };
  }

  function parseStockAdjustmentSelect(select){
    const code = select.getAttribute('onchange') || '';
    const match = code.match(/stockAdjustmentChange\('([^']+)'\s*,\s*'qty'\s*,\s*this\.value\)/);
    if(!match) return null;
    return { id: match[1], key: 'stockAdjustmentQty', handler: 'stockAdjustment', max: maxOptionValue(select) };
  }

  function parseAfterSaleSelect(select){
    const id = select?.dataset?.afterSalesSelect;
    if(!id) return null;
    return { id, key: 'afterSaleQty', handler: 'afterSale', max: maxOptionValue(select) };
  }

  function parsePopupSelect(select){
    return parseAfterSaleSelect(select) || parseStockAdjustmentSelect(select) || parseQtySelect(select);
  }

  function unitNameForSelect(select){
    return select.closest('.sell-line')?.querySelector('.sell-unit')?.textContent?.trim()
      || select.closest('.after-sales-panel')?.previousElementSibling?.querySelector('.sell-unit')?.textContent?.trim()
      || '';
  }

  function productNameForSelect(select){
    return select.closest('.item, .stock-row')?.querySelector('.prod-name')?.textContent?.trim() || '\u5546\u54c1';
  }

  function labelForKey(key){
    if(key === 'afterSaleQty') return '\u552e\u540e\u6570';
    if(key === 'stockAdjustmentQty') return '\u6563\u6570';
    return key === 'wholeQty' ? '\u6574\u6570' : '\u6563\u6570';
  }

  function normalizeQty(value){
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? String(n) : '0';
  }

  function syncTrigger(trigger, select){
    const val = normalizeQty(select.value);
    trigger.textContent = val;
    trigger.classList.toggle('has-value', Number(val) > 0);
  }

  function ensurePopup(){
    if(document.getElementById('qtyPopupMask')) return;
    const mask = document.createElement('div');
    mask.id = 'qtyPopupMask';
    mask.className = 'qty-popup-mask hide';
    mask.innerHTML = `
      <div class="qty-popup-sheet" role="dialog" aria-modal="true" aria-labelledby="qtyPopupTitle">
        <div class="qty-popup-head">
          <div class="qty-popup-title-wrap">
            <div id="qtyPopupTitle" class="qty-popup-title">\u9009\u62e9\u6570\u91cf</div>
          </div>
          <button type="button" class="qty-popup-close" data-qty-action="close" aria-label="\u5173\u95ed">\u00d7</button>
        </div>
        <div id="qtyPopupCurrent" class="qty-popup-current">\u5f53\u524d\uff1a0</div>
        <div id="qtyPopupGrid" class="qty-popup-grid qty-popup-grid-5"></div>
        <button type="button" class="qty-popup-clear" data-qty-action="clear">\u6e05\u96f6</button>
      </div>`;
    mask.addEventListener('click', handlePopupClick);
    document.addEventListener('keydown', handlePopupKeydown);
    document.body.appendChild(mask);
  }

  function renderGrid(){
    const grid = document.getElementById('qtyPopupGrid');
    if(!grid) return;
    const current = Number(STATE.select?.value || 0);
    grid.innerHTML = QUICK_NUMBERS.map(n=>{
      const disabled = n > STATE.max ? ' disabled' : '';
      const active = n === current ? ' active' : '';
      return `<button type="button" class="qty-popup-number${active}" data-qty-value="${n}"${disabled}>${n}</button>`;
    }).join('');
  }

  function applyQty(value){
    if(!STATE.select) return closePopup();
    const n = Math.max(0, Math.min(STATE.max, parseInt(value, 10) || 0));
    STATE.select.value = String(n);
    if(STATE.handler === 'stockAdjustment' && typeof window.stockAdjustmentChange === 'function'){
      window.stockAdjustmentChange(STATE.productId, 'qty', n);
    }else if(STATE.handler === 'afterSale'){
      STATE.select.dispatchEvent(new Event('change', { bubbles: true }));
    }else if(typeof window.changeQty === 'function'){
      window.changeQty(STATE.productId, STATE.key, n);
    }else{
      STATE.select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if(STATE.trigger) syncTrigger(STATE.trigger, STATE.select);
    closePopup();
  }

  function openPopup(select, trigger, meta){
    ensurePopup();
    STATE.select = select;
    STATE.trigger = trigger;
    STATE.productId = meta.id;
    STATE.key = meta.key;
    STATE.handler = meta.handler || '';
    STATE.max = meta.max;

    const unit = unitNameForSelect(select);
    const title = `${productNameForSelect(select)} - ${labelForKey(meta.key)}`;
    document.getElementById('qtyPopupTitle').textContent = title;
    document.getElementById('qtyPopupCurrent').textContent = `\u5f53\u524d\uff1a${normalizeQty(select.value)}${unit}`;
    renderGrid();

    document.body.classList.add('qty-popup-open');
    document.getElementById('qtyPopupMask').classList.remove('hide');
  }

  function closePopup(){
    document.body.classList.remove('qty-popup-open');
    document.getElementById('qtyPopupMask')?.classList.add('hide');
    STATE.select = null;
    STATE.trigger = null;
    STATE.handler = '';
  }

  function handlePopupClick(event){
    if(event.target.id === 'qtyPopupMask') return closePopup();
    const numberBtn = event.target.closest('[data-qty-value]');
    if(numberBtn) return applyQty(numberBtn.dataset.qtyValue);
    const action = event.target.closest('[data-qty-action]')?.dataset.qtyAction;
    if(action === 'close') return closePopup();
    if(action === 'clear') return applyQty(0);
  }

  function handlePopupKeydown(event){
    if(document.getElementById('qtyPopupMask')?.classList.contains('hide')) return;
    if(event.key === 'Escape'){
      event.preventDefault();
      closePopup();
      return;
    }
    if(event.key === '0'){
      event.preventDefault();
      applyQty(0);
      return;
    }
    if(/^\d$/.test(event.key)){
      event.preventDefault();
      applyQty(event.key);
    }
  }

  function bindQtyPopup(){
    const selects = document.querySelectorAll('#list .sell-line select.ios-picker:not(.price-picker):not([data-qty-popup-bound]), #list .after-sales-panel select.after-sales-picker:not([data-qty-popup-bound])');
    selects.forEach(select=>{
      const meta = parsePopupSelect(select);
      if(!meta) return;
      select.dataset.qtyPopupBound = '1';
      select.classList.add('qty-native-hidden');

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'qty-popup-trigger';
      trigger.setAttribute('aria-label', '\u9009\u62e9\u6570\u91cf');
      trigger.addEventListener('click', ()=>openPopup(select, trigger, meta));
      select.insertAdjacentElement('afterend', trigger);
      syncTrigger(trigger, select);
    });
  }

  function scheduleBind(){
    bindQtyPopup();
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    ensurePopup();
    scheduleBind();
    const list = document.getElementById('list');
    if(list){
      new MutationObserver(scheduleBind).observe(list, { childList: true, subtree: true });
    }
  });
})();

(function(){
  if(typeof window.validateMixBoxGroups !== 'function') return;
  window.validateMixBoxGroups = function(){
    for(const list of mixBoxGroups()){
      const qty = getMixBoxQty(list);
      const size = mixBoxSize(list);
      if(qty > 0 && size > 0 && qty % size !== 0){
        const first = list[0] || {};
        const flavors = [...new Set(list.map(product => String(product.flavor || '').trim()).filter(Boolean))].join('/');
        const productName = [first.spec, flavors].map(value => String(value || '').trim()).filter(Boolean).join(' ') || String(first.id || '\u62fc\u76d2\u5546\u54c1');
        const unit = unitOf(first);
        return `\n${productName}\n\u5df2\u9009${qty}${unit}\uff0c\u5fc5\u987b\u6309${size}\u7684\u500d\u6570\u6574\u76d2\u63d0\u4ea4`;
      }
    }
    return '';
  };
})();
