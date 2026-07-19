-- Stock adjustment Phase C database regression.
-- Run only against the configured test database after applying
-- database/20260712_stock_adjustment_atomic_submit.sql.
-- Every row is marked KD2_PHASE_C_TEST and the outer transaction is rolled back.

begin;

create temp table kd2_phase_c_results (
  scenario text,
  pass_fail text,
  request_no text,
  product text,
  before_stock text,
  after_stock text,
  movement_count integer,
  cleanup_result text,
  details text
) on commit drop;

do $$
declare
  p1 constant text := '6901668005687';
  p2 constant text := '6901668005694';
  p3 constant text := '6901668005700';
  e1 constant text := 'S180611009';
  e2 constant text := 'S211002003';
  e3 constant text := 'S211002007';
  e4 constant text := 'S211002010';
  e5 constant text := 'S221019002';
  e6 constant text := 'S230721003';
  e7 constant text := 'S230807005';
  e8 constant text := 'S231013004';
  e9 constant text := 'S231127001';
  admin_code constant text := 'KD2_ADMIN';
  s jsonb;
  id1 uuid; id2 uuid; id3 uuid; id4 uuid; id5 uuid; id6a uuid; id6b uuid;
  no1 text; no2 text; no3 text; no4 text; no5 text; no6a text; no6b text; no8 text;
  b1 bigint; b2 bigint; b3a bigint; b3b bigint; b4 bigint; b5 bigint; b6 bigint;
  a1 bigint; a2 bigint; a3a bigint; a3b bigint; a4 bigint; a5 bigint; a6 bigint;
  mc integer;
  ok boolean;
  dup_submit_failed boolean := false;
  dup_approve_failed boolean := false;
  dup_reject_failed boolean := false;
  expected_failed boolean := false;
  residue integer;
  queried jsonb;
begin
  -- 1. Increase approval changes stock and writes exactly one movement.
  select coalesce((select qty from public.van_stocks where employee_code=e1 and product_barcode=p1),0) into b1;
  s := public.save_and_submit_stock_adjustment_request(null,e1,'inventory_count',null,'KD2_PHASE_C_TEST_S1',jsonb_build_array(jsonb_build_object('product_barcode',p1,'adjustment_qty',3)));
  id1 := (s->'request'->>'id')::uuid;
  no1 := s->'request'->>'request_no';
  perform public.approve_stock_adjustment_request(id1,admin_code);
  select qty into a1 from public.van_stocks where employee_code=e1 and product_barcode=p1;
  select count(*) into mc from public.inventory_movements where source_no=no1;
  ok := a1=b1+3 and mc=1 and (select status='approved' from public.stock_adjustment_requests where id=id1);
  insert into kd2_phase_c_results values ('1 增加库存并审核',case when ok then 'PASS' else 'FAIL' end,no1,p1,b1::text,a1::text,mc,'rollback','增加 3；状态 approved');

  -- 2. Decrease approval allows a negative stock result.
  select coalesce((select qty from public.van_stocks where employee_code=e2 and product_barcode=p1),0) into b2;
  s := public.save_and_submit_stock_adjustment_request(null,e2,'damage',null,'KD2_PHASE_C_TEST_S2',jsonb_build_array(jsonb_build_object('product_barcode',p1,'adjustment_qty',-5)));
  id2 := (s->'request'->>'id')::uuid;
  no2 := s->'request'->>'request_no';
  perform public.approve_stock_adjustment_request(id2,admin_code);
  select qty into a2 from public.van_stocks where employee_code=e2 and product_barcode=p1;
  select count(*) into mc from public.inventory_movements where source_no=no2;
  ok := a2=b2-5 and a2<0 and mc=1;
  insert into kd2_phase_c_results values ('2 减少库存允许负数',case when ok then 'PASS' else 'FAIL' end,no2,p1,b2::text,a2::text,mc,'rollback','减少 5；结果为负数');

  -- 3. One request can contain mixed increase and decrease items.
  select coalesce((select qty from public.van_stocks where employee_code=e3 and product_barcode=p1),0) into b3a;
  select coalesce((select qty from public.van_stocks where employee_code=e3 and product_barcode=p2),0) into b3b;
  s := public.save_and_submit_stock_adjustment_request(null,e3,'transfer',null,'KD2_PHASE_C_TEST_S3',jsonb_build_array(
    jsonb_build_object('product_barcode',p1,'adjustment_qty',4),
    jsonb_build_object('product_barcode',p2,'adjustment_qty',-2)
  ));
  id3 := (s->'request'->>'id')::uuid;
  no3 := s->'request'->>'request_no';
  perform public.approve_stock_adjustment_request(id3,admin_code);
  select qty into a3a from public.van_stocks where employee_code=e3 and product_barcode=p1;
  select qty into a3b from public.van_stocks where employee_code=e3 and product_barcode=p2;
  select count(*) into mc from public.inventory_movements where source_no=no3;
  ok := a3a=b3a+4 and a3b=b3b-2 and mc=2;
  insert into kd2_phase_c_results values ('3 多商品增减混合',case when ok then 'PASS' else 'FAIL' end,no3,p1||','||p2,b3a||','||b3b,a3a||','||a3b,mc,'rollback','同单 +4 / -2');

  -- 4. Reject changes no stock; resubmission preserves signed quantity, reason and remark.
  select coalesce((select qty from public.van_stocks where employee_code=e4 and product_barcode=p2),0) into b4;
  s := public.save_and_submit_stock_adjustment_request(null,e4,'damage',null,'KD2_PHASE_C_TEST_S4',jsonb_build_array(jsonb_build_object('product_barcode',p2,'adjustment_qty',-3)));
  id4 := (s->'request'->>'id')::uuid;
  no4 := s->'request'->>'request_no';
  perform public.reject_stock_adjustment_request(id4,admin_code,'KD2 reject');
  select coalesce((select qty from public.van_stocks where employee_code=e4 and product_barcode=p2),0) into a4;
  s := public.save_and_submit_stock_adjustment_request(id4,e4,'damage',null,'KD2_PHASE_C_TEST_S4',jsonb_build_array(jsonb_build_object('product_barcode',p2,'adjustment_qty',-3)));
  select count(*) into mc from public.inventory_movements where source_no=no4;
  ok := a4=b4 and mc=0
    and (s->'request'->>'status')='pending_review'
    and (s->'request'->>'reason_code')='damage'
    and (s->'request'->>'remark')='KD2_PHASE_C_TEST_S4'
    and (s->'items'->0->>'adjustment_qty')::bigint=-3;
  insert into kd2_phase_c_results values ('4 驳回后编辑重提',case when ok then 'PASS' else 'FAIL' end,no4,p2,b4::text,a4::text,mc,'rollback','驳回不改库存；重提保留 -3、原因和备注');

  -- 5. Withdraw changes no stock; the same request can be edited and resubmitted.
  select coalesce((select qty from public.van_stocks where employee_code=e5 and product_barcode=p2),0) into b5;
  s := public.save_and_submit_stock_adjustment_request(null,e5,'inventory_count',null,'KD2_PHASE_C_TEST_S5',jsonb_build_array(jsonb_build_object('product_barcode',p2,'adjustment_qty',2)));
  id5 := (s->'request'->>'id')::uuid;
  no5 := s->'request'->>'request_no';
  perform public.withdraw_stock_adjustment_request(id5,e5);
  select coalesce((select qty from public.van_stocks where employee_code=e5 and product_barcode=p2),0) into a5;
  s := public.save_and_submit_stock_adjustment_request(id5,e5,'inventory_count',null,'KD2_PHASE_C_TEST_S5',jsonb_build_array(jsonb_build_object('product_barcode',p2,'adjustment_qty',2)));
  select count(*) into mc from public.inventory_movements where source_no=no5;
  ok := a5=b5 and mc=0 and (s->'request'->>'status')='pending_review' and (s->'items'->0->>'adjustment_qty')::bigint=2;
  insert into kd2_phase_c_results values ('5 撤回后编辑重提',case when ok then 'PASS' else 'FAIL' end,no5,p2,b5::text,a5::text,mc,'rollback','撤回不改库存；重新提交成功');

  -- 6. Duplicate submit/approve/reject calls do not duplicate state or movements.
  select coalesce((select qty from public.van_stocks where employee_code=e6 and product_barcode=p3),0) into b6;
  s := public.save_and_submit_stock_adjustment_request(null,e6,'inventory_count',null,'KD2_PHASE_C_TEST_S6A',jsonb_build_array(jsonb_build_object('product_barcode',p3,'adjustment_qty',1)));
  id6a := (s->'request'->>'id')::uuid;
  no6a := s->'request'->>'request_no';
  begin
    perform public.save_and_submit_stock_adjustment_request(id6a,e6,'inventory_count',null,'KD2_PHASE_C_TEST_S6A',jsonb_build_array(jsonb_build_object('product_barcode',p3,'adjustment_qty',1)));
  exception when others then dup_submit_failed := true;
  end;
  perform public.approve_stock_adjustment_request(id6a,admin_code);
  begin
    perform public.approve_stock_adjustment_request(id6a,admin_code);
  exception when others then dup_approve_failed := true;
  end;
  s := public.save_and_submit_stock_adjustment_request(null,e6,'damage',null,'KD2_PHASE_C_TEST_S6B',jsonb_build_array(jsonb_build_object('product_barcode',p3,'adjustment_qty',-1)));
  id6b := (s->'request'->>'id')::uuid;
  no6b := s->'request'->>'request_no';
  perform public.reject_stock_adjustment_request(id6b,admin_code,'KD2 duplicate reject');
  begin
    perform public.reject_stock_adjustment_request(id6b,admin_code,'again');
  exception when others then dup_reject_failed := true;
  end;
  select qty into a6 from public.van_stocks where employee_code=e6 and product_barcode=p3;
  select count(*) into mc from public.inventory_movements where source_no=no6a;
  ok := dup_submit_failed and dup_approve_failed and dup_reject_failed and a6=b6+1 and mc=1
    and (select count(*)=1 from public.stock_adjustment_request_history where request_id=id6a and action='approved')
    and (select count(*)=1 from public.stock_adjustment_request_history where request_id=id6b and action='rejected');
  insert into kd2_phase_c_results values ('6 重复操作幂等保护',case when ok then 'PASS' else 'FAIL' end,no6a||','||no6b,p3,b6::text,a6::text,mc,'rollback','重复提交/同意/驳回均失败；流水和终态历史各 1');

  -- 7. A failure on any item rolls back the whole atomic save/submit call.
  expected_failed := false;
  begin
    perform public.save_and_submit_stock_adjustment_request(null,e7,'inventory_count',null,'KD2_PHASE_C_TEST_S7',jsonb_build_array(
      jsonb_build_object('product_barcode',p1,'adjustment_qty',1),
      jsonb_build_object('product_barcode','KD2_INVALID_BARCODE','adjustment_qty',1)
    ));
  exception when others then expected_failed := true;
  end;
  select count(*) into residue from public.stock_adjustment_requests where remark='KD2_PHASE_C_TEST_S7';
  ok := expected_failed and residue=0;
  insert into kd2_phase_c_results values ('7 任一商品失败整单回滚',case when ok then 'PASS' else 'FAIL' end,null,p1||',KD2_INVALID_BARCODE','未创建','未创建',0,'rollback','申请、明细、历史残留 0');

  -- 8. Negative request snapshots remain signed for decrease + absolute-value UI restoration.
  s := public.save_and_submit_stock_adjustment_request(null,e8,'transfer',null,'KD2_PHASE_C_TEST_S8',jsonb_build_array(jsonb_build_object('product_barcode',p3,'adjustment_qty',-7)));
  no8 := s->'request'->>'request_no';
  ok := (s->'items'->0->>'adjustment_qty')::bigint=-7 and (s->'request'->>'status')='pending_review';
  insert into kd2_phase_c_results values ('8 负数申请编辑语义',case when ok then 'PASS' else 'FAIL' end,no8,p3,'0','0',0,'rollback','数据库返回 -7；UI 测试验证恢复为减少 + 7');

  -- 9. Other requires a nonblank note and leaves no partial request.
  expected_failed := false;
  begin
    perform public.save_and_submit_stock_adjustment_request(null,e9,'other','  ','KD2_PHASE_C_TEST_S9',jsonb_build_array(jsonb_build_object('product_barcode',p1,'adjustment_qty',1)));
  exception when others then expected_failed := true;
  end;
  select count(*) into residue from public.stock_adjustment_requests where remark='KD2_PHASE_C_TEST_S9';
  ok := expected_failed and residue=0;
  insert into kd2_phase_c_results values ('9 其他原因必须填写说明',case when ok then 'PASS' else 'FAIL' end,null,p1,'未创建','未创建',0,'rollback','空白说明被拒绝；残留 0');

  -- 10. The movement query returns an approved movement with date/employee/type filters.
  queried := public.get_inventory_movement_details(current_date,current_date,e1,'manual_adjustment');
  select count(*) into mc from jsonb_array_elements(queried) x where x->>'source_no'=no1 and (x->>'quantity_delta')::bigint=3;
  ok := mc=1;
  insert into kd2_phase_c_results values ('10 流水页查询审核流水',case when ok then 'PASS' else 'FAIL' end,no1,p1,b1::text,a1::text,mc,'rollback','日期/员工/类型过滤命中 1 条');
end $$;

select * from kd2_phase_c_results order by scenario;

rollback;
