-- Correct inventory model:
--   zero opening stock at 2026-07-01 00:00:00+08
--   current stock = 0 - all sales order quantities on/after the cutoff
-- Raw dealer outbound imports are retained as source records only and never change van_stocks.

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

  insert into public.van_stocks (
    employee_code,
    product_barcode,
    qty,
    updated_at
  )
  select
    so.employee_code,
    soi.barcode,
    -sum(coalesce(soi.qty, 0))::bigint,
    now()
  from public.sales_orders so
  join public.sales_order_items soi
    on soi.order_no = so.order_no
  where so.created_at >= p_cutoff
  group by so.employee_code, soi.barcode;
  get diagnostics v_written_rows = row_count;

  select coalesce(sum(vs.qty), 0)::bigint
    into v_total_qty
  from public.van_stocks vs;

  return jsonb_build_object(
    'cutoff', p_cutoff,
    'deleted_old_stock_rows', v_deleted_rows,
    'written_order_stock_rows', v_written_rows,
    'total_stock_qty', v_total_qty
  );
end;
$$;

comment on function public.rebuild_van_stocks_from_orders(timestamptz) is
  'Idempotently replaces all current van stock with zero baseline minus every sales order item on/after the cutoff.';

revoke all on function public.rebuild_van_stocks_from_orders(timestamptz)
from public, anon, authenticated;

create or replace function public.process_dealer_stock_final()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
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

  -- Store the raw source row without changing inventory.
  NEW.is_processed := false;
  return NEW;
end;
$$;

create or replace function public.sync_van_stock_from_outbounds()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  -- Deliberate no-op. raw_dealer_outbounds must never change van_stocks.
  return null;
end;
$$;

revoke all on function public.sync_van_stock_from_outbounds()
from public, anon, authenticated;

-- Disable the incorrectly introduced baseline import path for public clients.
revoke all on function public.import_van_stock_baseline(text, jsonb, timestamptz)
from public, anon, authenticated;
revoke all on function public.rebuild_van_stocks_from_baseline(text, timestamptz, text[])
from public, anon, authenticated;
revoke insert, update, delete on public.van_stock_baselines
from anon, authenticated;

drop policy if exists van_stock_baselines_public_access on public.van_stock_baselines;
drop policy if exists van_stock_baselines_public_read on public.van_stock_baselines;
create policy van_stock_baselines_public_read
on public.van_stock_baselines
for select
to anon, authenticated
using (true);

select public.rebuild_van_stocks_from_orders(
  timestamptz '2026-07-01 00:00:00+08'
);
