function formatDeliveryNumber(v){const n=Number(v)||0;return Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}
function amountToChineseUpper(amount){let n=Math.round((Number(amount)||0)*100);if(n===0)return '\u96f6\u5143\u6574';const fraction=['\u89d2','\u5206'],digit=['\u96f6','\u58f9','\u8d30','\u53c1','\u8086','\u4f0d','\u9646','\u67d2','\u634c','\u7396'],unit=[['\u5143','\u4e07','\u4ebf'],['','\u62fe','\u4f70','\u4edf']];let s='';for(let i=0;i<fraction.length;i++){const d=Math.floor(n/Math.pow(10,1-i))%10;if(d)s+=digit[d]+fraction[i]}s=s||'\u6574';n=Math.floor(n/100);for(let i=0;n>0&&i<unit[0].length;i++){let p='';for(let j=0;j<unit[1].length&&n>0;j++){const d=n%10;p=d===0?digit[0]+p:digit[d]+unit[1][j]+p;n=Math.floor(n/10)}p=p.replace(/(\u96f6.)*\u96f6$/,'').replace(/^$/,'\u96f6');s=p+unit[0][i]+s}return s.replace(/\u96f6+/g,'\u96f6').replace(/\u96f6\u5143/,'\u5143').replace(/\u96f6(\u4e07|\u4ebf)/g,'$1').replace(/\u4ebf\u4e07/,'\u4ebf').replace(/^\u5143/,'\u96f6\u5143')}
function getDeliveryProduct(item,productMap){return productMap[String(item.barcode)]||products.find(p=>String(p.id)===String(item.barcode))||{}}
function getDeliveryWholeSize(product){const box=Number(product.pcs_per_box)||0,pcsCase=Number(product.pcs_per_case)||0;return box>0?box:(pcsCase>0?pcsCase:1)}
function buildDeliveryQuantityText(row){const parts=[];if(row.wholeQty>0)parts.push(`${formatDeliveryNumber(row.wholeQty)}${row.wholeUnit||'\u6574'}`);if(row.looseQty>0)parts.push(`${formatDeliveryNumber(row.looseQty)}${row.unit||'\u4e2a'}`);return parts.join('')||''}
function buildDeliveryPriceText(row){const hasWhole=row.wholeQty>0,hasLoose=row.looseQty>0;if(hasWhole&&hasLoose)return `\u6574${money(row.wholePrice||0)} / \u6563${money(row.loosePrice||0)}`;if(hasWhole)return money(row.wholePrice||0);if(hasLoose)return money(row.loosePrice||0);return ''}
async function getDeliveryNoteRows(orderNo){
  const{data:items,error}=await client.from('sales_order_items').select('*').eq('order_no',orderNo);
  if(error)throw new Error(error.message);
  const orderItems=items||[];
  if(!orderItems.length)return {rows:[],totalAmount:0};
  const barcodes=[...new Set(orderItems.map(it=>String(it.barcode||'')).filter(Boolean))];
  let productMap={};
  if(barcodes.length){
    const{data:productRows,error:productError}=await client.from('products').select('barcode,brand,spec,flavor,unit,pcs_per_box,pcs_per_case').in('barcode',barcodes);
    if(productError)throw new Error(productError.message);
    (productRows||[]).forEach(product=>{
      productMap[String(product.barcode)]={...product,id:String(product.barcode),unit:product.unit||'个',pcs_per_box:Number(product.pcs_per_box)||0,pcs_per_case:Number(product.pcs_per_case)||0};
    });
  }
  const grouped=new Map();
  orderItems.forEach(item=>{
    const product=getDeliveryProduct(item,productMap);
    const barcode=String(item.barcode||'');
    const brand=String(product.brand||'').trim();
    const spec=String(product.spec||'').trim();
    const flavor=String(product.flavor||'').trim();
    const saleUnit=String(item.sale_unit||'');
    const isMixBox=saleUnit.includes('拼盒');
    const key=isMixBox?`mix|||${brand}|||${spec}`:`sku|||${barcode}`;
    const unit=product.unit||'个';
    if(!grouped.has(key))grouped.set(key,{spec,flavors:new Set(),fallback:barcode||'未知条码',unit,wholeQty:0,looseQty:0,wholePrice:0,loosePrice:0,wholeUnit:'整',amount:0});
    const row=grouped.get(key);
    if(flavor)row.flavors.add(flavor);
    row.unit=row.unit||unit;
    row.amount+=Number(item.amount||0);
    if(item.sale_unit){
      const saleQty=Number(item.sale_qty||item.qty||0),salePrice=Number(item.sale_unit_price||item.unit_price||0);
      if(isMixBox){
        const wholeSize=getDeliveryWholeSize(product);
        row.wholeQty+=saleQty/wholeSize;
        row.wholePrice=salePrice;
        row.wholeUnit='中盒';
      }else if(saleUnit.includes('整')){
        row.wholeQty+=saleQty;
        row.wholePrice=salePrice;
      }else{
        row.looseQty+=saleQty;
        row.loosePrice=salePrice;
      }
    }else{
      const qty=Number(item.qty||0),wholeSize=getDeliveryWholeSize(product),wholeQty=Math.floor(qty/wholeSize),looseQty=qty%wholeSize,loosePrice=Number(item.unit_price||0);
      row.wholeQty+=wholeQty;
      row.looseQty+=looseQty;
      row.loosePrice=loosePrice;
      row.wholePrice=Number((loosePrice*wholeSize).toFixed(2));
    }
  });
  const rows=Array.from(grouped.values()).map(row=>{
    const flavorText=Array.from(row.flavors).join('/');
    const productName=[row.spec,flavorText].filter(Boolean).join(' ')||row.fallback;
    return {...row,productName,qtyText:buildDeliveryQuantityText(row),priceText:buildDeliveryPriceText(row),amount:Number(row.amount.toFixed(2))};
  });
  const totalAmount=rows.reduce((sum,row)=>sum+Number(row.amount||0),0);
  return {rows,totalAmount:Number(totalAmount.toFixed(2))};
}
function buildDeliveryNoteHtml({storeName,rows,totalAmount,employeeName,orderDate}){const displayRows=[...rows];while(displayRows.length<8)displayRows.push(null);const body=displayRows.map((row,index)=>`<tr><td>${index+1}</td><td class="text-left">${row?esc(row.productName):''}</td><td>${row?esc(row.qtyText):''}</td><td>${row?esc(row.priceText):''}</td><td>${row?money(row.amount):''}</td></tr>`).join('');return `<div class="delivery-note-sheet"><div class="delivery-note-title">\u9001\u8d27\u5355</div><div class="delivery-note-meta"><div class="delivery-note-customer">\u5ba2\u6237\u540d\u79f0\uff1a<span>${esc(storeName||'')}</span></div><div class="delivery-note-date">\u65e5\u671f\uff1a${esc(orderDate||'')}</div></div><table class="delivery-note-table"><thead><tr><th class="col-index">\u5e8f\u53f7</th><th class="col-name">规格口味</th><th class="col-qty">\u6570\u91cf/\u5355\u4f4d</th><th class="col-price">\u5355\u4ef7</th><th class="col-amount">\u91d1\u989d</th></tr></thead><tbody>${body}<tr class="delivery-note-total"><td colspan="3">\u91d1\u989d\u5408\u8ba1\u5927\u5199\uff1a${esc(amountToChineseUpper(totalAmount))}</td><td colspan="2">\u91d1\u989d\u5408\u8ba1\u5c0f\u5199\uff1a\u00a5${money(totalAmount)}</td></tr><tr class="delivery-note-footer"><td colspan="5" class="delivery-note-deliver">\u9001\u8d27\u4eba\uff1a${esc(employeeName||'')}</td></tr></tbody></table></div>`}
async function generateDeliveryNote(orderNo,orderDate){if(typeof html2canvas==='undefined'){alert('\u751f\u6210\u56fe\u7247\u7ec4\u4ef6\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5');return}const buttons=document.querySelectorAll('.delivery-note-btn');buttons.forEach(btn=>btn.disabled=true);try{const {rows,totalAmount}=await getDeliveryNoteRows(orderNo);if(!rows.length){alert('\u8be5\u8ba2\u5355\u6ca1\u6709\u660e\u7ec6\uff0c\u65e0\u6cd5\u751f\u6210\u5355\u636e');return}const wrap=document.createElement('div');wrap.className='delivery-note-capture-wrap';wrap.innerHTML=buildDeliveryNoteHtml({storeName:currentStore?.name||'',rows,totalAmount,employeeName:currentEmployee.name||'',orderDate:orderDate||''});document.body.appendChild(wrap);const canvas=await html2canvas(wrap.querySelector('.delivery-note-sheet'),{backgroundColor:'#ffffff',scale:2,useCORS:true});const imgUrl=canvas.toDataURL('image/png');document.body.removeChild(wrap);const safeStore=String(currentStore?.name||'delivery-note').replace(/[\\/:*?"<>|\s]+/g,'_');downloadDeliveryImage(imgUrl,`\u9001\u8d27\u5355_${safeStore}_${orderDate||''}.png`)}catch(err){console.error(err);alert(`\u751f\u6210\u5355\u636e\u5931\u8d25: ${err.message||'\u8bf7\u91cd\u8bd5'}`)}finally{buttons.forEach(btn=>btn.disabled=false)}}
function downloadDeliveryImage(imgUrl,fileName){const link=document.createElement('a');link.href=imgUrl;link.download=esc(fileName);document.body.appendChild(link);link.click();document.body.removeChild(link)}
