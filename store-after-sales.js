(function(){
  const AFTER_SALE_UNIT = '售后';
  const AFTER_SALE_LABEL = '收回';
  const AFTER_SALE_PANEL_LABEL = '收回数';
  const AFTER_SALE_NOTE = '只算能卖的，收回增加库存';
  const AFTER_SALE_STATUS = 'SUCCESS_AFTER_SALE';
  const NORMAL_STATUS = 'SUCCESS';
  const AFTER_SALE_REMARK_PREFIX = 'AFTER_SALES:';
  let pendingEditAfterSaleMap = {};

  function makeAfterSaleOptions(current){
    const cur = normalizeReturnQty(current);
    let html = '';
    for(let i=0;i<=100;i++) html += `<option value="${i}" ${i===cur?'selected':''}>${i}</option>`;
    return html;
  }

  function parseProductIdFromLooseLine(line){
    const qtySelect = line?.querySelector('select.ios-picker:not(.price-picker)');
    const code = qtySelect?.getAttribute('onchange') || '';
    const match = code.match(/changeQty\('([^']+)'\s*,\s*'looseQty'/);
    return match ? match[1] : '';
  }

  function normalizeReturnQty(value){
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function isAfterSaleUnit(unit){
    const text = String(unit || '');
    return text === AFTER_SALE_UNIT || text.includes(AFTER_SALE_UNIT);
  }

  function isAfterSaleItem(item){
    return isAfterSaleUnit(item?.sale_unit);
  }

  function normalSaleItems(items){
    return (items || []).filter(it=>!isAfterSaleItem(it));
  }

  function afterSaleLabelHtml(){
    return '<span style="display:inline-flex;align-items:center;border-radius:999px;background:#fff1f0;color:#f56c6c;border:1px solid #fde2e2;padding:1px 8px;font-weight:800;">有售后</span>';
  }

  function overviewMetaHtml(count, hasAfterSale, unitText='款'){
    return `品项数: ${count || 0} ${unitText}${hasAfterSale ? ' | ' + afterSaleLabelHtml() : ''}`;
  }

  function parseAfterSaleRemark(remark){
    const text = String(remark || '').trim();
    if(!text) return {};
    const raw = text.startsWith(AFTER_SALE_REMARK_PREFIX) ? text.slice(AFTER_SALE_REMARK_PREFIX.length) : text;
    try{
      const obj = JSON.parse(raw);
      const out = {};
      Object.keys(obj || {}).forEach(key=>{
        const qty = normalizeReturnQty(obj[key]);
        if(key && qty > 0) out[String(key)] = qty;
      });
      return out;
    }catch(e){
      return {};
    }
  }

  function buildAfterSaleRemark(map){
    const clean = {};
    Object.keys(map || {}).forEach(key=>{
      const qty = normalizeReturnQty(map[key]);
      if(key && qty > 0) clean[String(key)] = qty;
    });
    return Object.keys(clean).length ? AFTER_SALE_REMARK_PREFIX + JSON.stringify(clean) : null;
  }

  function hasAfterSaleMap(map){
    return Object.keys(map || {}).some(key=>normalizeReturnQty(map[key]) > 0);
  }

  function orderHasAfterSale(order){
    return String(order?.status || '').includes('AFTER_SALE') ||
      String(order?.status || '').includes(AFTER_SALE_UNIT) ||
      hasAfterSaleMap(parseAfterSaleRemark(order?.remark));
  }

  function afterSaleMapFromItems(items){
    const map = {};
    (items || []).forEach(it=>{
      if(!isAfterSaleItem(it)) return;
      const id = String(it.barcode || '');
      const qty = normalizeReturnQty(Math.abs(Number(it.qty || it.sale_qty || 0)));
      if(id && qty > 0) map[id] = (map[id] || 0) + qty;
    });
    return map;
  }

  function mergeAfterSaleMaps(primary, secondary){
    const out = {};
    [primary || {}, secondary || {}].forEach(map=>{
      Object.keys(map).forEach(id=>{
        const qty = normalizeReturnQty(map[id]);
        if(id && qty > 0) out[String(id)] = qty;
      });
    });
    return out;
  }

  function productForAfterSale(barcode){
    const bc = String(barcode || '');
    return products.find(p=>String(p.id)===bc) || products.find(p=>String(p.barcode)===bc) || {id:bc,product_name:bc,unit:'个'};
  }

  function afterSaleDisplayName(barcode){
    const p = productForAfterSale(barcode);
    return productDisplayName(p,barcode);
  }
  function afterSaleDisplayUnit(barcode){
    return unitOf(productForAfterSale(barcode));
  }

  function getAfterSaleQty(id){
    const it = orderData?.items?.[id];
    return normalizeReturnQty(it?.afterSaleQty);
  }

  function setAfterSaleQty(id, qty){
    const it = orderData?.items?.[id];
    if(!it) return;
    it.afterSaleQty = normalizeReturnQty(qty);
    if(typeof saveOrderDraft === 'function') saveOrderDraft();
    syncAfterSaleControls(id);
    if(typeof calculateLiveOrderAmounts === 'function') calculateLiveOrderAmounts();
  }

  function getAfterSaleWraps(id){
    return Array.from(document.querySelectorAll('[data-after-sales-wrap]')).filter(wrap=>wrap.dataset.afterSalesWrap === String(id));
  }

  function getAfterSalePanels(id){
    return Array.from(document.querySelectorAll('[data-after-sales-panel]')).filter(panel=>panel.dataset.afterSalesPanel === String(id));
  }

  function syncAfterSaleControls(id){
    const qty = getAfterSaleQty(id);
    getAfterSaleWraps(id).forEach(wrap=>{
      const btn = wrap.querySelector('[data-after-sales-toggle]');
      if(btn){
        btn.textContent = qty > 0 ? `${AFTER_SALE_LABEL}${qty}` : AFTER_SALE_LABEL;
        btn.classList.toggle('has-value', qty > 0);
      }
      wrap.classList.toggle('has-value', qty > 0);
    });
    getAfterSalePanels(id).forEach(panel=>{
      const picker = panel.querySelector('[data-after-sales-select]');
      if(picker) picker.value = String(qty);
      panel.classList.toggle('has-value', qty > 0);
    });
  }

  function closeOtherPanels(id){
    document.querySelectorAll('[data-after-sales-wrap]').forEach(wrap=>{
      if(wrap.dataset.afterSalesWrap !== String(id)) wrap.classList.remove('open');
    });
    document.querySelectorAll('[data-after-sales-panel]').forEach(panel=>{
      if(panel.dataset.afterSalesPanel !== String(id)) panel.classList.remove('open');
    });
  }

  function toggleAfterSalePanel(id){
    const wrap = getAfterSaleWraps(id)[0];
    const panel = getAfterSalePanels(id)[0];
    if(!wrap || !panel) return;
    const nextOpen = !panel.classList.contains('open');
    closeOtherPanels(id);
    wrap.classList.toggle('open', nextOpen);
    panel.classList.toggle('open', nextOpen);
    syncAfterSaleControls(id);
  }

  function buildAfterSaleInline(id){
    return `<span class="after-sales-wrap" data-after-sales-wrap="${esc(id)}">
      <button type="button" class="after-sales-toggle" data-after-sales-toggle="${esc(id)}">${AFTER_SALE_LABEL}</button>
    </span>`;
  }

  function buildAfterSalePanel(id){
    return `<div class="after-sales-panel" data-after-sales-panel="${esc(id)}">
      <span class="after-sales-panel-label">${AFTER_SALE_PANEL_LABEL}</span>
      <select class="ios-picker after-sales-picker" data-after-sales-select="${esc(id)}">${makeAfterSaleOptions(getAfterSaleQty(id))}</select>
      <span class="after-sales-note">${AFTER_SALE_NOTE}</span>
    </div>`;
  }

  function bindAfterSalesControls(){
    if(STATE !== 'ORDER' || !orderData?.items) return;
    const looseLines = document.querySelectorAll('#list .item .sell-line:not([data-after-sales-bound])');
    looseLines.forEach(line=>{
      const tag = line.querySelector('.sell-tag')?.textContent?.trim();
      if(tag !== '散') return;
      const id = parseProductIdFromLooseLine(line);
      if(!id || !orderData.items[id]) return;
      line.dataset.afterSalesBound = '1';
      line.classList.add('after-sales-line');
      line.closest('.control-group')?.classList.add('after-sales-group');

      line.insertAdjacentHTML('beforeend', buildAfterSaleInline(id));
      line.insertAdjacentHTML('afterend', buildAfterSalePanel(id));
      const wrap = getAfterSaleWraps(id)[0];
      const panel = getAfterSalePanels(id)[0];
      const btn = wrap?.querySelector('[data-after-sales-toggle]');
      const picker = panel?.querySelector('[data-after-sales-select]');
      btn?.addEventListener('click', ()=>toggleAfterSalePanel(id));
      picker?.addEventListener('change', event=>setAfterSaleQty(id, event.target.value));
      syncAfterSaleControls(id);
    });
  }

  function scheduleBind(){
    bindAfterSalesControls();
  }

  function afterSaleQtyForItem(it){
    return normalizeReturnQty(it?.afterSaleQty);
  }

  function applyAfterSaleMapToOrderData(map, subtractFromOldDb){
    if(!orderData?.items) return;
    Object.keys(map || {}).forEach(id=>{
      const qty = normalizeReturnQty(map[id]);
      if(!qty || !orderData.items[id]) return;
      orderData.items[id].afterSaleQty = afterSaleQtyForItem(orderData.items[id]) + qty;
      if(subtractFromOldDb && orderData.oldDbItemsMap){
        orderData.oldDbItemsMap[id] = Number(orderData.oldDbItemsMap[id] || 0) - qty;
      }
    });
  }

  const originalAggregateDetailItems = typeof aggregateDetailItems === 'function' ? aggregateDetailItems : null;
  if(originalAggregateDetailItems){
    aggregateDetailItems = function(items){
      return originalAggregateDetailItems(normalSaleItems(items));
    };
  }

  const originalTemplateEditOrNew = typeof templateEditOrNew === 'function' ? templateEditOrNew : null;
  if(originalTemplateEditOrNew){
    templateEditOrNew = function(orderNo=null, orderDate=null, rawItemsEncoded=null, atom=null, name=null){
      originalTemplateEditOrNew(orderNo, orderDate, rawItemsEncoded, atom, name);
      if(!orderNo || !orderData?.items) return;
      try{
        const items = rawItemsEncoded ? JSON.parse(decodeURIComponent(rawItemsEncoded)) : [];
        const rowMap = afterSaleMapFromItems(items);
        const remarkMap = pendingEditAfterSaleMap || {};
        const rowKeys = new Set(Object.keys(rowMap));
        let restored = false;
        if(hasAfterSaleMap(rowMap)){
          applyAfterSaleMapToOrderData(rowMap, false);
          restored = true;
        }
        const remarkOnly = {};
        Object.keys(remarkMap).forEach(id=>{
          if(!rowKeys.has(id)) remarkOnly[id] = remarkMap[id];
        });
        if(hasAfterSaleMap(remarkOnly)){
          applyAfterSaleMapToOrderData(remarkOnly, true);
          restored = true;
        }
        if(restored) renderOrder();
      }catch(err){
        console.warn('售后数量恢复失败', err);
      }
    };
  }

  const originalEditExistingOrder = typeof editExistingOrder === 'function' ? editExistingOrder : null;
  if(originalEditExistingOrder){
    editExistingOrder = async function(orderNo, orderDate, rawItemsEncoded){
      pendingEditAfterSaleMap = {};
      try{
        const {data} = await client.from('sales_orders').select('remark,status').eq('order_no', orderNo).maybeSingle();
        pendingEditAfterSaleMap = parseAfterSaleRemark(data?.remark);
      }catch(err){
        console.warn('读取售后订单备注失败', err);
      }
      try{
        return originalEditExistingOrder(orderNo, orderDate, rawItemsEncoded);
      }finally{
        pendingEditAfterSaleMap = {};
      }
    };
  }

  viewOrderDetail = async function(orderNo,orderDate,fromReport=false){
    STATE='DETAIL';
    document.getElementById('list').setAttribute('data-from-report',fromReport?'true':'false');
    document.getElementById('list').innerHTML=loadingHtml();
    const [{data:itemsData,error:itemError},{data:orderRow,error:orderError}] = await Promise.all([
      client.from('sales_order_items').select('*').eq('order_no',orderNo),
      client.from('sales_orders').select('remark,status').eq('order_no',orderNo).maybeSingle()
    ]);
    if(itemError || orderError){
      document.getElementById('list').innerHTML=`<div style="color:red;padding:20px;">❌ 订单详情加载失败: ${esc(itemError?.message || orderError?.message || '请重试')}</div>`;
      return;
    }
    const items=itemsData||[];
    const normalItems=normalSaleItems(items);
    const rows=aggregateDetailItems(normalItems);
    const afterSaleMap=mergeAfterSaleMaps(parseAfterSaleRemark(orderRow?.remark), afterSaleMapFromItems(items));
    const raw=encodeURIComponent(JSON.stringify(normalItems));
    const sum=rows.reduce((subtotal,row)=>subtotal+row.amount,0);
    const remainingAfterSale={...afterSaleMap};
    const normalRowsHtml=rows.map(r=>{
      const rowBarcodes=Array.isArray(r.barcodes)&&r.barcodes.length?r.barcodes:[r.barcode];
      const afterQty=rowBarcodes.reduce((total,bc)=>total+normalizeReturnQty(afterSaleMap[bc]),0);
      rowBarcodes.forEach(bc=>delete remainingAfterSale[bc]);
      const unit=afterSaleDisplayUnit(rowBarcodes[0]);
      const afterHtml=afterQty>0?`<div class="order-detail-line order-detail-line-danger">售后：<strong>${afterQty}${esc(unit)}</strong></div>`:'';
      return detailRowHtml(r,afterHtml);
    }).join('');
    const afterOnlyRows=Object.keys(remainingAfterSale).filter(id=>normalizeReturnQty(remainingAfterSale[id])>0);
    const afterOnlyHtml=afterOnlyRows.map(id=>`<div class="order-detail-row order-detail-row-danger"><div class="order-detail-title order-detail-title-danger">${esc(afterSaleDisplayName(id))}</div><div class="order-detail-lines"><div class="order-detail-line order-detail-line-danger">售后：<strong>${normalizeReturnQty(remainingAfterSale[id])}${esc(afterSaleDisplayUnit(id))}</strong></div></div></div>`).join('');
    const afterBadge=hasAfterSaleMap(afterSaleMap)?`<span style="margin-left:8px;vertical-align:middle;">${afterSaleLabelHtml()}</span>`:'';
    document.getElementById('list').innerHTML=`<div class="big-store-title">${currentStore?esc(currentStore.name):'客户账单'}</div><div class="detail-action-row"><div class="detail-summary-actions"><div class="amount-summary-banner detail-amount-banner"><span style="font-size:16px;color:var(--primary);"><strong>实收：${money(sum)}</strong>${afterBadge}</span></div><button class="delivery-note-btn delivery-note-btn-primary detail-delivery-action" type="button" onclick="generateDeliveryNote('${esc(orderNo)}','${orderDate}')">生成单据</button></div><div class="detail-secondary-actions"><button class="smallbtn" style="background:#fdf6ec;color:#e6a23c;" onclick="editExistingOrder('${esc(orderNo)}','${orderDate}','${raw}')">✏️ 修改</button><button class="smallbtn detail-danger-action" style="background:#fef0f0;color:#f56c6c;border-color:#fde2e2;" onclick="deleteExistingOrder('${esc(orderNo)}','${raw}')">🗑️ 删除</button></div></div><div class="order-detail-list">${normalRowsHtml}${afterOnlyHtml}</div>`;
  };
  renderHistory = function(){
    STATE='HISTORY';
    const isTemp=String(currentStore.atom).startsWith('NEW_');
    document.getElementById('list').innerHTML=`<div class="big-store-title">${esc(currentStore.name)} ${isTemp?'<span style="font-size:12px;background:#fff1f0;color:#ff4d4f;padding:2px 8px;border-radius:12px;vertical-align:middle;">新门店</span>':''}</div><div style="margin:14px 0;"><button class="btn-new-order" onclick="openOrder('${esc(currentStore.atom)}','${esc(currentStore.name)}')">＋ 新增单据</button></div>${historyOrders.map(o=>{const d=o.created_at?o.created_at.split('T')[0]:'未知日期';const meta=overviewMetaHtml(o.skuCount||0,o.hasAfterSale,'款');return `<div class="history-item history-item-compact" onclick="viewOrderDetail('${esc(o.order_no)}','${d}',false)"><div class="history-item-top"><span style="color:var(--primary);font-size:14px;font-weight:bold;">实收：${money(o.saleSum||0)}</span><span style="color:var(--text-muted);font-size:12px;background:#fff;padding:3px 7px;border-radius:999px;border:1px solid var(--line);">${d}</span></div><div class="history-item-actions"><div class="history-item-meta">${meta}</div><button class="delivery-note-btn delivery-note-btn-primary" type="button" onclick="event.stopPropagation(); generateDeliveryNote('${esc(o.order_no)}','${d}')">生成单据</button></div></div>`}).join('')}`;
  };

  openStoreHistory = async function(atom,name){
    exitStoreSearchMode();
    STATE='HISTORY';
    currentStore={atom,name};
    document.getElementById('alphabetSidebar').classList.add('hide');
    document.getElementById('searchBlock').classList.add('hide');
    document.getElementById('list').innerHTML=loadingHtml();
    const {data:ordersData}=await client.from('sales_orders').select('*').eq('atom_code',atom).order('created_at',{ascending:false});
    historyOrders=ordersData||[];
    if(historyOrders.length){
      const nos=historyOrders.map(o=>o.order_no);
      const {data:itemsData}=await client.from('sales_order_items').select('*').in('order_no',nos);
      const all=itemsData||[];
      historyOrders.forEach(o=>{
        const oi=all.filter(it=>it.order_no===o.order_no);
        const normal=normalSaleItems(oi);
        o.hasAfterSale=orderHasAfterSale(o)||oi.some(isAfterSaleItem);
        o.skuCount=new Set(normal.map(it=>it.barcode)).size;
        o.saleSum=normal.reduce((s,it)=>s+Number(it.amount||0),0);
      });
    }
    renderHistory();
  };

  openSaleReport = async function(preset='today',customDate=''){
    STATE='REPORT';
    orderData=null;
    document.getElementById('alphabetSidebar').classList.add('hide');
    document.getElementById('searchBlock').classList.add('hide');
    selectedReportDate=preset||'today';
    if(selectedReportDate==='custom'&&customDate)selectedReportCustomDate=customDate;
    const range=getReportRange(selectedReportDate);
    renderReportLoading(selectedReportDate);
    try{
      let query=client.from('sales_orders').select('*').eq('employee_code',currentEmployee.code).order('created_at',{ascending:false});
      if(range.start)query=query.gte('created_at',`${range.start}T00:00:00`).lte('created_at',`${range.end}T23:59:59`);
      const {data:orders}=await query;
      if(!orders?.length){renderReportHtml(selectedReportDate,0,[]);return;}
      const nos=orders.map(o=>o.order_no),{data:items}=await client.from('sales_order_items').select('*').in('order_no',nos);
      let total=0;
      const map={};
      orders.forEach(o=>{
        const d=o.created_at?o.created_at.split('T')[0]:'-';
        map[o.order_no]={orderNo:o.order_no,orderDate:d,atomCode:o.atom_code,storeName:o.store_name||`(${o.atom_code})`,netRevenue:0,skuCount:0,skuSet:new Set(),hasAfterSale:orderHasAfterSale(o)};
      });
      (items||[]).forEach(it=>{
        const row=map[it.order_no];
        if(!row) return;
        if(isAfterSaleItem(it)){
          row.hasAfterSale=true;
          return;
        }
        total+=Number(it.amount||0);
        row.netRevenue+=Number(it.amount||0);
        if(it.barcode) row.skuSet.add(String(it.barcode));
      });
      const rows=Object.values(map).map(r=>{r.skuCount=r.skuSet.size;delete r.skuSet;return r;});
      renderReportHtml(selectedReportDate,total,rows);
    }catch(e){
      document.getElementById('reportRows')?.insertAdjacentHTML('afterbegin',`<div style="color:red;padding:20px;">❌ 加载数据失败: ${e.message}</div>`);
    }
  };

  renderReportHtml = function(preset,netSum,rows){
    document.getElementById('list').innerHTML=`<div class="big-store-title">📈 卖进数据</div>${reportFilterHtml(preset)}<div id="reportSummary" class="amount-summary-banner"><span><strong>总实收：${money(netSum)}</strong></span></div><div id="reportRows">${rows.length===0?`<div class="sub" style="text-align:center;padding:40px;color:#aaa;">⚠️ 暂无报表记录</div>`:rows.map(r=>`<div class="history-item" style="cursor:pointer;border-left:4px solid var(--primary);padding:14px;margin-bottom:10px;" onclick="triggerReportDetailView('${esc(r.atomCode)}','${esc(r.storeName)}','${esc(r.orderNo)}','${esc(r.orderDate)}')"><div style="width:100%;display:flex;justify-content:space-between;align-items:center;"><strong style="font-size:15px;color:var(--primary);">${esc(r.storeName)}</strong><span style="color:var(--text-muted);font-size:12px;background:#f4f2f5;padding:2px 6px;border-radius:4px;">${r.orderDate}</span></div><div style="font-size:12px;color:var(--text-muted);margin-top:6px;display:flex;justify-content:space-between;width:100%;"><span>${overviewMetaHtml(r.skuCount||0,r.hasAfterSale,'种')}</span><span style="color:#2b1d2c;font-weight:700;font-size:13px;"><strong>实收：${money(r.netRevenue)}</strong></span></div></div>`).join('')}</div>`;
  };

  const originalDeleteExistingOrder = typeof deleteExistingOrder === 'function' ? deleteExistingOrder : null;
  if(originalDeleteExistingOrder){
    deleteExistingOrder = async function(orderNo,rawItemsEncoded){
      if(!confirm('确定删除本笔记录？'))return;
      document.getElementById('list').innerHTML=loadingHtml();
      try{
        const items=JSON.parse(decodeURIComponent(rawItemsEncoded));
        const {data:orderRow}=await client.from('sales_orders').select('remark,status').eq('order_no',orderNo).maybeSingle();
        const remarkMap=parseAfterSaleRemark(orderRow?.remark);
        const itemAfterSaleMap=afterSaleMapFromItems(items);
        const ret={};
        normalSaleItems(items).forEach(it=>ret[it.barcode]=(ret[it.barcode]||0)+Number(it.qty||0));
        Object.keys(itemAfterSaleMap).forEach(id=>ret[id]=(ret[id]||0)-Number(itemAfterSaleMap[id]||0));
        Object.keys(remarkMap).forEach(id=>{
          if(itemAfterSaleMap[id]) return;
          ret[id]=(ret[id]||0)-Number(remarkMap[id]||0);
        });
        const {data}=await client.from('van_stocks').select('*').eq('employee_code',currentEmployee.code),live={};
        (data||[]).forEach(st=>live[st.product_barcode]=Number(st.qty)||0);
        const updates=Object.keys(ret).filter(bc=>Number(ret[bc]||0)!==0).map(bc=>({employee_code:currentEmployee.code,product_barcode:bc,qty:Number(live[bc]||0)+Number(ret[bc]||0)}));
        await client.from('sales_order_items').delete().eq('order_no',orderNo);
        await client.from('sales_orders').delete().eq('order_no',orderNo);
        if(updates.length)await client.from('van_stocks').upsert(updates,{onConflict:'employee_code,product_barcode'});
        document.getElementById('list').getAttribute('data-from-report')==='true'?openSaleReport(selectedReportDate):openStoreHistory(currentStore.atom,currentStore.name);
      }catch(err){
        console.error(err);
        alert('❌ 删除失败，请重试');
        openStoreHistory(currentStore.atom,currentStore.name);
      }
    };
  }

  submitOrder = async function(){
    let grand = 0;
    Object.keys(orderData.items).forEach(id=>{
      const p = products.find(x=>x.id==id);
      if(p) grand += stockQtyFromItem(p,orderData.items[id]) + afterSaleQtyForItem(orderData.items[id]);
    });
    if(grand === 0){
      alert('⚠️ 空白单据无法提交！');
      return;
    }
    const btn = document.querySelector('.float-submit');
    if(btn){btn.disabled=true;btn.innerText=LOADING_TEXT}
    try{
      const mixError = validateMixBoxGroups();
      if(mixError) throw new Error(mixError);
      let finalOrderNo = orderData.order_no;
      if(isNewStoreFlow && !finalOrderNo){
        await client.from('employee_store_assets').insert({employee_code:String(currentEmployee.code),atom_code:String(orderData.atom),store_name:String(orderData.name)});
        stores.push({atom_code:orderData.atom,store_name:orderData.name});
        stores.sort((a,b)=>a.store_name.localeCompare(b.store_name,'zh-CN'));
        isNewStoreFlow=false;
      }
      const {data:currentStocks} = await client.from('van_stocks').select('*').eq('employee_code',currentEmployee.code);
      const live = {};
      (currentStocks||[]).forEach(st=>live[st.product_barcode]=Number(st.qty)||0);
      const stockUpdates = [], itemsPayload = [], afterSaleMap = {};
      let total = 0;
      for(const id of Object.keys(orderData.items)){
        const p = products.find(x=>x.id==id);
        if(!p) continue;
        const it = orderData.items[id];
        const saleStockQty = stockQtyFromItem(p,it);
        const returnQty = afterSaleQtyForItem(it);
        const netStockOut = saleStockQty - returnQty;
        const oldDb = Number(orderData.oldDbItemsMap?.[id] || 0);
        const delta = netStockOut - oldDb;
        if(delta !== 0 || saleStockQty > 0 || returnQty > 0){
          stockUpdates.push({product_barcode:String(id),qty:Number(live[id]||0)-delta});
        }
        if(Number(it.wholeQty||0)>0){
          const qty=Number(it.wholeQty),price=Number(it.wholePrice||0),amount=qty*price;
          total+=amount;
          itemsPayload.push({barcode:String(id),product_name:String(p.product_name),qty:Number(qty*packSize(p)),unit_price:price,amount:Number(amount.toFixed(2)),sale_unit:'整',sale_qty:qty,sale_unit_price:price});
        }
        if(Number(it.looseQty||0)>0){
          const qty=Number(it.looseQty),price=Number(it.loosePrice||0),amount=qty*price;
          total+=amount;
          itemsPayload.push({barcode:String(id),product_name:String(p.product_name),qty:Number(qty),unit_price:price,amount:Number(amount.toFixed(2)),sale_unit:'散',sale_qty:qty,sale_unit_price:price});
        }
        if(returnQty > 0){
          afterSaleMap[String(id)] = returnQty;
        }
      }
      const mixPayload = buildMixBoxPayloads();
      total += mixPayload.total;
      itemsPayload.push(...mixPayload.items);
      if(!finalOrderNo) finalOrderNo='SO'+Date.now()+Math.floor(Math.random()*1000);
      const {error} = await client.rpc('submit_sales_order_v2',{
        p_order_no:String(finalOrderNo),
        p_employee_code:String(currentEmployee.code),
        p_atom_code:String(orderData.atom),
        p_store_name:String(orderData.name),
        p_total_amount:Number(total.toFixed(2)),
        p_items:itemsPayload,
        p_stock_updates:stockUpdates
      });
      if(error) throw new Error(error.message);
      const hasAfterSale = hasAfterSaleMap(afterSaleMap);
      const {error:dateError} = await client.from('sales_orders').update({
        created_at:orderDateToCreatedAt(orderData.date),
        status:hasAfterSale ? AFTER_SALE_STATUS : NORMAL_STATUS,
        remark:buildAfterSaleRemark(afterSaleMap)
      }).eq('order_no',String(finalOrderNo));
      if(dateError) throw new Error(dateError.message);
      alert('✅ 开单成功');
      if(typeof clearOrderDraft === 'function') clearOrderDraft(finalOrderNo);
      orderData=null;
      openStoreHistory(currentStore.atom,currentStore.name);
    }catch(err){
      console.error(err);
      alert(`❌ 账单保存失败: ${err.message||'网络错误'}`);
      if(btn){btn.disabled=false;btn.innerText='提交账单'}
    }
  };

  document.addEventListener('DOMContentLoaded', ()=>{
    scheduleBind();
    const list = document.getElementById('list');
    if(list) new MutationObserver(scheduleBind).observe(list,{childList:true,subtree:true});
  });
})();
