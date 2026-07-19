-- Phase C admin review history: expose completed reviews through one read-only RPC.
create or replace function public.get_stock_adjustment_review_history(p_limit integer default 100)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'request', to_jsonb(r),
        'items', coalesce(i.items, '[]'::jsonb)
      )
      order by r.reviewed_at desc nulls last, r.updated_at desc
    ),
    '[]'::jsonb
  )
  from (
    select *
    from public.stock_adjustment_requests
    where status in ('approved', 'rejected')
    order by reviewed_at desc nulls last, updated_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) r
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'product_barcode', x.product_barcode,
        'adjustment_qty', x.adjustment_qty,
        'product_name', p.name,
        'spec', p.spec,
        'flavor', p.flavor
      )
      order by x.product_barcode
    ) items
    from public.stock_adjustment_request_items x
    join public.products p on p.barcode = x.product_barcode
    where x.request_id = r.id
  ) i on true;
$$;

revoke all on function public.get_stock_adjustment_review_history(integer) from public, anon, authenticated;
grant execute on function public.get_stock_adjustment_review_history(integer) to anon, authenticated;
