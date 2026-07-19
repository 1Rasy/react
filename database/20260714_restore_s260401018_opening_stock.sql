-- Preserve the original 68 stock rows for S260401018 as the only opening-stock exception.
-- All other employees continue to use a zero opening balance from 2026-07-01.
-- Current stock formula:
--   S260401018: preserved opening stock - all sales since 2026-07-01
--   everyone else: 0 - all sales since 2026-07-01

-- The production migration copied these rows from the protected pre-reset backup:
-- backup_inventory_reset_20260714.van_stocks

delete from public.van_stock_baselines
where baseline_id = 'preserved-s260401018-pre-reset';

insert into public.van_stock_baselines (
  baseline_id,
  employee_code,
  product_barcode,
  qty,
  updated_at
)
select
  'preserved-s260401018-pre-reset',
  employee_code,
  product_barcode,
  qty,
  now()
from backup_inventory_reset_20260714.van_stocks
where lower(employee_code) = lower('S260401018');

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

  with opening as (
    select
      b.employee_code,
      b.product_barcode,
      sum(b.qty)::bigint as opening_qty
    from public.van_stock_baselines b
    where b.baseline_id = 'preserved-s260401018-pre-reset'
    group by b.employee_code, b.product_barcode
  ),
  sold as (
    select
      so.employee_code,
      soi.barcode as product_barcode,
      sum(coalesce(soi.qty, 0))::bigint as sold_qty
    from public.sales_orders so
    join public.sales_order_items soi
      on soi.order_no = so.order_no
    where so.created_at >= p_cutoff
    group by so.employee_code, soi.barcode
  ),
  stock_keys as (
    select employee_code, product_barcode from opening
    union
    select employee_code, product_barcode from sold
  )
  insert into public.van_stocks (
    employee_code,
    product_barcode,
    qty,
    updated_at
  )
  select
    k.employee_code,
    k.product_barcode,
    coalesce(o.opening_qty, 0) - coalesce(s.sold_qty, 0),
    now()
  from stock_keys k
  left join opening o
    on o.employee_code = k.employee_code
   and o.product_barcode = k.product_barcode
  left join sold s
    on s.employee_code = k.employee_code
   and s.product_barcode = k.product_barcode;
  get diagnostics v_written_rows = row_count;

  select coalesce(sum(vs.qty), 0)::bigint
    into v_total_qty
  from public.van_stocks vs;

  return jsonb_build_object(
    'cutoff', p_cutoff,
    'preserved_opening_employee', 'S260401018',
    'deleted_stock_rows', v_deleted_rows,
    'written_stock_rows', v_written_rows,
    'total_stock_qty', v_total_qty
  );
end;
$$;

comment on function public.rebuild_van_stocks_from_orders(timestamptz) is
  'Rebuilds stock from all orders on/after the cutoff, preserving the original 68 opening-stock rows for S260401018 only.';

select public.rebuild_van_stocks_from_orders(
  timestamptz '2026-07-01 00:00:00+08'
);
