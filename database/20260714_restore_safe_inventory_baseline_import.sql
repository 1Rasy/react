-- Restore the browser-facing opening-stock import RPC.
-- Rules:
-- 1. Imported rows are the 2026-07-01 opening stock.
-- 2. Every order on/after 2026-07-01 is deducted, including orders created before this migration.
-- 3. S260401018 keeps the protected 68-row pre-reset baseline unless that employee is explicitly included in a new import.
-- 4. Direct table writes remain unavailable; anon/authenticated can only call the validated RPC.

create or replace function public.rebuild_van_stocks_from_orders(
  p_cutoff timestamptz default public.inventory_stock_effective_from()
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_deleted_rows bigint := 0;
  v_written_rows bigint := 0;
  v_total_qty bigint := 0;
begin
  delete from public.van_stocks;
  get diagnostics v_deleted_rows = row_count;

  with imported_employees as (
    select distinct employee_code
    from public.van_stock_baselines
    where baseline_id = '2026-07-01-opening'
  ),
  opening as (
    select employee_code, product_barcode, qty::bigint as opening_qty
    from public.van_stock_baselines
    where baseline_id = '2026-07-01-opening'

    union all

    select employee_code, product_barcode, qty::bigint
    from public.van_stock_baselines
    where baseline_id = 'preserved-s260401018-pre-reset'
      and lower(employee_code) = lower('S260401018')
      and not exists (
        select 1 from imported_employees
        where lower(employee_code) = lower('S260401018')
      )
  ),
  sold as (
    select so.employee_code, soi.barcode as product_barcode,
           sum(coalesce(soi.qty, 0))::bigint as sold_qty
    from public.sales_orders so
    join public.sales_order_items soi on soi.order_no = so.order_no
    where so.created_at >= p_cutoff
    group by so.employee_code, soi.barcode
  ),
  stock_keys as (
    select employee_code, product_barcode from opening
    union
    select employee_code, product_barcode from sold
  )
  insert into public.van_stocks (employee_code, product_barcode, qty, updated_at)
  select k.employee_code, k.product_barcode,
         coalesce(o.opening_qty, 0) - coalesce(s.sold_qty, 0), now()
  from stock_keys k
  left join opening o using (employee_code, product_barcode)
  left join sold s using (employee_code, product_barcode);
  get diagnostics v_written_rows = row_count;

  select coalesce(sum(qty), 0)::bigint into v_total_qty
  from public.van_stocks;

  return jsonb_build_object(
    'cutoff', p_cutoff,
    'deleted_stock_rows', v_deleted_rows,
    'written_stock_rows', v_written_rows,
    'total_stock_qty', v_total_qty
  );
end;
$$;

create or replace function public.rebuild_van_stocks_from_baseline(
  p_baseline_id text,
  p_cutoff timestamptz default public.inventory_stock_effective_from(),
  p_employee_codes text[] default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_employee_codes text[];
  v_deleted_rows bigint := 0;
  v_written_rows bigint := 0;
begin
  if p_baseline_id <> '2026-07-01-opening' then
    raise exception 'Unsupported baseline_id: %', p_baseline_id;
  end if;
  if p_cutoff is distinct from public.inventory_stock_effective_from() then
    raise exception 'Unsupported cutoff: %', p_cutoff;
  end if;

  if p_employee_codes is null then
    select array_agg(employee_code order by employee_code)
    into v_employee_codes
    from (
      select distinct employee_code
      from public.van_stock_baselines
      where baseline_id = p_baseline_id
    ) x;
  else
    select array_agg(employee_code order by employee_code)
    into v_employee_codes
    from (
      select distinct btrim(code) as employee_code
      from unnest(p_employee_codes) code
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

  delete from public.van_stocks
  where employee_code = any(v_employee_codes);
  get diagnostics v_deleted_rows = row_count;

  with imported_employees as (
    select distinct employee_code
    from public.van_stock_baselines
    where baseline_id = p_baseline_id
      and employee_code = any(v_employee_codes)
  ),
  opening as (
    select employee_code, product_barcode, qty::bigint as opening_qty
    from public.van_stock_baselines
    where baseline_id = p_baseline_id
      and employee_code = any(v_employee_codes)

    union all

    select employee_code, product_barcode, qty::bigint
    from public.van_stock_baselines
    where baseline_id = 'preserved-s260401018-pre-reset'
      and lower(employee_code) = lower('S260401018')
      and employee_code = any(v_employee_codes)
      and not exists (
        select 1 from imported_employees
        where lower(employee_code) = lower('S260401018')
      )
  ),
  sold as (
    select so.employee_code, soi.barcode as product_barcode,
           sum(coalesce(soi.qty, 0))::bigint as sold_qty
    from public.sales_orders so
    join public.sales_order_items soi on soi.order_no = so.order_no
    where so.created_at >= p_cutoff
      and so.employee_code = any(v_employee_codes)
    group by so.employee_code, soi.barcode
  ),
  stock_keys as (
    select employee_code, product_barcode from opening
    union
    select employee_code, product_barcode from sold
  )
  insert into public.van_stocks (employee_code, product_barcode, qty, updated_at)
  select k.employee_code, k.product_barcode,
         coalesce(o.opening_qty, 0) - coalesce(s.sold_qty, 0), now()
  from stock_keys k
  left join opening o using (employee_code, product_barcode)
  left join sold s using (employee_code, product_barcode)
  on conflict (employee_code, product_barcode)
  do update set qty = excluded.qty, updated_at = excluded.updated_at;
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
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee_codes text[];
  v_missing_employees text;
  v_missing_products text;
  v_imported_rows bigint := 0;
  v_result jsonb;
begin
  if p_baseline_id <> '2026-07-01-opening' then
    raise exception 'Unsupported baseline_id: %', p_baseline_id;
  end if;
  if p_cutoff is distinct from public.inventory_stock_effective_from() then
    raise exception 'Unsupported cutoff: %', p_cutoff;
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'p_rows must be a non-empty JSON array';
  end if;
  if jsonb_array_length(p_rows) > 20000 then
    raise exception 'Too many import rows: %', jsonb_array_length(p_rows);
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
    where nullif(btrim(e->>'employee_code'), '') is null
       or nullif(btrim(e->>'product_barcode'), '') is null
       or coalesce(e->>'qty', '') !~ '^-?[0-9]+$'
  ) then
    raise exception 'Every import row requires employee_code, product_barcode and an integer qty';
  end if;

  select string_agg(employee_code, '、' order by employee_code)
  into v_missing_employees
  from (
    select distinct btrim(e->>'employee_code') employee_code
    from jsonb_array_elements(p_rows) e
    except
    select employee_code from public.employees
  ) x;
  if v_missing_employees is not null then
    raise exception 'Unknown employee_code: %', v_missing_employees;
  end if;

  select string_agg(product_barcode, '、' order by product_barcode)
  into v_missing_products
  from (
    select distinct btrim(e->>'product_barcode') product_barcode
    from jsonb_array_elements(p_rows) e
    except
    select barcode from public.products
  ) x;
  if v_missing_products is not null then
    raise exception 'Unknown product_barcode: %', v_missing_products;
  end if;

  select array_agg(employee_code order by employee_code)
  into v_employee_codes
  from (
    select distinct btrim(e->>'employee_code') employee_code
    from jsonb_array_elements(p_rows) e
  ) x;

  delete from public.van_stock_baselines
  where baseline_id = p_baseline_id
    and employee_code = any(v_employee_codes);

  with parsed as (
    select ord,
           btrim(e->>'employee_code') employee_code,
           btrim(e->>'product_barcode') product_barcode,
           (e->>'qty')::bigint qty
    from jsonb_array_elements(p_rows) with ordinality src(e, ord)
  ),
  deduplicated as (
    select distinct on (employee_code, product_barcode)
           employee_code, product_barcode, qty
    from parsed
    order by employee_code, product_barcode, ord desc
  )
  insert into public.van_stock_baselines
    (baseline_id, employee_code, product_barcode, qty, updated_at)
  select p_baseline_id, employee_code, product_barcode, qty, now()
  from deduplicated;
  get diagnostics v_imported_rows = row_count;

  v_result := public.rebuild_van_stocks_from_baseline(
    p_baseline_id, p_cutoff, v_employee_codes
  );

  return v_result || jsonb_build_object(
    'imported_baseline_rows', v_imported_rows,
    'preserved_s260401018_used', not exists (
      select 1 from public.van_stock_baselines
      where baseline_id = p_baseline_id
        and lower(employee_code) = lower('S260401018')
    )
  );
end;
$$;

revoke all on function public.import_van_stock_baseline(text, jsonb, timestamptz) from public;
grant execute on function public.import_van_stock_baseline(text, jsonb, timestamptz)
  to anon, authenticated, service_role;

revoke all on function public.rebuild_van_stocks_from_baseline(text, timestamptz, text[])
  from public, anon, authenticated;
grant execute on function public.rebuild_van_stocks_from_baseline(text, timestamptz, text[])
  to service_role;
