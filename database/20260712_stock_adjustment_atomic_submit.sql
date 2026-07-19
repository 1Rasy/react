-- Phase C stabilization: save and submit a stock adjustment in one RPC transaction.
create or replace function public.save_and_submit_stock_adjustment_request(
  p_request_id uuid,
  p_employee_code text,
  p_reason_code text,
  p_reason_note text,
  p_remark text,
  p_items jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_saved jsonb;
  v_request_id uuid;
begin
  if p_reason_code not in ('inventory_count','damage','transfer','other') then
    raise exception 'invalid reason';
  end if;
  if p_reason_code = 'other' and coalesce(trim(p_reason_note),'') = '' then
    raise exception 'reason note is required';
  end if;

  v_saved := public.save_stock_adjustment_request(
    p_request_id,
    p_employee_code,
    p_reason_code,
    p_reason_note,
    p_remark,
    p_items
  );
  v_request_id := nullif(v_saved->'request'->>'id','')::uuid;
  if v_request_id is null then
    raise exception 'saved request id is required';
  end if;

  return public.submit_stock_adjustment_request(v_request_id, p_employee_code);
end; $$;

revoke all on function public.save_and_submit_stock_adjustment_request(uuid,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_and_submit_stock_adjustment_request(uuid,text,text,text,text,jsonb) to anon, authenticated;
