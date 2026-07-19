# 2026-07-14 库存清理与 7 月 1 日订单重算交接

Supabase 项目：`wyjbnnqhiehjccmojbbg`

## 最终正确口径

库存以 `2026-07-01 00:00:00+08` 为零库存起点：

```text
当前库存 = 0 - 2026-07-01 及之后全部订单销量
```

不是“清理操作完成后的新订单才扣库存”，也不保留任何员工的旧库存基准。

- 7 月 1 日前订单：完整保留，只用于查询、导出和历史记录，不影响库存。
- 7 月 1 日及之后订单：全部参与库存，包括本次清理以前已经存在的订单。
- `raw_dealer_outbounds`：只保存原始经销商出库记录，不增加、覆盖或重算 `van_stocks`。
- 后续新订单：继续实时扣库存。
- 修改或删除 7 月 1 日后的订单：按订单变化恢复再重新扣减。

## 数据备份

清理前首次备份：

```text
backup_inventory_reset_20260714
```

| 表 | 行数 |
|---|---:|
| `sales_orders` | 867 |
| `sales_order_items` | 5,987 |
| `van_stocks` | 1,016 |
| `raw_dealer_outbounds` | 913 |

第一次执行结束后的备份：

```text
backup_inventory_reset_final_20260714
```

| 表 | 行数 |
|---|---:|
| `sales_orders` | 868 |
| `sales_order_items` | 5,989 |
| `van_stocks` | 70 |
| `raw_dealer_outbounds` | 0 |

发现库存口径理解有误后，在正确重算前再次建立完整快照：

```text
backup_order_only_rebuild_20260714
```

| 表 | 行数 |
|---|---:|
| `sales_orders` | 868 |
| `sales_order_items` | 5,989 |
| `van_stocks` | 70 |
| `raw_dealer_outbounds` | 0 |

所有订单备份均与对应时点原表行数一致，订单没有删除或覆盖。

## 已执行的正确重算

新增数据库函数：

```text
public.rebuild_van_stocks_from_orders(p_cutoff)
```

该函数是幂等的，每次执行都会：

1. 删除全部现有 `van_stocks`；
2. 读取全部 `sales_orders.created_at >= 2026-07-01 00:00:00+08` 的订单；
3. 按员工和条码聚合 `sales_order_items.qty`；
4. 以负数写回 `van_stocks`。

正确重算时的数据：

| 项目 | 数量 |
|---|---:|
| 全部订单 | 868 |
| 全部订单明细 | 5,989 |
| 7 月 1 日后订单 | 684 |
| 7 月 1 日后订单明细 | 4,936 |
| 聚合后的库存行 | 776 |
| 库存总数量 | -21,704 |

验证结果：

```text
expected_stock_rows = 776
actual_stock_rows   = 776
expected_total_qty  = -21704
actual_total_qty    = -21704
mismatch_rows       = 0
```

即当前每一条库存都与 7 月 1 日后的全部订单聚合结果完全一致。

## raw 数据行为

`process_dealer_stock_final()` 已改为：

- 保留 `import_uid` 生成和重复过滤；
- 允许原始出库记录继续写入 `raw_dealer_outbounds`；
- 不再写入或修改 `van_stocks`；
- `is_processed` 保持为 `false`，表示没有参与库存处理。

`sync_van_stock_from_outbounds()` 已改为无操作函数，并禁止前端角色直接调用。

## 已停用的错误基准方案

以下方案不再用于库存计算：

```text
van_stock_baselines
import_van_stock_baseline(...)
rebuild_van_stocks_from_baseline(...)
```

前端角色已被撤销调用和写入权限。`stock_summary.html` 也已移除初始库存 Excel 导入入口。

## 页面说明

- 库存管理页明确显示：库存只由 7 月 1 日后的订单计算。
- 经销商导入页改为“经销商原始出库导入”，明确提示导入不会改变库存。

## 恢复入口

最新纠正前快照：

```sql
backup_order_only_rebuild_20260714.sales_orders
backup_order_only_rebuild_20260714.sales_order_items
backup_order_only_rebuild_20260714.van_stocks
backup_order_only_rebuild_20260714.raw_dealer_outbounds
```

订单原表仍完整，不需要恢复。恢复任何库存快照前，应先备份恢复时点之后新增的订单和库存数据。
