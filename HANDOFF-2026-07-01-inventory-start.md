# 2026-07-01 库存正式启用交接文档

生成时间：2026-07-02
仓库：`1Rasy/spr`
Supabase 项目：`wyjbnnqhiehjccmojbbg`

## 背景

项目在 2026-07-01 之前已经用于小范围测试，系统内已经产生大量订单，但历史库存没有准确初始化。因此 2026-07-01 之前的订单只保留用于查看，不参与正式库存扣减。

正式库存口径从 `2026-07-01 00:00:00+08` 开始：

```text
当前库存 = 2026-07-01 开单前初始库存 - 2026-07-01 之后订单销量
```

## 当前页面行为

### `stock_summary.html`

GitHub main 上的 `stock_summary.html` 有 `导入库存` 按钮。

当前导入格式：

```text
A列员工编号，B列条码，C列库存散数
```

当前行为：

- 按 `employee_code + product_barcode` 写入 `van_stocks`
- 使用 `upsert(..., { onConflict: 'employee_code,product_barcode' })`
- 导入的 `qty` 会直接覆盖 `van_stocks.qty`
- 这个入口适合用于“库存余额导入 / 盘点覆盖 / 初始库存导入”
- 这个入口不是增量入库，也不是增减库存

### `stock_jn.html` / `stock_ct.html`

吉能和长涛库存导入入口不是直接覆盖 `van_stocks`。

当前行为：

- 页面把 Excel 解析结果写入 `raw_dealer_outbounds`
- 使用 `import_uid` 去重
- 数据库触发器 `trig_execute_dealer_stock_final` 在 `raw_dealer_outbounds` 插入前执行
- 触发器调用 `process_dealer_stock_final()`
- 该函数会根据客户员工映射、商品条码和箱规折算后，把数量累加进 `van_stocks`

结论：

```text
stock_summary = 覆盖库存余额
stock_jn / stock_ct = 通过 raw_dealer_outbounds 增量影响库存
```

## 当前数据库关联点

只读检查确认当前线上触发器包括：

```text
raw_dealer_outbounds BEFORE INSERT -> process_dealer_stock_final()
sales_order_items AFTER DELETE -> sync_van_stock_on_order_change_v4()
```

注意：`sync_van_stock_on_order_change_v4()` 当前在删除订单明细时会把库存加回，逻辑没有区分 2026-07-01 前后的订单。因此正式修复时要避免删除 7.1 前历史订单导致库存被错误恢复。

## 推荐正式方案

保留 `stock_summary.html` 的覆盖导入能力，但把业务口径明确成“导入 2026-07-01 开单前初始库存”。导入完成后执行一次幂等重算：

```text
van_stocks.qty = imported_baseline.qty - post_0701_sales_qty
```

这里的 `post_0701_sales_qty` 只统计：

```sql
sales_orders.created_at >= timestamptz '2026-07-01 00:00:00+08'
```

不要做成简单的：

```sql
update van_stocks set qty = qty - 已售数量;
```

原因是这种写法不幂等，重复执行会重复扣库存。

## 建议实现方式

### 1. 建立初始库存基准表

建议新增一张表保存 2026-07-01 初始库存，例如：

```sql
create table if not exists public.van_stock_baselines (
  baseline_id text not null,
  employee_code text not null,
  product_barcode text not null,
  qty numeric not null default 0,
  created_at timestamptz not null default now(),
  primary key (baseline_id, employee_code, product_barcode)
);
```

建议固定本次正式库存基准批次：

```text
baseline_id = 2026-07-01-opening
```

### 2. 导入后保存基准库存

`stock_summary` 导入 2026-07-01 开单前库存时，不仅覆盖 `van_stocks`，还应把同一批数据保存到 `van_stock_baselines`。

### 3. 执行幂等重算

重算逻辑按员工和条码聚合 7.1 后订单销量，再用基准库存减销量。

核心公式：

```text
current_qty = baseline_qty - sold_qty_after_2026_07_01
```

建议封装成数据库函数，例如：

```sql
create or replace function public.rebuild_van_stocks_from_baseline(
  p_baseline_id text,
  p_cutoff timestamptz default timestamptz '2026-07-01 00:00:00+08'
)
returns void
language plpgsql
as $$
begin
  -- 先把基准库存对应员工/条码重算后写回 van_stocks。
  with sold as (
    select
      so.employee_code,
      soi.barcode as product_barcode,
      sum(coalesce(soi.qty, 0)) as sold_qty
    from public.sales_order_items soi
    join public.sales_orders so on so.order_no = soi.order_no
    where so.created_at >= p_cutoff
    group by so.employee_code, soi.barcode
  ), target as (
    select
      b.employee_code,
      b.product_barcode,
      b.qty - coalesce(s.sold_qty, 0) as qty
    from public.van_stock_baselines b
    left join sold s
      on s.employee_code = b.employee_code
     and s.product_barcode = b.product_barcode
    where b.baseline_id = p_baseline_id
  )
  insert into public.van_stocks (employee_code, product_barcode, qty, updated_at)
  select employee_code, product_barcode, qty, now()
  from target
  on conflict (employee_code, product_barcode)
  do update set
    qty = excluded.qty,
    updated_at = now();
end;
$$;
```

后续执行：

```sql
select public.rebuild_van_stocks_from_baseline(
  '2026-07-01-opening',
  timestamptz '2026-07-01 00:00:00+08'
);
```

## 需要特别处理的风险

### 1. 不要删除库存表

不能用下面这类操作：

```sql
truncate van_stocks cascade;
drop table van_stocks cascade;
```

原因：数据库里存在订单、库存和触发器关联，级联操作有删除订单或破坏关联的风险。

### 2. 不要直接清空订单

2026-07-01 前订单仍然需要保留查看，只是不参与正式库存计算。

### 3. 订单删除恢复库存要加时间判断

当前 `sales_order_items AFTER DELETE` 触发器会恢复库存，但没有判断订单时间。正式修复建议改成：

```text
只有被删除订单的 sales_orders.created_at >= 2026-07-01 00:00:00+08 时，才恢复库存。
```

否则删除 7.1 前测试订单时会错误增加库存。

### 4. 重算必须幂等

库存重算必须能重复执行，不能因为多点一次按钮就重复扣库存。

正确口径：

```text
基准库存 - 7.1 后订单聚合销量
```

错误口径：

```text
当前库存 - 7.1 后订单聚合销量
```

## 已做案例验证：`S260401018`

曾用员工编号 `S260401018` 做过零基准测试：

- 对该员工库存做过快照
- 快照批次：`reset_case_S260401018_20260702_zero_baseline`
- 基准库存设为 0
- 只按 `2026-07-01 00:00:00+08` 之后订单扣减
- 验证过负数库存只来自 7.1 后订单

后续只读检查显示该员工当前现场数据已经发生变化，不能再把当时测试结果当成当前状态。最近一次只读检查结果：

```text
snapshot_rows = 59
all_order_count = 34
after_0701_order_count = 1
after_0701_sold_qty = 10
current_stock_sum = -4
nonzero_stock_rows = 3
```

当前非零库存中有一条 `current_qty = 3` 但 `sold_after_0701 = 3` 的记录，说明现场状态已经不是单纯“零基准减 7.1 后订单”的结果。正式处理前应重新以全量员工和全量初始库存做一次基准重算。

## 建议下一步

1. 把 `stock_summary.html` 的按钮文案从 `导入库存` 改成 `覆盖导入库存余额` 或 `导入7.1初始库存`。
2. 增加导入确认提示：该导入会覆盖当前库存，不是累加。
3. 新增基准库存保存表 `van_stock_baselines`。
4. 新增幂等重算函数 `rebuild_van_stocks_from_baseline()`。
5. 在导入完成后自动执行重算，或者提供一个明确按钮 `按7.1后订单重算库存`。
6. 修改订单删除恢复库存触发器，只恢复 7.1 后订单影响。
7. 正式执行全员库存切换前，先在单个员工或少量员工上复核结果。