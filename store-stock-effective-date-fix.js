(function(){
  const STOCK_EFFECTIVE_FROM_DATE = '2026-07-01';
  const AFTER_SALE_REMARK_PREFIX = 'AFTER_SALES:';
  const AFTER_SALE_UNIT = '售后';

  function dateOnly(value){
    const text = String(value || '').trim();
    if(!text) return '';
    return text.slice(0, 10);
  }

  function isStockEffectiveDate(value){
    const d = dateOnly(value);
    return !d || d >= STOCK_EFFECTIVE_FROM_DATE;
  }

  function normalizeReturnQty(value){
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function isAfterSaleItem(item){
    return String(item?.sale_unit || '').includes(AFTER_SALE_UNIT);
  }

  function normalSaleItems(items){
    return (items || []).filter(it=>!isAfterSaleItem(it));
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

  if(typeof editExistingOrder === 'function'){
    const originalEditExistingOrder = editExistingOrder;
    editExistingOrder = async function(orderNo, orderDate, rawItemsEncoded){
      const result = await originalEditExistingOrder(orderNo, orderDate, rawItemsEncoded);
      try{
        if(typeof orderData !== 'undefined' && orderData){
          orderData.__stockWasEffective = isStockEffectiveDate(orderDate);
        }
      }catch(e){
        console.warn('记录原订单库存起算状态失败', e);
      }
      return result;
    };
  }

  if(typeof client !== 'undefined' && client?.rpc){
    const originalRpc = client.rpc.bind(client);
    client.rpc = function(name, args, options){
      if(name === 'submit_sales_order_v2' && args && typeof orderData !== 'undefined' && orderData){
        const nextArgs = {...args};
        const newEffective = isStockEffectiveDate(orderData.date);
        if(!newEffective){
          nextArgs.p_stock_updates = [];
        }else if(orderData.order_no && orderData.__stockWasEffective === false && orderData.oldDbItemsMap && Array.isArray(nextArgs.p_stock_updates)){
          nextArgs.p_stock_updates = nextArgs.p_stock_updates.map(row=>{
            const barcode = String(row.product_barcode || '');
            const oldDb = Number(orderData.oldDbItemsMap?.[barcode] || 0);
            return oldDb ? {...row, qty:Number(row.qty || 0) - oldDb} : row;
          });
        }
        return originalRpc(name, nextArgs, options);
      }
      return originalRpc(name, args, options);
    };
  }

  if(typeof deleteExistingOrder === 'function'){
    deleteExistingOrder = async function(orderNo, rawItemsEncoded){
      if(!confirm('确定删除本笔记录？')) return;
      document.getElementById('list').innerHTML = loadingHtml();
      try{
        const items = JSON.parse(decodeURIComponent(rawItemsEncoded));
        const {data:orderRow} = await client.from('sales_orders').select('remark,status,created_at').eq('order_no', orderNo).maybeSingle();
        const stockEffective = isStockEffectiveDate(orderRow?.created_at);
        let updates = [];
        if(stockEffective){
          const remarkMap = parseAfterSaleRemark(orderRow?.remark);
          const itemAfterSaleMap = afterSaleMapFromItems(items);
          const ret = {};
          normalSaleItems(items).forEach(it=>ret[it.barcode]=(ret[it.barcode]||0)+Number(it.qty||0));
          Object.keys(itemAfterSaleMap).forEach(id=>ret[id]=(ret[id]||0)-Number(itemAfterSaleMap[id]||0));
          Object.keys(remarkMap).forEach(id=>{
            if(itemAfterSaleMap[id]) return;
            ret[id]=(ret[id]||0)-Number(remarkMap[id]||0);
          });
          const {data}=await client.from('van_stocks').select('*').eq('employee_code',currentEmployee.code),live={};
          (data||[]).forEach(st=>live[st.product_barcode]=Number(st.qty)||0);
          updates=Object.keys(ret).filter(bc=>Number(ret[bc]||0)!==0).map(bc=>({employee_code:currentEmployee.code,product_barcode:bc,qty:Number(live[bc]||0)+Number(ret[bc]||0)}));
        }
        await client.from('sales_order_items').delete().eq('order_no',orderNo);
        await client.from('sales_orders').delete().eq('order_no',orderNo);
        if(stockEffective && updates.length) await client.from('van_stocks').upsert(updates,{onConflict:'employee_code,product_barcode'});
        document.getElementById('list').getAttribute('data-from-report')==='true'?openSaleReport(selectedReportDate):openStoreHistory(currentStore.atom,currentStore.name);
      }catch(err){
        console.error(err);
        alert('❌ 删除失败，请重试');
        openStoreHistory(currentStore.atom,currentStore.name);
      }
    };
  }
})();
