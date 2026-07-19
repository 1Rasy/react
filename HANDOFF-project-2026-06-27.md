# 开单 / 库存 / 卖进系统交接文档

更新时间：2026-06-27

本文件基于 GitHub 仓库 `1Rasy/spr` 当前 `main` 分支，以及 Supabase 项目 `wyjbnnqhiehjccmojbbg` 当前 public schema 生成。

## 1. 项目定位

这是一个给小店渠道业务员使用的轻量网页系统，核心目标是：

- 员工选择后进入门店列表。
- 在门店维度开单、查看历史单据、修改或删除单据。
- 根据经销商出库 Excel 导入库存。
- 在后台查看卖进数据、库存、商品、员工、门店导入入口。
- 当前是纯静态 HTML + Supabase 直连模式，无构建流程、无登录认证。

## 2. 技术栈与部署

- 前端：纯 HTML / CSS / JavaScript。
- 数据库：Supabase Postgres。
- 前端 SDK：`@supabase/supabase-js@2`。
- Excel 解析：导入页使用 SheetJS `xlsx`；后台导出使用 `xlsx-js-style`。
- 路由：Netlify `_redirects` clean URL。
- 当前前端使用 Supabase publishable key 直连数据库。不要把 service role key 放到前端。

## 3. 主要页面

### `index.html`

员工入口页。

功能：

- 从 `employees` 表读取 `employee_code, name`，只展示 `is_active = true` 的员工。
- 支持按姓名或工号搜索。
- 选择员工后把 `current_employee_code` 和 `current_employee_name` 写入 `sessionStorage`，跳转 `store.html`。

### `store.html`

核心开单页。

功能：

- 如果没有 `sessionStorage.current_employee_code`，会提示重新选择员工并跳回入口页。
- 从 `products` 读取启用商品。
- 从 `employee_store_assets` 按员工号读取门店。
- 门店页展示：搜索框、返回按钮、库存管理、卖进数据、新门店、门店列表、字母索引。
- 门店历史页可以新增单据、查看单据、修改单据、删除单据。
- 开单页按品牌、规格、商品选择开单数量与价格。
- 提交单据会写入 `sales_orders`、`sales_order_items`，并更新 `van_stocks`。

当前已知待优化问题：

- 手机端搜索门店时，输入法会挡住搜索结果；建议做“搜索模式”：搜索框聚焦时隐藏 `.store-top-gates`，并用 `visualViewport.height` 控制 `#list` 的滚动高度。

### `dashboard.html`

管理后台。

当前功能：

- 快捷入口：导入门店、吉能库存、长涛库存、库存管理、商品表、员工表。
- 日期筛选：本日、昨日、近 7 天、本月、全部历史、自定义日期。
- 数据卡片：卖进金额、卖进单据、平均客单价。
- 卖进趋势。
- 卖进排行。
- 导出开单单据 Excel。

注意：后台导出 Excel 会读取 `sales_order_items` 与 `products`，商品名称优先使用 `products.name`。

### `store_import.html`

门店导入页。

功能：

- 批量导入员工门店关系。
- 数据写入 `employee_store_assets`。

### `stock_jn.html`

吉能库存导入页。

固定 Excel 列：

- A：单号 `order_no`
- C：制单日期 `bill_date`
- D：客户编号 `customer_code`
- E：客户名 `customer_name`
- G：条形码 `barcode`
- H：商品名称 `product_name`
- I：包装 `package_reg`
- J：件 `qty_piece`
- L：散 `qty_scatter`

导入流程：

1. 读取 Excel。
2. 读取 `dealer_employee_mappings` 作为客户编号白名单。
3. 生成 `import_uid`。
4. upsert 到 `raw_dealer_outbounds`，冲突字段为 `import_uid`。
5. 数据库触发器写入或累加 `van_stocks`。

### `stock_ct.html`

长涛库存导入页。

固定 Excel 列：

- X：单号 `order_no`
- A：制单日期 `bill_date`
- Q：客户编号 `customer_code`
- R：客户名 `customer_name`
- AA：条形码 `barcode`
- C：商品名称 `product_name`
- D：包装 `package_reg`
- F：件 `qty_piece`
- G：散 `qty_scatter`

流程与 `stock_jn.html` 基本一致。

### `stock_summary.html`

库存查看页。

功能：

- 查看业务员当前车存。
- 数据来源主要是 `van_stocks`，关联 `products` 展示商品信息。

### `products.html`

商品维护页。

功能：维护商品资料，如条码、名称、品牌、规格、口味、默认价格、单位、排序等。

### `employees.html`

员工维护页。

功能：维护员工资料和启用状态。

## 4. 当前 clean URL

Netlify `_redirects` 当前包含：

- `/index` -> `index.html`
- `/store` -> `store.html`
- `/dashboard` -> `dashboard.html`
- `/products` -> `products.html`
- `/employees` -> `employees.html`
- `/store_import` -> `store_import.html`
- `/stock_summary` -> `stock_summary.html`
- `/stock_jn` -> `stock_jn.html`
- `/stock_ct` -> `stock_ct.html`

部署时 Publish directory 应是仓库根目录，否则 `_redirects` 不生效。

## 5. Supabase 表结构摘要

当前 public schema 主要表：

| 表 | 当前行数 | 用途 | RLS |
|---|---:|---|---|
| `employees` | 18 | 员工资料 | 关闭 |
| `employee_store_assets` | 6614 | 员工-门店资产关系 | 关闭 |
| `dealer_employee_mappings` | 18 | 经销商客户编号到员工映射 | 关闭 |
| `products` | 169 | 商品资料 | 关闭 |
| `van_stocks` | 723 | 员工车存 | 关闭 |
| `raw_dealer_outbounds` | 987 | 经销商出库原始数据 | 关闭 |
| `sales_orders` | 79 | 开单主表 | 关闭 |
| `sales_order_items` | 508 | 开单明细 | 关闭 |
| `temp_upload_assets` | 0 | 临时导入表 | 关闭 |

重要安全提醒：当前 9 张 public 表 RLS 都是关闭的。因为前端直连 Supabase，所以 anon/publishable key 可以读写这些表。不要直接全开 RLS；如果没有 policy，会导致现有前端全部无法访问。正确顺序是：先设计登录或最低权限策略，再逐表开启 RLS 和测试。

## 6. 关键表字段

### `employees`

- `employee_code`：员工号，唯一。
- `name`：员工姓名。
- `is_active`：是否启用。

### `employee_store_assets`

- `employee_code`：员工号。
- `atom_code`：门店编号，唯一。
- `store_name`：门店名。
- `is_active`：是否启用。

注意：`atom_code` 唯一，意味着同一个门店编号只能归属一个记录。

### `dealer_employee_mappings`

- `customer_code`：经销商客户编号，唯一。
- `customer_name`：客户名。
- `employee_code`：映射到业务员工号。

该表决定经销商出库数据导入后库存归到哪位员工。

### `products`

- `barcode`：商品条码，唯一。
- `name`：商品标准名称。
- `brand`：品牌。
- `spec`：规格。
- `flavor`：口味或前端展示名。
- `default_price`：默认价格。
- `pcs_per_case`：每件散数。
- `pcs_per_box`：每盒散数。
- `unit`：散件单位。
- `sort_order`：前端排序。
- `is_active`：是否启用。

### `van_stocks`

- `employee_code`
- `product_barcode`
- `qty`
- `updated_at`

唯一索引：`employee_code + product_barcode`。

### `raw_dealer_outbounds`

经销商出库原始数据表。重要字段：

- `order_no`
- `bill_date`
- `customer_code`
- `customer_name`
- `barcode`
- `product_name`
- `package_reg`
- `qty_piece`
- `qty_scatter`
- `import_batch_id`
- `import_uid`
- `is_processed`

唯一索引：`import_uid`。用于避免重复导入造成库存重复累加。

### `sales_orders`

- `order_no`：单号，唯一。
- `employee_code`
- `atom_code`
- `store_name`
- `total_amount`
- `status`
- `remark`

注意：`remark` 仍存在，但当前已不是赠送/售后/退换专用逻辑。

### `sales_order_items`

当前字段：

- `order_no`
- `barcode`
- `product_name`
- `qty`
- `unit_price`
- `amount`

已无 `remark` 字段。

## 7. 数据流

### 员工进入门店页

1. `index.html` 从 `employees` 读取启用员工。
2. 点击员工后写入 `sessionStorage`。
3. 跳转 `store.html`。
4. `store.html` 根据员工号读取 `employee_store_assets`。

### 开单

1. 选择门店。
2. 选择品牌、规格、商品。
3. 输入数量和价格。
4. 生成订单号。
5. 写入 `sales_orders`、`sales_order_items`。
6. 更新 `van_stocks`。

当前推荐以数据库函数 `submit_sales_order_v2` 为准：

- 插入或更新 `sales_orders`。
- 删除旧的 `sales_order_items`。
- 重新插入明细。
- `product_name` 优先从 `products.name` 获取。
- 根据前端传入的库存更新数组 upsert `van_stocks`。

### 删除单据

- 删除 `sales_order_items` 时，触发器 `trg_sync_van_stock` 会执行 `sync_van_stock_on_order_change_v4()`。
- 逻辑是把被删明细的 `qty` 加回对应员工的 `van_stocks`。

### 经销商库存导入

1. `stock_jn.html` 或 `stock_ct.html` 解析 Excel。
2. 用 `dealer_employee_mappings` 过滤出已匹配客户。
3. 生成 `import_uid` 防重复。
4. 写入 `raw_dealer_outbounds`。
5. BEFORE INSERT 触发器 `trig_execute_dealer_stock_final` 执行 `process_dealer_stock_final()`。
6. 触发器根据 `customer_code -> employee_code`，`barcode -> products`，计算总散数并累加到 `van_stocks`。

## 8. 数据库函数与触发器

当前 public 函数：

- `import_and_filter_stores(p_store_json jsonb)`
- `import_filtered_store_assets(p_raw_excel_json jsonb)`
- `process_dealer_stock_final()` trigger
- `submit_sales_order_v2(...)`
- `submit_sales_order_v4(...)`
- `sync_and_mask_assets()`
- `sync_van_stock_from_outbounds()` trigger
- `sync_van_stock_on_order_change_v4()` trigger

当前触发器：

| 触发器 | 表 | 时机 | 函数 |
|---|---|---|---|
| `trig_execute_dealer_stock_final` | `raw_dealer_outbounds` | BEFORE INSERT | `process_dealer_stock_final()` |
| `trg_sync_van_stock` | `sales_order_items` | AFTER DELETE | `sync_van_stock_on_order_change_v4()` |

注意：数据库里还存在 `submit_sales_order_v4` 与 `sync_van_stock_from_outbounds` 等旧函数。后续维护时要先确认前端实际调用哪个函数，不要误改未使用或旧版本函数。

## 9. 索引与约束

重要索引：

- `products.barcode` 唯一。
- `employees.employee_code` 唯一。
- `employee_store_assets.atom_code` 唯一。
- `dealer_employee_mappings.customer_code` 唯一。
- `van_stocks(employee_code, product_barcode)` 唯一。
- `raw_dealer_outbounds.import_uid` 唯一。
- `sales_orders.order_no` 唯一。

可能需要关注的索引：

- `sales_orders.employee_code`、`sales_orders.created_at` 目前未看到专门索引。数据量变大后，后台按员工/日期查询可能变慢。
- `sales_order_items.order_no` 当前只有外键相关查询压力，未来数据大后建议加索引。

## 10. 已知风险与注意事项

### RLS 关闭

这是最大的安全风险。当前所有 public 表 RLS 关闭，前端直连数据库，适合内部快速开发，不适合公开长期运行。

建议路线：

1. 短期继续开发时，不要贸然开启 RLS。
2. 中期先做最小登录方案或管理员密码保护。
3. 再按页面梳理每张表需要的 select/insert/update/delete policy。
4. 最后逐表开启 RLS 并测试。

### 前端文件压缩成超长行

`store.html` 等页面代码被压缩成少数超长行，导致工具读取和 patch 容易截断。后续建议先格式化文件，再做大改。

### 库存口径

库存由两类操作影响：

- 经销商出库导入累加库存。
- 开单扣减库存，删除单据返还库存。

维护库存逻辑时必须同时检查前端开单逻辑、`submit_sales_order_v2`、`process_dealer_stock_final`、删除触发器。

### 经销商重复导入

重复导入依赖 `import_uid`。当前前端和数据库触发器都会生成/补齐 `import_uid`。不要删除 `raw_dealer_outbounds_import_uid_uidx`。

### Excel 条码

Excel 可能把条码转为科学计数法。导入页有 `barcode()` 函数做文本化处理；导出页也要保持条码文本格式。

### 时区

表中存在 `now()`、`timezone('utc', now())`、`Asia/Shanghai` 混用。前端展示日期时要统一考虑中国时间。

## 11. 建议的下一步

优先级从高到低：

1. 格式化 `store.html`，然后修复手机输入法遮挡门店搜索结果的问题。
2. 给 `sales_orders(created_at)`、`sales_orders(employee_code, created_at)`、`sales_order_items(order_no)` 添加索引。
3. 清理旧页面或旧函数：如不再使用 `order.html`、`report.html`、`stock.html`，应确认后删除或标记 legacy。
4. 统一库存换算公式，重点对比 `process_dealer_stock_final()` 与 `sync_van_stock_from_outbounds()`。
5. 设计 RLS 和登录方案。
6. 将经销商导入规则抽成配置，避免 `stock_jn.html` 与 `stock_ct.html` 大量重复。

## 12. 给后续维护者的操作建议

- 改 UI：优先改 `dashboard.html`、`store.html`，先提交到 `codex/products-excel-style-filters` 或新分支预览。
- 改库存：先备份 `van_stocks`、`raw_dealer_outbounds`，再改函数或触发器。
- 改导入：只改 `CFG.cols` 和解析/去重逻辑，不要随便动数据库触发器。
- 改表结构：先写迁移，避免直接手动改导致不可追踪。
- 大改前先格式化文件，减少 GitHub patch 和人工审查难度。
