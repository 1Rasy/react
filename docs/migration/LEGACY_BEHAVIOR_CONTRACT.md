# 旧版行为契约

冻结基线：GitHub `main`，commit `7aeea35a879a59e654bc0d7375defb9612c128b1`（2026-07-19）。

本文以该 commit 的实际 HTML、JavaScript、SQL 和测试为准。`docs/ai/*` 只用于解释背景；与实现冲突时，本文记录实现并单列差异。迁移期间不得以“整理”名义改变请求顺序、字段、舍入、浏览器存储或 Excel 结构。

## 1. 页面入口和 URL

| 入口 | 用途 | clean URL |
| --- | --- | --- |
| `index.html` | 员工选择 | `/`、`/index` |
| `store.html` | 门店列表、历史、开单、详情 | `/store` |
| `store_new.html` | 线外门店 | `/store_new`（由托管平台 `cleanUrls` 提供） |
| `store_report.html` | 员工卖进报表 | `/store_report`（同上） |
| `store_stock.html` | 员工库存和调整申请 | `/store_stock`（同上） |
| `dashboard.html` | 管理看板 | `/dashboard` |
| `products.html` | 商品管理 | `/products` |
| `employees.html` | 员工管理 | `/employees` |
| `store_import.html` | React 门店全量同步导入 | `/store_import` |
| `store_import-legacy.html` | 门店全量同步导入旧版回退 | `/store_import-legacy` |
| `stock_import.html` | React 吉能/长涛原始出库导入 | `/stock_import` |
| `stock_import-legacy.html` | 吉能/长涛原始出库导入旧版回退 | `/stock_import-legacy` |
| `stock_summary.html` | React 库存管理和库存基线导入 | `/stock_summary` |
| `stock_summary-legacy.html` | 库存管理旧版回退 | `/stock_summary-legacy` |
| `stock-adjustment-review.html` | 库存调整审核 | `/stock-adjustment-review` |
| `stock-adjustment-review-legacy.html` | 库存调整审核旧版回退 | `/stock-adjustment-review-legacy` |
| `inventory-movements.html` | 库存流水 | `/inventory-movements` |
| `stock_jn.html` | React 吉能原始出库导入 | `/stock_jn` |
| `stock_jn-legacy.html` | 吉能原始出库导入旧版回退 | `/stock_jn-legacy` |
| `stock_ct.html` | React 长涛原始出库导入 | `/stock_ct` |
| `stock_ct-legacy.html` | 长涛原始出库导入旧版回退 | `/stock_ct-legacy` |
| `stock.html` | 调整申请跳转兼容页 | `/stock`（由 `cleanUrls` 提供） |
| `order.html`、`report.html` | 旧独立开单/报表兼容页 | `/order`、`/report`（由 `cleanUrls` 提供） |

`_redirects` 对主要入口执行 `.html -> clean URL` 的 301，以及 `clean URL -> .html` 的 200 rewrite；`vercel.json` 保持 `cleanUrls:true`、`trailingSlash:false`。React MPA 必须继续输出所有业务 HTML 文件，不能用 SPA fallback 替代。库存流水迁移后，`inventory-movements.html` 和 `/inventory-movements` 由 React 接管，旧实现保留在 `inventory-movements-legacy.html` 和 `/inventory-movements-legacy`。库存调整审核迁移后，`stock-adjustment-review.html` 和 `/stock-adjustment-review` 由 React 接管，旧实现保留在 `stock-adjustment-review-legacy.html` 和 `/stock-adjustment-review-legacy`。库存管理迁移后，`stock_summary.html` 和 `/stock_summary` 由 React 接管，旧实现保留在 `stock_summary-legacy.html` 和 `/stock_summary-legacy`。吉能原始出库导入迁移后，`stock_jn.html` 和 `/stock_jn` 由 React 接管，旧实现保留在 `stock_jn-legacy.html` 和 `/stock_jn-legacy`。长涛原始出库导入迁移后，`stock_ct.html` 和 `/stock_ct` 由 React 接管，旧实现保留在 `stock_ct-legacy.html` 和 `/stock_ct-legacy`。统一吉能/长涛原始出库导入迁移后，`stock_import.html` 和 `/stock_import` 由 React 接管，原实现的完整 Git blob 保留在 `stock_import-legacy.html` 和 `/stock_import-legacy`。门店全量同步导入迁移后，`store_import.html` 和 `/store_import` 由 React 接管，原实现的完整 Git blob 保留在 `store_import-legacy.html` 和 `/store_import-legacy`。因此当前构建共输出 25 个业务 HTML 入口。

## 2. 查询参数和浏览器存储

| 名称 | 当前读取/写入语义 |
| --- | --- |
| `emp` | 共享门店页面首选员工号；页面间导航保留 |
| `employee_code` | `store-app.js` 对员工号的兼容别名 |
| `name` | 员工名称兼容参数；写入 session 后可由员工表补全 |
| `atom`、`order` | `report.html`、`order.html` 产生的门店/订单定位参数 |
| `adjust=1` | `stock.html` 产生，`store-stock-adjustment.js` 用于直接打开调整申请 |
| `current_employee_code` | `sessionStorage` 当前员工号；员工选择时写入 |
| `current_employee_name` | `sessionStorage` 当前员工名；员工选择或员工表补全时写入 |
| `admin_employee_code` | `sessionStorage` 审核人；缺省为 `ADMIN` |
| `spr_order_draft_v1:<employee_code>:<atom_code>` | `localStorage` 新单草稿；只用于没有 `order_no` 的订单 |

草稿 JSON 字段固定为 `atom`、`name`、`date`、`items`、`currentSelectedBrand`、`currentSelectedSpec`、`mixBoxOpenKeys`、`savedAt`。数量、价格、日期、品牌/规格和拼盒展开状态变化都会保存；刷新恢复。新单成功、从新单返回放弃时清除；编辑已有订单不使用该草稿键。

### 已发现的当前兼容缺口

`store-app.js` 初始化时会用 `history.replaceState` 把查询串重写成仅 `emp=<员工号>`。因此 `atom`、`order`、`adjust` 会在对应后置脚本读取前丢失。这与迁移验收中要求兼容这些参数冲突。迁移时要用行为测试恢复这些入口的预期用途，但不能把当前缺口描述成已经工作的旧行为。

## 3. 员工开单状态和返回行为

共享页面状态为 `STORE`、`HISTORY`、`ORDER`、`DETAIL`、`REPORT`、`STOCK`、`NEW_STORE_MGT`。`window.STORE_ENTRY` 分别由四个 MPA 入口设为 `home`、`new`、`report`、`stock`。

- 员工选择：写入两个 session 键，再进入 `store.html`。
- 门店主页：库存、卖进数据、线外门店三个入口均携带 `emp`。
- 门店搜索：有关键词时返回键只清空搜索；滚动或触摸列表会让输入框失焦；`visualViewport` 驱动 `--vvh`，搜索态隐藏三入口和字母栏。
- 门店主页无搜索时返回：`sessionStorage.clear()` 后回 `index.html`。
- 报表、库存、线外门店返回：回当前员工门店主页。
- 订单详情返回：按 `data-from-report` 回报表，否则回该门店历史。
- 编辑已有订单返回：回详情；新单返回：清草稿，普通门店回历史，线外门店回线外列表。
- 历史返回：普通门店回主页，线外门店回线外列表。

## 4. 产品、数量、金额和拼盒

- 展示名：`spec` 与 `flavor` 去空后用单空格拼接；都为空时退回条码/ID。
- 三层包装：`pcs_per_box > 0` 时“整”扣 `pcs_per_box`；否则扣 `pcs_per_case`。默认整价为 `default_price * packSize`，保留两位。
- 库存扣减散数：`wholeQty * packSize + looseQty + mixQty`。
- 普通金额：`wholeQty * wholePrice + looseQty * loosePrice`。
- 整行 payload：`qty=wholeQty*packSize`、`sale_unit='整'`、`sale_qty=wholeQty`、`sale_unit_price=wholePrice`。
- 散行 payload：`qty=looseQty`、`sale_unit='散'`、`sale_qty=looseQty`、`sale_unit_price=loosePrice`。
- 拼盒资格：同 `brand + spec` 分组，组内存在 `allow_mix_box=true` 且存在正数 `pcs_per_box`。
- 拼盒校验：组内所选散数总和必须是 `pcs_per_box` 的整数倍。
- 拼盒总额：`round2(totalLoose / pcs_per_box * boxPrice)`。
- 拼盒拆行：每个条码一行，`qty=sale_qty=该条码散数`、`sale_unit='拼盒'`、`sale_unit_price=整盒价`；金额按散数占比分摊并保留两位，最后一行取“总额减前面已分金额”以吸收舍入差；`unit_price=该行金额/该行散数`，保留四位。
- 编辑回填由 `store-mix-box-edit-fix.js` 按 `sale_unit` 恢复普通/拼盒数量和价格，不得合并条码行。

## 5. 开单、改单、售后、删单和库存责任

提交顺序固定：

1. 校验非空和拼盒成盒。
2. 线外新门店先 `employee_store_assets.insert`，字段为 `employee_code`、`atom_code`、`store_name`；临时 atom 为 `NEW_` 加 6 位大写 base36。
3. 读取当前员工 `van_stocks` 实时库存。
4. 以 `newDbQty - oldDbQty` 计算差量，构造 `{product_barcode, qty: liveQty-delta}`。
5. 调用 `submit_sales_order_v2`，参数顺序/名称固定为 `p_order_no`、`p_employee_code`、`p_atom_code`、`p_store_name`、`p_total_amount`、`p_items`、`p_stock_updates`。
6. RPC 成功后再更新 `sales_orders.created_at` 为所选业务日期加当前本地时分秒。
7. 售后增强脚本在同一次更新中写 `status` 和 `remark`；成功后清草稿并回门店历史。

售后数量不计销售金额，库存净出库为 `销售散数 - 收回散数`。订单状态为 `SUCCESS_AFTER_SALE`，备注为 `AFTER_SALES:` 加“条码到收回散数”的 JSON；无售后恢复 `SUCCESS` 和空备注。详情、历史、员工报表排除售后行/数量，只以正常销售项汇总实收，编辑时从 remark/兼容售后行恢复收回数量。

库存生效日为 `2026-07-01`。前端包装会让生效日前订单提交/修改不传库存更新。删单当前顺序为读取订单与实时库存、删除 `sales_order_items`、删除 `sales_orders`、最后 upsert 前端计算的库存。仓库 SQL 同时存在 `sales_order_items AFTER DELETE` 返库触发器，因此当前前端“最终 upsert 覆盖触发器中间值”的耦合顺序必须先保留；迁移不能擅自把责任改成纯前端或纯触发器。线上实际已应用的函数/触发器未在本批读取，属于上线前必须只读核验项。

## 6. Supabase 数据契约

| 页面/模块 | 表 | RPC |
| --- | --- | --- |
| 员工选择/员工管理 | `employees`、`dealer_employee_mappings` | 无 |
| 商品管理 | `products` | 无 |
| 门店共享应用 | `employee_store_assets`、`employees`、`products`、`sales_orders`、`sales_order_items`、`van_stocks` | `submit_sales_order_v2` |
| Dashboard | `employees`、`sales_orders` | `get_dashboard_export_order_items`、`get_pending_stock_adjustment_requests` |
| 门店导入 | `employees`、`temp_upload_assets` | `sync_and_mask_assets` |
| 吉能/长涛导入 | `dealer_employee_mappings`、`raw_dealer_outbounds` | 无 |
| 库存管理 | `employees`、`products`、`van_stocks` | `import_van_stock_baseline` |
| 库存调整/流水 | 由 `stock-adjustment-api.js` 封装 | `save_and_submit_stock_adjustment_request`、`save_stock_adjustment_request`、`submit_stock_adjustment_request`、`withdraw_stock_adjustment_request`、`get_my_stock_adjustment_requests`、`get_pending_stock_adjustment_requests`、`get_stock_adjustment_review_history`、`approve_stock_adjustment_request`、`reject_stock_adjustment_request`、`get_inventory_movement_details` |

商品新增字段固定为 `sort_order`、`barcode`、`name`、`brand`、`spec`、`flavor`、`default_price`、`pcs_per_case`、`pcs_per_box`、`unit`、`allow_mix_box`、`is_active`。员工新增字段固定为 `employee_code`、`name`、`is_active`；客户映射通过 `dealer_employee_mappings` 单独解除旧映射再 upsert。

## 7. 导入契约

### 吉能/长涛原始出库

只接受 `.xlsx`、`.xls`，读取首个工作表；员工白名单来自 `dealer_employee_mappings`。吉能固定列为 A/C/D/E/G/H/I/J/L，长涛为 A/C/D/F/G/Q/R/X/AA。写入 `raw_dealer_outbounds` 的字段为：

`import_batch_id`、`is_processed=false`、`source_row_no`、`order_no`、`bill_date`、`customer_code`、`customer_name`、`barcode`、`product_name`、`package_reg`、`qty_piece`、`qty_scatter`、`import_uid`。

`import_uid` 由单号、日期、条码、整件数、散数生成；文件内先去重，再每 500 行按 `import_uid` upsert。React 统一入口和 React 吉能/长涛独立入口都不再维护六个特殊条码名单，也不再给写入 payload 赋值 `is_triple_spec_direct`；数据库字段本身保持不变，三个 legacy 回退页继续完整保留旧名单和旧 payload。统一入口的两个导入器各自维护文件、拖放、按钮和状态，互不改写。当前页面明确承诺“只导入原始记录，不改变当前库存”；这是实际实现，优先于旧文档中的累加库存描述。

### 门店全量同步

Excel 表头固定为 `门店负责人员工号`、`ATOM门店编号`、`门店名称`。过滤非员工白名单，按 atom 去重；先清空 `temp_upload_assets`，再插入 `{employee_code, atom_code, store_name}`，最后调用 `sync_and_mask_assets`。该 RPC 会把本次文件未出现的既有门店设为 `is_active=false`，并激活/更新本次门店，因此不是增量导入。

### 库存基线

首个工作表按 A=员工编号、B=条码、C=整数散数读取，可有首行表头；错误行阻断。调用 `import_van_stock_baseline` 的参数固定为 `p_baseline_id='2026-07-01-opening'`、`p_rows`、`p_cutoff`。仓库后续 SQL 对该 RPC 的授权/语义有多次覆盖，迁移只保留前端契约，不据此推断线上最终函数。

## 8. 导出和单据契约

- Dashboard Excel 表头依次为：`开单日期`、`员工`、`员工号`、`门店编号`、`门店`、`规格口味`、`条码`、`整数`、`整价`、`散数`、`散价`、`金额`。
- 普通门店写 `开单明细`；`atom_code` 以 `NEW_` 开头的行另写 `线外门店`。同一门店交替白/灰底，紫色表头、细边框、自动筛选，调用 XLSX 时保留 `cellStyles:true`。
- 拼盒导出保持每条码散数；散价为 `sale_unit_price / pcs_per_box`，保留两位。
- 库存导出表头依次为 `员工名字`、`员工号`、`规格口味`、`条码`、`库存散数`，sheet 为 `库存管理`，文件名 `库存管理_YYYY-MM-DD.xlsx`。
- 送货单由订单和商品实时查询生成，拼盒按品牌+规格合并展示；宽 860px，至少 8 个明细行，包含客户、日期、数量/单位、单价、金额、中文大写、小写和送货人。使用 `html2canvas` 生成 PNG；DOM、字体、尺寸和文件名都属于视觉/结果契约。

## 9. Dashboard 和管理交互

- Dashboard 默认 `today`，支持今天、昨天、近 7 天、本月、全部、自定义日期范围；员工筛选作用于指标、趋势、排行和导出。
- 三张指标卡固定为卖进金额、卖进单据、平均客单价；趋势按日期补零，近 7 天标签为 `M.DD`；员工排行同时显示姓名和工号。
- 待审核红点来自 `get_pending_stock_adjustment_requests`，0 隐藏，超过 99 显示 `99+`。
- 员工表当前为工号、姓名、客户编号、启用四列，批量保存；商品表保留排序、Excel 式筛选和 `allow_mix_box`。
- 库存调整 API 必须继续由独立适配器封装，页面不得直接重组 RPC 参数；库存流水导出继续走现有明细查询和格式化代码。
