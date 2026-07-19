(function(){
  function detailMoney(value){
    return typeof money === 'function' ? money(value) : Number(value || 0).toFixed(2);
  }

  function isMixSaleUnit(unit){
    return String(unit || '').trim() === '拼盒';
  }

  function isWholeSaleUnit(unit){
    return String(unit || '').trim() === '整';
  }

  function addPriceGroup(map, qty, price){
    const q = Number(qty) || 0;
    if(!q) return;
    const p = Number(price) || 0;
    const key = p.toFixed(4);
    const prev = map.get(key) || { qty:0, price:p };
    prev.qty += q;
    map.set(key, prev);
  }

  function formatQtyNumber(value){
    const n = Number(value) || 0;
    if(Number.isInteger(n)) return String(n);
    return Number(n.toFixed(2)).toString();
  }

  function priceGroupParts(map, unitText){
    if(!(map instanceof Map) || !map.size) return [];
    return Array.from(map.values()).map(group=>`${formatQtyNumber(group.qty)}${unitText} × ${detailMoney(group.price)}`);
  }

  function qtySum(map){
    if(!(map instanceof Map) || !map.size) return 0;
    return Array.from(map.values()).reduce((sum, group)=>sum + Number(group.qty || 0), 0);
  }

  function flavorQtyText(row){
    const looseLikeQty = Number(row.looseQty || 0) + qtySum(row.mixLooseGroups);
    const wholeQty = Number(row.wholeQty || 0);
    const parts = [];
    if(wholeQty) parts.push(`${formatQtyNumber(wholeQty)}整`);
    if(looseLikeQty) parts.push(formatQtyNumber(looseLikeQty));
    return parts.length ? `x${parts.join('+')}` : '';
  }

  orderDetailPartsText = function(r){
    const parts = [];
    if(r.looseQty) parts.push(`${formatQtyNumber(r.looseQty)}散 × ${detailMoney(r.loosePrice)}`);
    if(r.wholeQty) parts.push(`${formatQtyNumber(r.wholeQty)}整 × ${detailMoney(r.wholePrice)}`);
    parts.push(...priceGroupParts(r.mixBoxGroups, '盒'));
    return parts.join(' + ') || '-';
  };

  orderDetailFlavorHtml = function(r){
    if(!(r.flavorRows instanceof Map) || !r.flavorRows.size) return '';
    return `<div class="order-detail-flavors order-detail-flavors-compact">${Array.from(r.flavorRows.values()).map(f=>`<div class="order-detail-flavor order-detail-flavor-compact"><span>${esc(f.flavor)}<b>${esc(flavorQtyText(f))}</b></span></div>`).join('')}</div>`;
  };

  aggregateDetailItems = function(items){
    const m = new Map();
    (items || []).forEach(it=>{
      const bc = String(it.barcode || '');
      const p = products.find(x=>String(x.id)===bc) || products.find(x=>String(x.barcode)===bc) || {id:bc,barcode:bc,product_name:bc,unit:'个',pcs_per_case:1,pcs_per_box:0,spec:'',flavor:''};
      const key = orderDetailGroupKey(p,it);
      const flavor = orderDetailFlavorLabel(p,it);
      if(!m.has(key)){
        m.set(key,{
          barcode:bc,
          barcodes:new Set(),
          product:p,
          product_name:orderDetailSpecLabel(p,it),
          flavorRows:new Map(),
          wholeQty:0,
          wholePrice:0,
          looseQty:0,
          loosePrice:0,
          mixBoxGroups:new Map(),
          amount:0,
          stockQty:0
        });
      }
      const r = m.get(key);
      r.barcodes.add(bc);
      if(!r.flavorRows.has(flavor)){
        r.flavorRows.set(flavor,{
          flavor,
          wholeQty:0,
          wholePrice:0,
          looseQty:0,
          loosePrice:0,
          mixLooseGroups:new Map(),
          amount:0
        });
      }
      const f = r.flavorRows.get(flavor);
      const su = String(it.sale_unit || '散').trim();
      const sq = Number(it.sale_qty ?? it.qty ?? 0) || 0;
      const amount = Number(it.amount || 0) || 0;
      const saleUnitPrice = Number(it.sale_unit_price ?? it.unit_price ?? 0) || 0;
      const unitPrice = Number(it.unit_price ?? saleUnitPrice) || 0;

      if(isWholeSaleUnit(su)){
        r.wholeQty += sq;
        r.wholePrice = saleUnitPrice || unitPrice;
        f.wholeQty += sq;
        f.wholePrice = saleUnitPrice || unitPrice;
      }else if(isMixSaleUnit(su)){
        const boxSize = Number(p.pcs_per_box || 0) || 0;
        const boxQty = saleUnitPrice > 0 ? amount / saleUnitPrice : (boxSize > 0 ? sq / boxSize : 0);
        const loosePrice = sq > 0 ? amount / sq : (boxSize > 0 ? saleUnitPrice / boxSize : unitPrice);
        addPriceGroup(r.mixBoxGroups, boxQty, saleUnitPrice || amount);
        addPriceGroup(f.mixLooseGroups, sq, loosePrice);
      }else{
        r.looseQty += sq;
        r.loosePrice = saleUnitPrice || unitPrice;
        f.looseQty += sq;
        f.loosePrice = saleUnitPrice || unitPrice;
      }
      r.amount += amount;
      f.amount += amount;
      r.stockQty += Number(it.qty || 0) || 0;
    });
    return Array.from(m.values()).map(r=>({...r,barcodes:Array.from(r.barcodes)}));
  };

  function injectDetailActionStyles(){
    if(document.getElementById('spr-order-detail-action-style')) return;
    const style = document.createElement('style');
    style.id = 'spr-order-detail-action-style';
    style.textContent = `
      .detail-action-row{gap:9px!important;margin:10px 0 14px!important;}
      .detail-summary-actions{display:block!important;}
      .detail-summary-actions .detail-amount-banner{width:100%!important;margin:0!important;}
      .detail-action-row button{height:30px!important;border-radius:4px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-size:12px!important;font-weight:800!important;line-height:1!important;box-shadow:none!important;white-space:nowrap!important;}
      .detail-secondary-actions{display:flex!important;justify-content:flex-start!important;align-items:center!important;gap:9px!important;flex-wrap:wrap!important;}
      .detail-secondary-actions .detail-action-secondary,.detail-secondary-actions .detail-action-danger{width:auto!important;min-width:70px!important;height:30px!important;padding:0 12px!important;margin:0!important;}
      .detail-secondary-actions .detail-action-secondary{background:#fdf6ec!important;color:#e6a23c!important;border:1px solid #f5dab1!important;}
      .detail-secondary-actions .detail-action-danger{background:#fef0f0!important;color:#f56c6c!important;border:1px solid #fde2e2!important;}
      .detail-secondary-actions .detail-delivery-action{width:auto!important;min-width:82px!important;height:30px!important;padding:0 13px!important;margin:0!important;background:#111!important;color:#fff!important;border:1px solid #111!important;border-radius:4px!important;font-size:12px!important;}
      .history-item-compact .delivery-note-btn-primary,.history-item .delivery-note-btn-primary:not(.detail-delivery-action){background:#111!important;color:#fff!important;border:1px solid #111!important;border-radius:4px!important;box-shadow:none!important;height:30px!important;padding:0 13px!important;min-width:82px!important;font-size:12px!important;}
      .history-item-top span:last-child{background:transparent!important;border:none!important;border-radius:0!important;padding:0!important;color:var(--text-muted)!important;}
      .order-detail-flavors-compact{gap:2px!important;margin:1px 0 5px!important;}
      .order-detail-flavor-compact{display:block!important;font-size:13px!important;line-height:1.55!important;color:var(--primary)!important;}
      .order-detail-flavor-compact span{font-weight:800!important;color:var(--primary)!important;}
      .order-detail-flavor-compact b{font-weight:800!important;color:var(--text-muted)!important;margin-left:3px!important;}
      .report-date-input{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:100%!important;opacity:0!important;pointer-events:auto!important;z-index:8!important;cursor:pointer!important;}
    `;
    document.head.appendChild(style);
  }

  function setButtonText(btn, text){
    if(btn && btn.textContent !== text) btn.textContent = text;
  }

  function removeInlineStyle(btn){
    if(btn && btn.hasAttribute('style')) btn.removeAttribute('style');
  }

  function ensureClass(btn, className){
    if(btn && !btn.classList.contains(className)) btn.classList.add(className);
  }

  function normalizeDetailButtons(){
    if(typeof STATE !== 'undefined' && STATE !== 'DETAIL') return;
    const root = document.getElementById('list');
    if(!root) return;
    const secondary = root.querySelector('.detail-secondary-actions');
    const delivery = root.querySelector('.detail-delivery-action');
    if(delivery){
      setButtonText(delivery, '生成单据');
      removeInlineStyle(delivery);
      if(secondary && delivery.parentElement !== secondary) secondary.appendChild(delivery);
    }
    const edit = Array.from(root.querySelectorAll('.detail-secondary-actions button')).find(btn=>String(btn.getAttribute('onclick') || '').includes('editExistingOrder'));
    if(edit){
      setButtonText(edit, '修改');
      removeInlineStyle(edit);
      ensureClass(edit, 'detail-action-secondary');
    }
    const del = root.querySelector('.detail-secondary-actions .detail-danger-action') || Array.from(root.querySelectorAll('.detail-secondary-actions button')).find(btn=>String(btn.getAttribute('onclick') || '').includes('deleteExistingOrder'));
    if(del){
      setButtonText(del, '删除');
      removeInlineStyle(del);
      ensureClass(del, 'detail-action-danger');
    }
  }

  injectDetailActionStyles();
  document.addEventListener('DOMContentLoaded',()=>{
    normalizeDetailButtons();
    const list = document.getElementById('list');
    if(list) new MutationObserver(normalizeDetailButtons).observe(list,{childList:true,subtree:true});
  });
})();
