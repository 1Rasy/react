-- Inventory becomes effective at 2026-07-01 00:00:00+08.
-- Historical orders remain queryable, but only orders on/after the cutoff affect stock.
-- The stock summary import writes an opening baseline and rebuilds current stock idempotently.

create or replace function public.inventory_stock_effective_from()
returns timestamptz
language sql
immutable
parallel safe
as $$
  select timestamptz '2026-07-01 00:00:00+08';
$$;

create or replace function public.try_parse_inventory_date(p_value text)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_text text;
begin
  v_text := btrim(replace(coalesce(p_value, ''), '/', '-'));
  if v_text = '' then
    return null;
  end if;

  begin
    return (v_text::timestamp at time zone 'Asia/Shanghai');
  exception when others then
    return null;
  end;
end;
$$;

create table if not exists public.van_stock_baselines (
  baseline_id text not null,
  employee_code text not null references public.employees(employee_code) on update cascade on delete cascade,
  product_barcode text not null references public.products(barcode) on update cascade on delete cascade,
  qty bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (baseline_id, employee_code, product_barcode)
);

comment on table public.van_stock_baselines is
  'Opening stock snapshots. Current stock is baseline quantity minus sales orders on/after the effective date.';

grant select, insert, update, delete on public.van_stock_baselines to anon, authenticated;

create or replace function public.rebuild_van_stocks_from_baseline(
  p_baseline_id text,
  p_cutoff timestamptz default public.inventory_stock_effective_from(),
  p_employee_codes text[] default null
)
returns jsonb
language plpgsql
as $$
declare
  v_employee_codes text[];
  v_deleted_rows bigint := 0;
  v_written_rows bigint := 0;
begin
  if nullif(btrim(p_baseline_id), '') is null then
    raise exception 'baseline_id cannot be empty';
  end if;

  if p_employee_codes is null then
    select array_agg(x.employee_code order by x.employee_code)
      into v_employee_codes
    from (
      select distinct b.employee_code
      from public.van_stock_baselines b
      where b.baseline_id = p_baseline_id
    ) x;
  else
    select array_agg(x.employee_code order by x.employee_code)
      into v_employee_codes
    from (
      select distinct btrim(code) as employee_code
      from unnest(p_employee_codes) as code
      where nullif(btrim(code), '') is not null
    ) x;
  end if;

  if coalesce(cardinality(v_employee_codes), 0) = 0 then
    return jsonb_build_object(
      'baseline_id', p_baseline_id,
      'cutoff', p_cutoff,
      'employees', 0,
      'deleted_stock_rows', 0,
      'written_stock_rows', 0
    );
  end if;

  delete from public.van_stocks vs
  where vs.employee_code = any(v_employee_codes);
  get diagnostics v_deleted_rows = row_count;

  with baseline as (
    select b.employee_code, b.product_barcode, b.qty
    from public.van_stock_baselines b
    where b.baseline_id = p_baseline_id
      and b.employee_code = any(v_employee_codes)
  ),
  sold as (
    select
      so.employee_code,
      soi.barcode as product_barcode,
      sum(coalesce(soi.qty, 0))::bigint as sold_qty
    from public.sales_orders so
    join public.sales_order_items soi on soi.order_no = so.order_no
    where so.created_at >= p_cutoff
      and so.employee_code = any(v_employee_codes)
    group by so.employee_code, soi.barcode
  ),
  stock_keys as (
    select employee_code, product_barcode from baseline
    union
    select employee_code, product_barcode from sold
  )
  insert into public.van_stocks (employee_code, product_barcode, qty, updated_at)
  select
    k.employee_code,
    k.product_barcode,
    coalesce(b.qty, 0) - coalesce(s.sold_qty, 0),
    now()
  from stock_keys k
  left join baseline b
    on b.employee_code = k.employee_code
   and b.product_barcode = k.product_barcode
  left join sold s
    on s.employee_code = k.employee_code
   and s.product_barcode = k.product_barcode
  on conflict (employee_code, product_barcode)
  do update set
    qty = excluded.qty,
    updated_at = excluded.updated_at;
  get diagnostics v_written_rows = row_count;

  return jsonb_build_object(
    'baseline_id', p_baseline_id,
    'cutoff', p_cutoff,
    'employees', cardinality(v_employee_codes),
    'deleted_stock_rows', v_deleted_rows,
    'written_stock_rows', v_written_rows
  );
end;
$$;

create or replace function public.import_van_stock_baseline(
  p_baseline_id text,
  p_rows jsonb,
  p_cutoff timestamptz default public.inventory_stock_effective_from()
)
returns jsonb
language plpgsql
as $$
declare
  v_employee_codes text[];
  v_missing_employees text;
  v_missing_products text;
  v_imported_rows bigint := 0;
  v_result jsonb;
begin
  if nullif(btrim(p_baseline_id), '') is null then
    raise exception 'baseline_id cannot be empty';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'p_rows must be a non-empty JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) e
    where nullif(btrim(e->>'employee_code'), '') is null
       or nullif(btrim(e->>'product_barcode'), '') is null
       or coalesce(e->>'qty', '') !~ '^-?[0-9]+$'
  ) then
    raise exception 'Every import row requires employee_code, product_barcode and an integer qty';
  end if;

  select string_agg(x.employee_code, '、' order by x.employee_code)
    into v_missing_employees
  from (
    select distinct btrim(e->>'employee_code') as employee_code
    from jsonb_array_elements(p_rows) e
    except
    select employee_code from public.employees
  ) x;

  if v_missing_employees is not null then
    raise exception 'Unknown employee_code: %', v_missing_employees;
  end if;

  select string_agg(x.product_barcode, '、' order by x.product_barcode)
    into v_missing_products
  from (
    select distinct btrim(e->>'product_barcode') as product_barcode
    from jsonb_array_elements(p_rows) e
    except
    select barcode from public.products
  ) x;

  if v_missing_products is not null then
    raise exception 'Unknown product_barcode: %', v_missing_products;
  end if;

  select array_agg(x.employee_code order by x.employee_code)
    into v_employee_codes
  from (
    select distinct btrim(e->>'employee_code') as employee_code
    from jsonb_array_elements(p_rows) e
  ) x;

  delete from public.van_stock_baselines b
  where b.baseline_id = p_baseline_id
    and b.employee_code = any(v_employee_codes);

  with parsed as (
    select
      ord,
      btrim(e->>'employee_code') as employee_code,
      btrim(e->>'product_barcode') as product_barcode,
      (e->>'qty')::bigint as qty
    from jsonb_array_elements(p_rows) with ordinality as src(e, ord)
  ),
  deduplicated as (
    select distinct on (employee_code, product_barcode)
      employee_code,
      product_barcode,
      qty
    from parsed
    order by employee_code, product_barcode, ord desc
  )
  insert into public.van_stock_baselines (baseline_id, employee_code, product_barcode, qty, updated_at)
  select p_baseline_id, employee_code, product_barcode, qty, now()
  from deduplicated;
  get diagnostics v_imported_rows = row_count;

  v_result := public.rebuild_van_stocks_from_baseline(
    p_baseline_id,
    p_cutoff,
    v_employee_codes
  );

  return v_result || jsonb_build_object('imported_baseline_rows', v_imported_rows);
end;
$$;

grant execute on function public.inventory_stock_effective_from() to anon, authenticated;
grant execute on function public.rebuild_van_stocks_from_baseline(text, timestamptz, text[]) to anon, authenticated;
grant execute on function public.import_van_stock_baseline(text, jsonb, timestamptz) to anon, authenticated;

create or replace function public.process_dealer_stock_final()
returns trigger
language plpgsql
as $$
declare
  v_emp_code text;
  v_product_barcode text;
  v_pcs_per_case numeric;
  v_package_reg numeric;
  v_total_qty numeric;
  v_bill_at timestamptz;
begin
  if NEW.import_uid is null or btrim(NEW.import_uid) = '' then
    NEW.import_uid := 'i' || substr(
      md5(concat_ws('|',
        coalesce(nullif(btrim(NEW.order_no), ''), '∅'),
        regexp_replace(replace(coalesce(NEW.bill_date, ''), '/', '-'), '\s+', ' ', 'g'),
        coalesce(nullif(btrim(NEW.barcode), ''), '∅'),
        coalesce(nullif(regexp_replace(regexp_replace(coalesce(NEW.qty_piece::text, '0'), '0+$', ''), '\.$', ''), ''), '0'),
        coalesce(nullif(regexp_replace(regexp_replace(coalesce(NEW.qty_scatter::text, '0'), '0+$', ''), '\.$', ''), ''), '0')
      )),
      1,
      16
    );
  end if;

  if NEW.import_uid is not null
     and exists (
       select 1
       from public.raw_dealer_outbounds r
       where r.import_uid = NEW.import_uid
       limit 1
     ) then
    return null;
  end if;

  v_bill_at := coalesce(
    public.try_parse_inventory_date(NEW.bill_date),
    NEW.created_at,
    now()
  );

  if v_bill_at < public.inventory_stock_effective_from() then
    NEW.is_processed := false;
    return NEW;
  end if;

  select employee_code into v_emp_code
  from public.dealer_employee_mappings
  where customer_code = NEW.customer_code
  limit 1;

  if v_emp_code is not null then
    select barcode, coalesce(pcs_per_case, 0)::numeric
      into v_product_barcode, v_pcs_per_case
    from public.products
    where barcode = NEW.barcode
    limit 1;

    if v_product_barcode is not null then
      v_package_reg := coalesce(NEW.package_reg, 0);

      if v_package_reg > 0 and v_pcs_per_case > 0 then
        v_total_qty :=
          (v_pcs_per_case * coalesce(NEW.qty_piece, 0))
          + ((v_pcs_per_case / v_package_reg) * coalesce(NEW.qty_scatter, 0));
      else
        v_total_qty := coalesce(NEW.qty_piece, 0) + coalesce(NEW.qty_scatter, 0);
      end if;

      insert into public.van_stocks (employee_code, product_barcode, qty, updated_at)
      values (v_emp_code, v_product_barcode, v_total_qty, now())
      on conflict (employee_code, product_barcode)
      do update set
        qty = public.van_stocks.qty + excluded.qty,
        updated_at = now();

      NEW.is_processed := true;
    end if;
  end if;

  return NEW;
end;
$$;

create or replace function public.sync_van_stock_from_outbounds()
returns trigger
language plpgsql
security definer
as $$
declare
  target_employee_code text;
  target_customer_code text;
begin
  if TG_OP = 'DELETE' then
    target_customer_code := OLD.customer_code;
  else
    target_customer_code := NEW.customer_code;
  end if;

  if target_customer_code is null then
    return null;
  end if;

  select employee_code into target_employee_code
  from public.dealer_employee_mappings
  where customer_code = target_customer_code
  limit 1;

  if target_employee_code is not null then
    insert into public.van_stocks (employee_code, product_barcode, qty, updated_at)
    select
      target_employee_code,
      btrim(rdo.barcode) as product_barcode,
      sum(
        case
          when coalesce(rdo.package_reg, 0) > 0 and coalesce(p.pcs_per_case, 0) > 0 then
            (coalesce(p.pcs_per_case, 0) * coalesce(rdo.qty_piece, 0))
            + ((coalesce(p.pcs_per_case, 0)::numeric / rdo.package_reg) * coalesce(rdo.qty_scatter, 0))
          else coalesce(rdo.qty_piece, 0) + coalesce(rdo.qty_scatter, 0)
        end
      )::bigint as qty,
      now()
    from public.raw_dealer_outbounds rdo
    join public.products p on p.barcode = rdo.barcode
    where rdo.customer_code in (
      select customer_code
      from public.dealer_employee_mappings
      where employee_code = target_employee_code
    )
      and rdo.barcode is not null
      and btrim(rdo.barcode) <> ''
      and coalesce(public.try_parse_inventory_date(rdo.bill_date), rdo.created_at) >= public.inventory_stock_effective_from()
    group by btrim(rdo.barcode)
    on conflict (employee_code, product_barcode)
    do update set
      qty = excluded.qty,
      updated_at = now();
  end if;

  return null;
end;
$$;

create or replace function public.submit_sales_order_v4(
  p_order_no text,
  p_employee_code text,
  p_atom_code text,
  p_store_name text,
  p_total_amount numeric,
  p_items jsonb
)
returns text
language plpgsql
as $$
declare
  v_item record;
  v_calc_pcs bigint;
  v_pcs_per_case int;
  v_package_reg int;
  v_prod_name text;
  v_original_created_at timestamptz;
  v_order_created_at timestamptz;
begin
  select so.created_at
    into v_original_created_at
  from public.sales_orders so
  where so.order_no = p_order_no
  limit 1;

  if found then
    delete from public.sales_order_items where order_no = p_order_no;
    delete from public.sales_orders where order_no = p_order_no;
  end if;

  v_order_created_at := coalesce(v_original_created_at, now());

  insert into public.sales_orders (
    order_no, employee_code, atom_code, store_name,
    total_amount, status, created_at
  ) values (
    p_order_no, p_employee_code, p_atom_code, p_store_name,
    p_total_amount, 'SUCCESS', v_order_created_at
  );

  for v_item in
    select *
    from jsonb_to_recordset(p_items) as x(
      barcode text,
      product_name text,
      qty_piece numeric,
      qty_scatter numeric,
      unit_price numeric,
      amount numeric,
      remark text
    )
  loop
    select pcs_per_case, package_reg, flavor
      into v_pcs_per_case, v_package_reg, v_prod_name
    from public.products
    where barcode = v_item.barcode
    limit 1;

    v_pcs_per_case := coalesce(v_pcs_per_case, 1);
    v_package_reg := coalesce(v_package_reg, v_pcs_per_case);

    v_calc_pcs := (
      coalesce(v_item.qty_piece, 0) * v_pcs_per_case
      + coalesce(v_item.qty_scatter, 0) * (v_pcs_per_case / nullif(v_package_reg, 0))
    )::bigint;

    insert into public.sales_order_items (
      order_no, barcode, product_name, qty,
      unit_price, amount, remark, created_at
    ) values (
      p_order_no, v_item.barcode, coalesce(v_prod_name, v_item.product_name), v_calc_pcs,
      v_item.unit_price, v_item.amount, v_item.remark, v_order_created_at
    );

    if v_order_created_at >= public.inventory_stock_effective_from() then
      insert into public.van_stocks (employee_code, product_barcode, qty, updated_at)
      values (p_employee_code, v_item.barcode, -v_calc_pcs, now())
      on conflict (employee_code, product_barcode)
      do update set
        qty = public.van_stocks.qty + excluded.qty,
        updated_at = now();
    end if;
  end loop;

  return 'SUCCESS';
end;
$$;

create or replace function public.sync_van_stock_on_order_change_v4()
returns trigger
language plpgsql
as $$
declare
  v_employee_code text;
  v_order_created_at timestamptz;
begin
  if TG_OP = 'DELETE' then
    select so.employee_code, so.created_at
      into v_employee_code, v_order_created_at
    from public.sales_orders so
    where so.order_no = OLD.order_no
    limit 1;

    if v_order_created_at is null
       or v_order_created_at < public.inventory_stock_effective_from() then
      return OLD;
    end if;

    insert into public.van_stocks (employee_code, product_barcode, qty, updated_at)
    values (v_employee_code, OLD.barcode, coalesce(OLD.qty, 0)::bigint, now())
    on conflict (employee_code, product_barcode)
    do update set
      qty = public.van_stocks.qty + coalesce(OLD.qty, 0)::bigint,
      updated_at = now();

    return OLD;
  end if;

  return null;
end;
$$;
