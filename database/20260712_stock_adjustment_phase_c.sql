-- Phase C: manual stock adjustment requests and the first unified inventory ledger source.
create sequence if not exists public.stock_adjustment_request_no_seq;

create table if not exists public.stock_adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique default ('SA' || to_char(now() at time zone 'Asia/Shanghai','YYYYMMDD') || lpad(nextval('public.stock_adjustment_request_no_seq')::text, 6, '0')),
  employee_code text not null references public.employees(employee_code),
  status text not null default 'draft' check (status in ('draft','pending_review','rejected','withdrawn','approved')),
  version integer not null default 0 check (version >= 0),
  reason_code text not null check (reason_code in ('inventory_count','damage','transfer','missed_receipt','other')),
  reason_note text,
  remark text,
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  reviewed_at timestamptz,
  reviewer_code text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_adjustment_request_items (
  id bigserial primary key,
  request_id uuid not null references public.stock_adjustment_requests(id) on delete cascade,
  product_barcode text not null references public.products(barcode),
  adjustment_qty bigint not null check (adjustment_qty <> 0),
  created_at timestamptz not null default now(),
  unique (request_id, product_barcode)
);

create table if not exists public.stock_adjustment_request_history (
  id bigserial primary key,
  request_id uuid not null references public.stock_adjustment_requests(id),
  action text not null check (action in ('created','saved','submitted','resubmitted','withdrawn','rejected','approved')),
  actor_code text not null,
  rejection_reason text,
  request_version integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references public.employees(employee_code),
  product_barcode text not null references public.products(barcode),
  movement_type text not null,
  source_no text not null,
  reason_code text,
  reason_display text not null,
  quantity_delta bigint not null check (quantity_delta <> 0),
  quantity_before bigint not null,
  quantity_after bigint not null,
  occurred_at timestamptz not null default now(),
  operator_code text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create unique index if not exists stock_adjustment_one_pending_per_employee
  on public.stock_adjustment_requests(employee_code) where status = 'pending_review';
create index if not exists stock_adjustment_pending_queue_idx on public.stock_adjustment_requests(submitted_at) where status = 'pending_review';
create index if not exists inventory_movements_filter_idx on public.inventory_movements(occurred_at, employee_code, movement_type);

create or replace function public.prevent_inventory_movement_mutation()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin raise exception 'inventory movements are immutable'; end; $$;
drop trigger if exists inventory_movements_immutable on public.inventory_movements;
create trigger inventory_movements_immutable before update or delete on public.inventory_movements
for each row execute function public.prevent_inventory_movement_mutation();

create or replace function public.stock_adjustment_snapshot(p_request_id uuid)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'request', (select to_jsonb(r) from public.stock_adjustment_requests r where r.id = p_request_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('product_barcode', i.product_barcode, 'adjustment_qty', i.adjustment_qty) order by i.product_barcode)
                       from public.stock_adjustment_request_items i where i.request_id = p_request_id), '[]'::jsonb)
  );
$$;

create or replace function public.save_stock_adjustment_request(
  p_request_id uuid, p_employee_code text, p_reason_code text, p_reason_note text, p_remark text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid; v_action text; v_item jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'at least one item is required'; end if;
  if p_reason_code not in ('inventory_count','damage','transfer','missed_receipt','other') then raise exception 'invalid reason'; end if;
  if p_reason_code = 'other' and coalesce(trim(p_reason_note),'') = '' then raise exception 'reason note is required'; end if;
  -- adjustment_qty must be an integer before any bigint conversion.
  if exists (select 1 from jsonb_array_elements(p_items) x where coalesce(x->>'adjustment_qty','') !~ '^-?(0|[1-9][0-9]{0,17})$') then raise exception 'adjustment_qty integer is required'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) x where (x->>'adjustment_qty')::bigint = 0) then raise exception 'zero quantity'; end if;
  if p_request_id is null then
    insert into public.stock_adjustment_requests(employee_code, reason_code, reason_note, remark)
    values (p_employee_code, p_reason_code, nullif(trim(p_reason_note),''), nullif(trim(p_remark),'')) returning id into v_id;
    v_action := 'created';
  else
    select id into v_id from public.stock_adjustment_requests
      where id = p_request_id and employee_code = p_employee_code and status in ('draft','rejected','withdrawn') for update;
    if v_id is null then raise exception 'request cannot be edited'; end if;
    update public.stock_adjustment_requests set reason_code=p_reason_code, reason_note=nullif(trim(p_reason_note),''), remark=nullif(trim(p_remark),''), updated_at=now() where id=v_id;
    delete from public.stock_adjustment_request_items where request_id=v_id;
    v_action := 'saved';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.stock_adjustment_request_items(request_id, product_barcode, adjustment_qty)
    values (v_id, trim(v_item->>'product_barcode'), (v_item->>'adjustment_qty')::bigint);
  end loop;
  insert into public.stock_adjustment_request_history(request_id, action, actor_code, request_version, snapshot)
  select v_id, v_action, p_employee_code, version, public.stock_adjustment_snapshot(v_id) from public.stock_adjustment_requests where id=v_id;
  return (select public.stock_adjustment_snapshot(v_id));
end; $$;

create or replace function public.submit_stock_adjustment_request(p_request_id uuid, p_employee_code text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_status text; v_version integer;
begin
  select status, version into v_status, v_version from public.stock_adjustment_requests where id=p_request_id and employee_code=p_employee_code for update;
  if v_status not in ('draft','rejected','withdrawn') then raise exception 'request cannot be submitted'; end if;
  if not exists (select 1 from public.stock_adjustment_request_items where request_id=p_request_id) then raise exception 'at least one item is required'; end if;
  update public.stock_adjustment_requests set status='pending_review', version=version+1, submitted_at=now(), updated_at=now(), rejection_reason=null where id=p_request_id;
  insert into public.stock_adjustment_request_history(request_id,action,actor_code,request_version,snapshot)
  select p_request_id, case when v_version=0 then 'submitted' else 'resubmitted' end, p_employee_code, version, public.stock_adjustment_snapshot(p_request_id) from public.stock_adjustment_requests where id=p_request_id;
  return public.stock_adjustment_snapshot(p_request_id);
exception when unique_violation then raise exception 'single pending request per employee';
end; $$;

create or replace function public.withdraw_stock_adjustment_request(p_request_id uuid, p_employee_code text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.stock_adjustment_requests set status='withdrawn', withdrawn_at=now(), updated_at=now()
  where id=p_request_id and employee_code=p_employee_code and status='pending_review';
  if not found then raise exception 'request cannot be withdrawn'; end if;
  insert into public.stock_adjustment_request_history(request_id,action,actor_code,request_version,snapshot)
  select p_request_id,'withdrawn',p_employee_code,version,public.stock_adjustment_snapshot(p_request_id) from public.stock_adjustment_requests where id=p_request_id;
  return public.stock_adjustment_snapshot(p_request_id);
end; $$;

create or replace function public.reject_stock_adjustment_request(p_request_id uuid, p_admin_code text, p_rejection_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if coalesce(trim(p_rejection_reason),'')='' then raise exception 'rejection reason is required'; end if;
  update public.stock_adjustment_requests set status='rejected', reviewed_at=now(), reviewer_code=p_admin_code, rejection_reason=trim(p_rejection_reason), updated_at=now()
  where id=p_request_id and status='pending_review';
  if not found then raise exception 'request is not pending review'; end if;
  insert into public.stock_adjustment_request_history(request_id,action,actor_code,rejection_reason,request_version,snapshot)
  select p_request_id,'rejected',p_admin_code,rejection_reason,version,public.stock_adjustment_snapshot(p_request_id) from public.stock_adjustment_requests where id=p_request_id;
  return public.stock_adjustment_snapshot(p_request_id);
end; $$;

create or replace function public.approve_stock_adjustment_request(p_request_id uuid, p_admin_code text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_request public.stock_adjustment_requests%rowtype; v_item record; v_before bigint; v_after bigint; v_reason text;
begin
  select * into v_request from public.stock_adjustment_requests where id=p_request_id for update;
  if v_request.status <> 'pending_review' then raise exception 'request is not pending review'; end if;
  v_reason := case v_request.reason_code when 'inventory_count' then '盘点差异' when 'damage' then '破损报废' when 'transfer' then '调货' when 'missed_receipt' then '漏录入库' else coalesce(v_request.reason_note,'其他') end;
  for v_item in select * from public.stock_adjustment_request_items where request_id=p_request_id order by product_barcode loop
    insert into public.van_stocks(employee_code,product_barcode,qty) values(v_request.employee_code,v_item.product_barcode,0) on conflict(employee_code,product_barcode) do nothing;
    select qty into v_before from public.van_stocks where employee_code=v_request.employee_code and product_barcode=v_item.product_barcode for update;
    v_after := v_before + v_item.adjustment_qty;
    update public.van_stocks set qty=v_after, updated_at=now() where employee_code=v_request.employee_code and product_barcode=v_item.product_barcode;
    insert into public.inventory_movements(employee_code,product_barcode,movement_type,source_no,reason_code,reason_display,quantity_delta,quantity_before,quantity_after,occurred_at,operator_code,idempotency_key)
    values(v_request.employee_code,v_item.product_barcode,'manual_adjustment',v_request.request_no,v_request.reason_code,v_reason,v_item.adjustment_qty,v_before,v_after,now(),p_admin_code,p_request_id::text||':'||v_request.version::text||':'||v_item.product_barcode);
  end loop;
  update public.stock_adjustment_requests set status = 'approved', reviewed_at=now(), reviewer_code=p_admin_code, updated_at=now() where id=p_request_id;
  insert into public.stock_adjustment_request_history(request_id,action,actor_code,request_version,snapshot)
  select p_request_id,'approved',p_admin_code,version,public.stock_adjustment_snapshot(p_request_id) from public.stock_adjustment_requests where id=p_request_id;
  return public.stock_adjustment_snapshot(p_request_id);
end; $$;

create or replace function public.get_my_stock_adjustment_requests(p_employee_code text, p_include_history boolean default false)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('request',to_jsonb(r),'items',coalesce(i.items,'[]'::jsonb),'history',coalesce(h.history,'[]'::jsonb)) order by r.updated_at desc),'[]'::jsonb)
  from public.stock_adjustment_requests r
  left join lateral (select jsonb_agg(jsonb_build_object('product_barcode',x.product_barcode,'adjustment_qty',x.adjustment_qty,'product_name',p.name,'spec',p.spec,'flavor',p.flavor) order by x.product_barcode) items from public.stock_adjustment_request_items x join public.products p on p.barcode=x.product_barcode where x.request_id=r.id) i on true
  left join lateral (select jsonb_agg(to_jsonb(x) order by x.created_at) history from public.stock_adjustment_request_history x where x.request_id=r.id) h on p_include_history
  where r.employee_code=p_employee_code and (p_include_history or r.status in ('pending_review','rejected','draft','withdrawn'));
$$;

create or replace function public.get_pending_stock_adjustment_requests()
returns jsonb language sql security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('request',to_jsonb(r),'items',coalesce(i.items,'[]'::jsonb),'stocks',coalesce(s.stocks,'[]'::jsonb)) order by r.submitted_at asc),'[]'::jsonb)
  from public.stock_adjustment_requests r
  left join lateral (select jsonb_agg(jsonb_build_object('product_barcode',x.product_barcode,'adjustment_qty',x.adjustment_qty,'product_name',p.name,'spec',p.spec,'flavor',p.flavor) order by x.product_barcode) items from public.stock_adjustment_request_items x join public.products p on p.barcode=x.product_barcode where x.request_id=r.id) i on true
  left join lateral (select jsonb_agg(jsonb_build_object('product_barcode',x.product_barcode,'qty',coalesce(v.qty,0)) order by x.product_barcode) stocks from public.stock_adjustment_request_items x left join public.van_stocks v on v.employee_code=r.employee_code and v.product_barcode=x.product_barcode where x.request_id=r.id) s on true
  where r.status='pending_review';
$$;

create or replace function public.get_inventory_movement_details(p_start_date date, p_end_date date, p_employee_code text default null, p_movement_type text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_start timestamptz := p_start_date::timestamp at time zone 'Asia/Shanghai'; v_end_exclusive timestamptz := (p_end_date + 1)::timestamp at time zone 'Asia/Shanghai';
begin
  return (select coalesce(jsonb_agg(to_jsonb(q) order by q.occurred_at desc),'[]'::jsonb) from (
    select m.*, p.spec, p.flavor from public.inventory_movements m join public.products p on p.barcode=m.product_barcode
    where m.occurred_at >= v_start and m.occurred_at < v_end_exclusive and (p_employee_code is null or m.employee_code=p_employee_code) and (p_movement_type is null or m.movement_type=p_movement_type)
  ) q);
end; $$;

alter table public.stock_adjustment_requests enable row level security;
alter table public.stock_adjustment_request_items enable row level security;
alter table public.stock_adjustment_request_history enable row level security;
alter table public.inventory_movements enable row level security;
revoke all on public.stock_adjustment_requests, public.stock_adjustment_request_items, public.stock_adjustment_request_history, public.inventory_movements from anon, authenticated;
revoke all on function public.save_stock_adjustment_request(uuid,text,text,text,text,jsonb), public.submit_stock_adjustment_request(uuid,text), public.withdraw_stock_adjustment_request(uuid,text), public.reject_stock_adjustment_request(uuid,text,text), public.approve_stock_adjustment_request(uuid,text), public.get_my_stock_adjustment_requests(text,boolean), public.get_pending_stock_adjustment_requests(), public.get_inventory_movement_details(date,date,text,text) from public, anon, authenticated;
grant execute on function public.save_stock_adjustment_request(uuid,text,text,text,text,jsonb), public.submit_stock_adjustment_request(uuid,text), public.withdraw_stock_adjustment_request(uuid,text), public.reject_stock_adjustment_request(uuid,text,text), public.approve_stock_adjustment_request(uuid,text), public.get_my_stock_adjustment_requests(text,boolean), public.get_pending_stock_adjustment_requests(), public.get_inventory_movement_details(date,date,text,text) to anon, authenticated;

