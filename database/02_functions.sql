-- Supabase database documentation export
-- Project: new (wyjbnnqhiehjccmojbbg)
-- Schema: public
-- Object type: functions
-- Generated at: 2026-06-21 01:15:42 +08
-- Note: Documentation DDL only. Do not run blindly as a migration.

CREATE OR REPLACE FUNCTION public.import_and_filter_stores(p_store_json jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_inserted_count int := 0;
    v_item jsonb;
    v_emp_code text;
    v_customer_code text;
    v_customer_name text;
BEGIN
    -- p_store_json 是网页端直接扔过来的原始 Excel 转化后的全量 JSON 数组
    -- 在数据库内部直接展开并高效循环
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_store_json) LOOP

        -- 1. 提取原始表头中我们需要的 3 个关键字段（自动去掉可能存在的空格）
        v_customer_code := trim(both '"' from (v_item->>'ATOM门店编号'));
        v_customer_name := v_item->>'门店名称';
        v_emp_code      := trim(both '"' from (v_item->>'门店负责人员工号'));

        -- 核心防御：只有当这个工号在我们专属的 employees 表里存在时，才允许导入
        IF EXISTS (SELECT 1 FROM employees WHERE employee_code = v_emp_code) THEN

            -- 执行写入或更新（若门店已存在则更新名称和负责人，避免重复）
            INSERT INTO dealer_employee_mappings (customer_code, customer_name, employee_code)
            VALUES (v_customer_code, v_customer_name, v_emp_code)
            ON CONFLICT (customer_code)
            DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                employee_code = EXCLUDED.employee_code;

            v_inserted_count := v_inserted_count + 1;
        END IF;

    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'msg', '门店总表筛选导入成功（亚洲东八区时间）',
        'matched_count', v_inserted_count
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.import_filtered_store_assets(p_raw_excel_json jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_inserted_count int := 0;
    v_row jsonb;
    v_emp_code text;
    v_customer_code text;
    v_customer_name text;
BEGIN
    -- 全量洗牌：导入前清空当前白名单特殊业务员的旧门店数据
    DELETE FROM employee_store_assets
    WHERE employee_code IN (SELECT employee_code FROM employees);

    FOR v_row IN SELECT * FROM jsonb_array_elements(p_raw_excel_json) LOOP

        v_emp_code      := trim(both '"' from (v_row->>'门店负责人员工号'));
        v_customer_code := trim(both '"' from (v_row->>'ATOM门店编号'));
        v_customer_name := v_row->>'门店名称';

        -- 白名单拦截：只有在 employees 表里能找到的工号，才允许执行提取
        IF EXISTS (SELECT 1 FROM employees WHERE employee_code = v_emp_code) THEN

            INSERT INTO employee_store_assets (employee_code, customer_code, customer_name)
            VALUES (v_emp_code, v_customer_code, v_customer_name)
            ON CONFLICT (customer_code)
            DO UPDATE SET
                employee_code = EXCLUDED.employee_code,
                customer_name = EXCLUDED.customer_name;

            v_inserted_count := v_inserted_count + 1;
        END IF;

    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'matched_count', v_inserted_count
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_dealer_stock_final()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_emp_code text;
    v_barcode_exists text;
    v_package_reg numeric;
    v_total_qty numeric;
BEGIN
    -- 1. 跨表筛选
    SELECT employee_code INTO v_emp_code
    FROM dealer_employee_mappings
    WHERE customer_code = NEW.customer_code
    LIMIT 1;

    -- 2. 安全判断
    IF v_emp_code IS NOT NULL THEN
        SELECT barcode INTO v_barcode_exists
        FROM products
        WHERE barcode = NEW.barcode
        LIMIT 1;

        IF v_barcode_exists IS NOT NULL THEN

            -- 3. 动态包装换算
            v_package_reg := COALESCE(NEW.package_reg, 0);
            IF v_package_reg <= 0 THEN
                SELECT COALESCE(pcs_per_case, 1) INTO v_package_reg
                FROM products WHERE barcode = NEW.barcode;
            END IF;

            -- 计算总箱数
            v_total_qty := COALESCE(NEW.qty_piece, 0) + (COALESCE(NEW.qty_scatter, 0) / v_package_reg);

            -- 4. 自动原子化增加随车车存
            INSERT INTO van_stocks (employee_code, product_barcode, qty, updated_at)
            VALUES (v_emp_code, v_barcode_exists, v_total_qty, (now() AT TIME ZONE 'Asia/Shanghai'))
            ON CONFLICT (employee_code, product_barcode)
            DO UPDATE SET
                qty = van_stocks.qty + v_total_qty,
                updated_at = (now() AT TIME ZONE 'Asia/Shanghai');

            NEW.is_processed := true;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

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
  v_current_stock NUMERIC;
BEGIN
  -- 1. 安全校验：严格比对车存，防止负库存或并发冲突
  FOR v_stock IN SELECT * FROM jsonb_to_recordset(p_stock_updates) AS x(product_barcode text, qty numeric) LOOP
    IF v_stock.qty < 0 THEN
      RAISE EXCEPTION '商品 [%] 车销可用库存不足，无法提交账单！', v_stock.product_barcode;
    END IF;
  END LOOP;

  -- 2. 写入或更新订单主表
  INSERT INTO sales_orders (order_no, employee_code, atom_code, store_name, total_amount, status, created_at)
  VALUES (p_order_no, p_employee_code, p_atom_code, p_store_name, p_total_amount, 'SUCCESS', NOW())
  ON CONFLICT (order_no)
  DO UPDATE SET total_amount = p_total_amount;

  -- 3. 清理旧明细（如果是修改订单）
  DELETE FROM sales_order_items WHERE order_no = p_order_no;

  -- 4. 批量写入新明细表
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(barcode text, product_name text, qty numeric, unit_price numeric, amount numeric, remark text) LOOP
    INSERT INTO sales_order_items (order_no, barcode, product_name, qty, unit_price, amount, remark, created_at)
    VALUES (p_order_no, v_item.barcode, v_item.product_name, v_item.qty, v_item.unit_price, v_item.amount, v_item.remark, NOW());
  END LOOP;

  -- 5. 批量同步更新车销库存表
  FOR v_stock IN SELECT * FROM jsonb_to_recordset(p_stock_updates) AS x(product_barcode text, qty numeric) LOOP
    INSERT INTO van_stocks (employee_code, product_barcode, qty, created_at)
    VALUES (p_employee_code, v_stock.product_barcode, v_stock.qty, NOW())
    ON CONFLICT (employee_code, product_barcode)
    DO UPDATE SET qty = v_stock.qty, created_at = NOW();
  END LOOP;

  RETURN 'SUCCESS';
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '%', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_sales_order_v4(
  p_order_no text,
  p_employee_code text,
  p_atom_code text,
  p_store_name text,
  p_total_amount numeric,
  p_items jsonb
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  v_item RECORD;
  v_calc_pcs BIGINT;
  v_pcs_per_case INT;
  v_package_reg INT;
  v_prod_name TEXT;
BEGIN
  -- 1. 如果是修改订单，直接清理旧明细和旧主表（触发器会自动将旧库存加回去）
  IF EXISTS(SELECT 1 FROM sales_orders WHERE order_no = p_order_no) THEN
    DELETE FROM sales_order_items WHERE order_no = p_order_no;
    DELETE FROM sales_orders WHERE order_no = p_order_no;
  END IF;

  -- 2. 写入订单主表
  INSERT INTO sales_orders (order_no, employee_code, atom_code, store_name, total_amount, status, created_at)
  VALUES (p_order_no, p_employee_code, p_atom_code, p_store_name, p_total_amount, 'SUCCESS', NOW());

  -- 3. 循环写入新明细，并扣减车存
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    barcode text, product_name text, qty_piece numeric, qty_scatter numeric,
    unit_price numeric, amount numeric, remark text
  ) LOOP

    -- 捞出商品的配规系数
    SELECT pcs_per_case, package_reg, flavor INTO v_pcs_per_case, v_package_reg, v_prod_name
    FROM products WHERE barcode = v_item.barcode LIMIT 1;

    v_pcs_per_case := COALESCE(v_pcs_per_case, 1);
    v_package_reg := COALESCE(v_package_reg, v_pcs_per_case);

    -- 动态换算公式
    v_calc_pcs := (
      COALESCE(v_item.qty_piece, 0) * v_pcs_per_case +
      COALESCE(v_item.qty_scatter, 0) * (v_pcs_per_case / NULLIF(v_package_reg, 0))
    )::BIGINT;

    -- 写入业务开单明细表
    INSERT INTO sales_order_items (order_no, barcode, product_name, qty, unit_price, amount, remark, created_at)
    VALUES (p_order_no, v_item.barcode, COALESCE(v_prod_name, v_item.product_name), v_calc_pcs, v_item.unit_price, v_item.amount, v_item.remark, NOW());

    -- 实时扣减车销库存表
    UPDATE van_stocks
    SET qty = qty - v_calc_pcs,
        updated_at = NOW()
    WHERE employee_code = p_employee_code AND product_barcode = v_item.barcode;

  END LOOP;

  RETURN 'SUCCESS';
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_and_mask_assets()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
    -- 步骤 A：比对 atom_code。新 Excel 表中不存在的历史旧门店，安全标记为隐藏
    UPDATE employee_store_assets
    SET is_active = false
    WHERE atom_code NOT IN (SELECT atom_code FROM temp_upload_assets);

    -- 步骤 B：将最新清洗的数据合并至正式表
    INSERT INTO employee_store_assets (employee_code, atom_code, store_name, is_active)
    SELECT employee_code, atom_code, store_name, true
    FROM temp_upload_assets
    ON CONFLICT (atom_code)
    DO UPDATE SET
        employee_code = EXCLUDED.employee_code,
        store_name = EXCLUDED.store_name,
        is_active = true;

    -- 步骤 C：清空临时表释放空间
    TRUNCATE TABLE temp_upload_assets;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_van_stock_from_outbounds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    target_employee_code TEXT;
    target_customer_code TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_customer_code := OLD.customer_code;
    ELSE
        target_customer_code := NEW.customer_code;
    END IF;

    IF target_customer_code IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT employee_code INTO target_employee_code
    FROM public.dealer_employee_mappings
    WHERE customer_code = target_customer_code
    LIMIT 1;

    IF target_employee_code IS NOT NULL THEN

        INSERT INTO public.van_stocks (employee_code, product_barcode, qty, updated_at)
        SELECT
            target_employee_code,
            TRIM(rdo.barcode) AS product_barcode,
            SUM((COALESCE(rdo.qty_piece, 0) * COALESCE(rdo.package_reg, 1)) + COALESCE(rdo.qty_scatter, 0)) AS qty,
            NOW()
        FROM public.raw_dealer_outbounds rdo
        WHERE rdo.customer_code IN (
            SELECT customer_code
            FROM public.dealer_employee_mappings
            WHERE employee_code = target_employee_code
        )
        AND rdo.barcode IS NOT NULL AND TRIM(rdo.barcode) != ''
        GROUP BY TRIM(rdo.barcode)
        ON CONFLICT (employee_code, product_barcode)
        DO UPDATE SET
            qty = EXCLUDED.qty,
            updated_at = NOW();

    END IF;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_van_stock_on_order_change_v4()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    UPDATE van_stocks
    SET qty = qty + COALESCE(OLD.qty, 0),
        updated_at = NOW()
    WHERE product_barcode = OLD.barcode
      AND employee_code = (SELECT employee_code FROM sales_orders WHERE order_no = OLD.order_no LIMIT 1);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;
