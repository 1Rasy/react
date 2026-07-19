-- Follow-up hardening for the 2026-07-01 inventory baseline flow.

alter table public.van_stock_baselines enable row level security;

drop policy if exists van_stock_baselines_public_access on public.van_stock_baselines;
create policy van_stock_baselines_public_access
on public.van_stock_baselines
for all
to anon, authenticated
using (true)
with check (true);

alter function public.inventory_stock_effective_from() set search_path = pg_catalog, public;
alter function public.try_parse_inventory_date(text) set search_path = pg_catalog, public;
alter function public.rebuild_van_stocks_from_baseline(text, timestamptz, text[]) set search_path = pg_catalog, public;
alter function public.import_van_stock_baseline(text, jsonb, timestamptz) set search_path = pg_catalog, public;
alter function public.process_dealer_stock_final() set search_path = pg_catalog, public;
alter function public.sync_van_stock_from_outbounds() set search_path = pg_catalog, public;
alter function public.submit_sales_order_v4(text, text, text, text, numeric, jsonb) set search_path = pg_catalog, public;
alter function public.sync_van_stock_on_order_change_v4() set search_path = pg_catalog, public;

revoke execute on function public.sync_van_stock_from_outbounds() from public, anon, authenticated;

create index if not exists idx_van_stock_baselines_employee_code
  on public.van_stock_baselines (employee_code);

create index if not exists idx_van_stock_baselines_product_barcode
  on public.van_stock_baselines (product_barcode);

create index if not exists idx_sales_orders_employee_created_order
  on public.sales_orders (employee_code, created_at, order_no);

create index if not exists idx_sales_order_items_order_barcode
  on public.sales_order_items (order_no, barcode);

create index if not exists idx_sales_order_items_barcode
  on public.sales_order_items (barcode);
