-- Dashboard export: one database query using the date and employee filters selected in the UI.
create or replace function public.get_dashboard_export_order_items(
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_employee_code text default null
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'order_no', o.order_no,
        'created_at', o.created_at,
        'employee_code', o.employee_code,
        'employee_name', e.name,
        'atom_code', o.atom_code,
        'store_name', o.store_name,
        'barcode', i.barcode,
        'product_name', i.product_name,
        'qty', i.qty,
        'unit_price', i.unit_price,
        'amount', i.amount,
        'sale_unit', i.sale_unit,
        'sale_qty', i.sale_qty,
        'sale_unit_price', i.sale_unit_price,
        'name', p.name,
        'spec', p.spec,
        'flavor', p.flavor,
        'pcs_per_box', p.pcs_per_box
      )
      order by o.created_at, i.id
    ),
    '[]'::jsonb
  )
  from public.sales_order_items i
  join public.sales_orders o on o.order_no = i.order_no
  left join public.employees e on e.employee_code = o.employee_code
  left join public.products p on p.barcode = i.barcode
  where (p_start_at is null or o.created_at >= p_start_at)
    and (p_end_at is null or o.created_at <= p_end_at)
    and (p_employee_code is null or o.employee_code = p_employee_code);
$$;

revoke all on function public.get_dashboard_export_order_items(timestamptz, timestamptz, text) from public;
grant execute on function public.get_dashboard_export_order_items(timestamptz, timestamptz, text) to anon, authenticated;
