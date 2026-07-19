-- 修复 submit_sales_order_v2：van_stocks 表只有 updated_at，没有 created_at。
-- 账单历史、日报、订单归属应以前端 sales_orders.created_at 为准，
-- 不应该为了前端查询额外依赖 sales_orders.updated_at。

CREATE OR REPLACE FUNCTION public.submit_sales_order_v2(
  p_order_no text,
  p_employee_code text,
  p_atom_code text,
  p_store_name text,
  p_total_amount numeric,
  p_items jsonb,
  p_stock_updates jsonb
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  v_item RECORD;
  v_stock RECORD;
BEGIN
  FOR v_stock IN
    SELECT * FROM jsonb_to_recordset(COALESCE(p_stock_updates, '[]'::jsonb))
      AS x(product_barcode text, qty numeric)
  LOOP
    IF COALESCE(v_stock.qty, 0) < 0 THEN
      RAISE EXCEPTION '商品 [%] 车销可用库存不足，无法提交账单！', v_stock.product_barcode;
    END IF;
  END LOOP;

  INSERT INTO public.sales_orders (
    order_no, employee_code, atom_code, store_name, total_amount, status, created_at
  )
  VALUES (
    p_order_no, p_employee_code, p_atom_code, p_store_name, p_total_amount, 'SUCCESS', NOW()
  )
  ON CONFLICT (order_no)
  DO UPDATE SET
    employee_code = EXCLUDED.employee_code,
    atom_code = EXCLUDED.atom_code,
    store_name = EXCLUDED.store_name,
    total_amount = EXCLUDED.total_amount,
    status = EXCLUDED.status;

  DELETE FROM public.sales_order_items WHERE order_no = p_order_no;

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(COALESCE(p_items, '[]'::jsonb))
      AS x(barcode text, product_name text, qty numeric, unit_price numeric, amount numeric, remark text)
  LOOP
    INSERT INTO public.sales_order_items (
      order_no, barcode, product_name, qty, unit_price, amount, remark, created_at
    )
    VALUES (
      p_order_no,
      v_item.barcode,
      v_item.product_name,
      COALESCE(v_item.qty, 0),
      COALESCE(v_item.unit_price, 0),
      COALESCE(v_item.amount, 0),
      v_item.remark,
      NOW()
    );
  END LOOP;

  FOR v_stock IN
    SELECT * FROM jsonb_to_recordset(COALESCE(p_stock_updates, '[]'::jsonb))
      AS x(product_barcode text, qty numeric)
  LOOP
    INSERT INTO public.van_stocks (
      employee_code, product_barcode, qty, updated_at
    )
    VALUES (
      p_employee_code,
      v_stock.product_barcode,
      COALESCE(v_stock.qty, 0)::bigint,
      NOW()
    )
    ON CONFLICT (employee_code, product_barcode)
    DO UPDATE SET
      qty = EXCLUDED.qty,
      updated_at = NOW();
  END LOOP;

  RETURN 'SUCCESS';
END;
$function$;
