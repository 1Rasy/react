// Hotfix: when editing an existing order, keep mixed-box rows in mixQty.
// Without this, sale_unit='拼盒' rows are treated as loose sales and sale_unit_price becomes the loose price.
(function(){
  if (typeof templateEditOrNew !== 'function') return;

  const originalTemplateEditOrNew = templateEditOrNew;

  function isMixBoxSaleUnit(value){
    return String(value || '').includes('拼盒');
  }

  function setMixBoxPriceForProduct(product, price){
    if (!product || !Number.isFinite(price) || price <= 0) return;
    products.forEach(target => {
      if (target.brand === product.brand && target.spec === product.spec && orderData.items[target.id]) {
        orderData.items[target.id].mixBoxPrice = price;
      }
    });
  }

  templateEditOrNew = function(orderNo=null, orderDate=null, rawItemsEncoded=null, atom=null, name=null){
    if (!orderNo) {
      return originalTemplateEditOrNew(orderNo, orderDate, rawItemsEncoded, atom, name);
    }

    STATE = 'ORDER';
    const items = JSON.parse(decodeURIComponent(rawItemsEncoded));
    orderData = {
      order_no: orderNo,
      atom: currentStore.atom,
      name: currentStore.name,
      date: orderDate,
      items: {},
      oldDbItemsMap: {}
    };
    mixBoxOpenKeys = new Set();
    initOrderItems();

    items.forEach(it => {
      const p = products.find(x => x.id == it.barcode);
      if (!p) return;

      const item = orderData.items[it.barcode];
      const saleUnit = String(it.sale_unit || '');
      const hasSale = it.sale_qty != null;

      if (hasSale) {
        const saleQty = Number(it.sale_qty ?? it.qty ?? 0);
        const salePrice = Number(it.sale_unit_price ?? it.unit_price ?? 0);

        if (isMixBoxSaleUnit(saleUnit)) {
          item.mixQty += saleQty;
          setMixBoxPriceForProduct(p, salePrice);
          mixBoxOpenKeys.add(mixBoxKey(p.brand, p.spec));
        } else if (saleUnit === '整') {
          item.wholeQty += saleQty;
          item.wholePrice = Number(it.sale_unit_price ?? it.unit_price ?? item.wholePrice);
        } else {
          item.looseQty += saleQty;
          item.loosePrice = Number(it.sale_unit_price ?? it.unit_price ?? item.loosePrice);
        }
      } else {
        const split = splitQtyForEditor(Number(it.qty || 0), p);
        item.wholeQty += split.wholeQty;
        item.looseQty += split.looseQty;
        item.wholePrice = Number(it.unit_price || 0) * packSize(p);
        item.loosePrice = Number(it.unit_price || 0);
      }

      orderData.oldDbItemsMap[it.barcode] = (orderData.oldDbItemsMap[it.barcode] || 0) + Number(it.qty || 0);
    });

    if (products.length) {
      const brands = orderedUnique(products, 'brand');
      currentSelectedBrand = brands[0] || null;
      currentSelectedSpec = getSpecsForBrand(currentSelectedBrand)[0] || '';
    }

    renderOrder();
  };
})();
