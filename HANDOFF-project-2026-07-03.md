# spr 项目交接文档（2026-07-03）

生成时间：2026-07-03  
仓库：`1Rasy/spr`  
本地路径：`C:\Users\10703\Desktop\开单3\spr`  
当前分支：`main`  
当前提交：`fcfc20775f53fbcea03014840adf8e76bda00169`

## 1. 项目定位

`spr` 是一个静态 HTML + Supabase 直连的门店开单系统。仓库没有构建流程，页面直接通过 CDN 加载 Supabase、SheetJS、html2canvas、pinyin-pro 等依赖。

主要用户：

- 业务员：手机端选员工、查门店、开单、修改订单、删除订单、生成送货单图片、查看库存和卖进数据。
- 管理员：后台查看卖进汇总、趋势、员工排行，导出开单明细，导入门店和库存。
- 商品维护人员：维护商品条码、品牌、规格、口味、价格、包装规格、散件单位、拼盒标记和排序。

## 2. 当前入口和文件分工

### 员工端

- `index.html`：员工入口，选择员工后进入门店端。
- `store.html`：门店端主入口，只保留页面壳、搜索框和脚本/CSS 引用。
- `store_stock.html`：员工库存查看入口，复用 `store-app.js`，设置 `window.STORE_ENTRY='stock'`。
- `store_report.html`：员工卖进数据入口，复用 `store-app.js`，设置 `window.STORE_ENTRY='report'`。
- `store_new.html`：线外新门店管理入口，复用 `store-app.js`，设置 `window.STORE_ENTRY='new'`。
- `store-app.js`：员工端核心业务逻辑，包括门店列表、搜索、历史订单、开单、改单、删单、库存、卖进报表、线外门店、送货单、拼盒。
- `store-style.css`：员工端主样式，当前是压缩单行 CSS。
- `store-qty-popup.js/css`：把数量下拉选择改成 5x5 数量弹窗，也覆盖售后数量。
- `store-after-sales.js/css`：售后按钮和售后退货入库逻辑。
- `store-mix-box-edit-fix.js`：拼盒改单相关补丁。

### 管理端

- `dashboard.html`：管理后台。负责卖进汇总、趋势折线图、员工排行、日期范围筛选、开单明细 Excel 导出。
- `products.html`：商品表管理。支持 Excel 式筛选、排序模式、行内新增、批量保存、`allow_mix_box` 拼盒开关。
- `employees.html`：员工表和经销商/客户编码映射维护。
- `store_import.html`：门店导入入口。
- `stock_summary.html`：管理端库存汇总、库存覆盖导入、库存导出。
- `stock_jn.html` / `stock_ct.html`：经销商出库数据导入入口，写入 `raw_dealer_outbounds`，由数据库触发器增量影响库存。
- `order.html`、`report.html`、`stock.html`：保留的历史/拆分页面，当前主业务以 `store*.html + store-app.js` 为准。

### 数据库和测试

- `database/`：Supabase public schema 导出、迁移和说明。注意这些文件不一定完整代表线上最新函数体，涉及线上函数/触发器时需要重新核实。
- `tests/*.mjs`：静态回归测试，主要通过读取源码字符串保护关键行为。

## 3. Supabase 约定

Supabase 项目：`wyjbnnqhiehjccmojbbg`

核心表：

- `employees`：员工主数据，字段常用 `employee_code / name / is_active`。
- `employee_store_assets`：员工可见门店，字段常用 `employee_code / atom_code / store_name`。线外门店使用 `NEW_` 前缀。
- `products`：商品主数据，字段常用 `barcode / name / brand / spec / flavor / default_price / pcs_per_case / pcs_per_box / unit / allow_mix_box / is_active / sort_order`。
- `van_stocks`：员工车存库存，按 `employee_code + product_barcode` 记录散件库存 `qty`。
- `sales_orders`：订单主表，字段常用 `order_no / employee_code / atom_code / store_name / total_amount / created_at`。
- `sales_order_items`：订单明细，字段常用 `order_no / barcode / product_name / qty / unit_price / amount / sale_unit / sale_qty / sale_unit_price`。
- `raw_dealer_outbounds`：经销商出库导入原始数据。
- `dealer_employee_mappings`：经销商客户编码到员工编码的映射。

主要 RPC / 触发器：

- 前端开单、改单提交调用 `submit_sales_order_v2`，传入 `p_order_no / p_employee_code / p_atom_code / p_store_name / p_total_amount / p_items / p_stock_updates`。
- `raw_dealer_outbounds BEFORE INSERT -> process_dealer_stock_final()`：经销商出库导入后折算并累加到 `van_stocks`。
- `sales_order_items AFTER DELETE -> sync_van_stock_on_order_change_v4()`：删除订单明细时会恢复库存。正式库存切换后，删除 2026-07-01 前历史订单需要避免错误恢复库存。

## 4. 员工端关键业务规则

### 员工和页面跳转

`store-app.js` 支持 `?emp=员工编号`。进入后会把员工编号写入 `sessionStorage`，并把 URL 归一化为只带 `emp`，不再把员工姓名拼进 URL。

拆分页面跳转时使用 `storePageUrl(file)` 保留 `emp`，例如：

- `store_stock.html?emp=...`
- `store_report.html?emp=...`
- `store_new.html?emp=...`

### 门店列表和搜索

普通门店来自 `employee_store_assets`，但 `atom_code` 以 `NEW_` 开头的线外门店不会显示在普通门店列表，只在 `store_new.html` 管理。

搜索时进入 `body.store-search-mode`，配合 `visualViewport` 调整可视高度，隐藏顶部入口和字母栏，提升手机端搜索可用空间。

### 开单和改单

开单页按品牌、规格、口味分组显示商品。当前顺序依赖 `products.sort_order`，其次按 `products.id`，最后按商品名。

每个商品行有：

- 散数：上方行，数量走 5x5 弹窗，单位来自 `products.unit`。
- 整数：下方行，数量走 5x5 弹窗，整件扣库数量由 `packSize(p)` 计算。
- 价格：下拉选择，不是手输框。同一 `brand + spec` 下多口味价格联动。
- 日期：可修改订单日期。提交 RPC 成功后，再更新 `sales_orders.created_at`。如果日期更新失败，会抛错，不展示假成功。

改单使用同一个 `templateEditOrNew()` 渲染开单界面，并根据已有明细回填数量和价格。

### 拼盒

拼盒依赖 `products.allow_mix_box=true` 且同规格存在有效 `pcs_per_box`。

规则：

- 拼盒按同一 `brand + spec` 聚合。
- 展开后按口味录入参与拼盒的散件数量。
- 提交前 `validateMixBoxGroups()` 校验拼盒散件总数必须能被 `pcs_per_box` 整除。
- 库存扣减按散件数扣。
- 明细写入时 `sale_unit='拼盒'`，`sale_qty` 是散件数量，`sale_unit_price` 是整盒价格，`amount` 按口味比例分摊。
- 送货单和后台导出会按 `pcs_per_box` 把拼盒数量换算到整盒数量。

### 售后

售后是独立补丁模块 `store-after-sales.js/css`，加载在 `store-app.js` 之后。

行为：

- 只挂在“散”那一行旁边，按钮文字为“售后”或“售后N”。
- 点击售后按钮后，在散行下面展开一行，显示“售后数”和提示“只算能卖的，收回增加库存”。
- 售后数量也使用 `store-qty-popup.js` 的 5x5 数量弹窗。
- 提交时售后明细写入 `sale_unit='售后'`、`qty=-returnQty`、`amount=0`。
- 库存计算使用 `netStockOut = saleStockQty - returnQty`，也就是收回售后会增加库存。
- 修改已有订单时，会读取旧明细里 `sale_unit` 包含“售后”的行并回填 `afterSaleQty`。

### 删除订单

删除订单会先删除 `sales_order_items`，再删除 `sales_orders`，并在前端把本次订单对应库存加回后 `upsert` 到 `van_stocks`。数据库层也存在删除明细恢复库存触发器，所以后续调整删除逻辑时必须谨慎核对是否会双重恢复。

### 送货单图片

送货单通过 `html2canvas` 生成 PNG 并直接下载，不再弹出预览层。送货单会按商品聚合，拼盒明细会按整盒显示。送货单不应显示系统内部字段，比如订单号、条码、门店编码、二维码等。

## 5. 管理后台规则

`dashboard.html` 当前职责：

- 默认按“近 7 天”加载 `sales_orders`，最多取 2000 条。
- 支持“本日 / 昨日 / 近 7 天 / 本月 / 全部历史 / 自定义范围”。
- 自定义范围是一个输入入口 `customRangeText`，点击展开 `dateRangePanel` 双月日历。反向选择通过 `normalizeCustomDateRange()` 归一化。
- 员工筛选是 chips，点击后只影响当前已加载订单的聚合展示。
- 趋势图使用 SVG polyline，保护圆点不被非等比缩放；“近 7 天”固定显示 7 个日期（无单日为 0），其他范围横轴最多显示 7 个完整标签，日期格式为 `7.01`。图表上下留白处仅显示最高金额与最低非零金额的数值，不加文字说明。
- 导出使用 `xlsx-js-style`，文件名来自当前日期范围 `getExportFileName()`。

导出规则：

- 从 `sales_orders` 获取订单主表，再按 `order_no` 查 `sales_order_items`。
- 普通门店和 `NEW_` 线外门店分两个 sheet。
- 拼盒明细按 `brand + spec` 聚合，数量写入“整数”，值为 `sale_qty / pcs_per_box`，价格写入“整价”。

注意：当前 `dashboard.html` 源码里有明显中文乱码，页面结构和测试能通过，但后续改中文文案前要先处理编码风险，不要大范围重写文件。

## 6. 商品和库存维护

### 商品表 `products.html`

支持：

- 全局搜索和列筛选。
- 排序模式，写入 `sort_order`。
- 行内新增商品。
- 批量保存脏字段。
- 维护 `allow_mix_box`，供开单页决定是否展示拼盒入口。

商品关键字段：

- `barcode`：条码，也是前端商品 id。
- `default_price`：默认散件价。
- `pcs_per_case`：整件折算散件数。
- `pcs_per_box`：中盒/拼盒折算散件数。
- `unit`：散件单位。
- `allow_mix_box`：是否允许拼盒。

### 库存汇总 `stock_summary.html`

用途：管理端查看和导出员工库存。

导入格式：

```text
A 列：员工编号
B 列：商品条码
C 列：库存散数
```

导入行为是覆盖：按 `employee_code + product_barcode` upsert 到 `van_stocks`，`qty` 直接覆盖为 Excel 里的数值。它不是经销商增量入库。

### 经销商库存导入 `stock_jn.html` / `stock_ct.html`

这两个页面写入 `raw_dealer_outbounds`，再由数据库触发器和 `process_dealer_stock_final()` 折算后累加到 `van_stocks`。这条链路是增量影响库存，不是覆盖。

## 7. 测试和验证

项目没有构建步骤。推荐用 Codex bundled Node 跑测试：

```powershell
$node='C:\Users\10703\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\store-dashboard-behavior.test.mjs
& $node tests\mix-box.test.mjs
& $node tests\mix-box-edit-fix.test.mjs
& $node tests\after-sales-layout.test.mjs
& $node tests\qty-popup-interaction.test.mjs
& $node tests\price-link-ui.test.mjs
& $node tests\stock-quantity-display.test.mjs
& $node tests\new-store-export.test.mjs
& $node tests\delivery-note-download.test.mjs
git diff --check
```

脚本语法检查建议至少覆盖：

- `store-app.js`
- `store-after-sales.js`
- `store-qty-popup.js`
- `store-mix-box-edit-fix.js`
- `dashboard.html` 内联脚本
- `products.html` 内联脚本
- `stock_summary.html` 内联脚本

## 8. 当前已知风险

1. 多个 HTML 文件的中文文本存在乱码，尤其是 `store.html`、`dashboard.html`、`products.html`、`stock_summary.html`。后续改文案要先确认编码，不要用整文件重写解决局部问题。
2. `dashboard.html` 历史上被检测出过 NUL 字节/乱码风险。修改后台时必须先跑语法检查和 `tests/store-dashboard-behavior.test.mjs`。
3. `store-app.js` 是压缩单行大文件，直接大范围 patch 风险高。推荐新增小补丁模块或做精确字符串替换，避免重排整个文件。
4. `store-after-sales.js` 当前通过覆盖全局 `submitOrder` 和包装 `templateEditOrNew` 实现售后。后续如果重写 `store-app.js` 这些函数，必须同步检查售后是否仍挂载。
5. 删除订单既有前端库存回写，又有数据库删除明细触发器恢复库存，存在双重恢复风险，需要用真实数据小范围验证。
6. 2026-07-01 正式库存切换相关逻辑尚未完全落成仓库 migration。历史订单是否参与库存恢复，必须按日期边界谨慎处理。
7. Supabase schema 导出文件是历史快照，线上函数/触发器可能已变。涉及库存、订单、触发器时要重新核实线上定义。
8. 静态测试大多是源码字符串断言，能防止关键片段丢失，但不能替代浏览器交互测试和真实 Supabase 数据验证。

## 9. 修改建议

- 小改优先：围绕当前函数和 class hook 精确修改，不要重写整页。
- 员工端开单相关改动至少跑：`store-dashboard-behavior`、`mix-box`、`after-sales-layout`、`qty-popup-interaction`。
- 后台日期/导出相关改动至少跑：`store-dashboard-behavior`、`mix-box`、脚本语法检查。
- 库存导入相关改动先区分覆盖导入 `stock_summary.html` 和增量导入 `stock_jn.html / stock_ct.html`。
- 任何涉及 Supabase 写入、库存重算、删除订单的操作，先读代码和线上数据流，确认不会误改真实库存。

## 10. 最近提交背景

最近一轮提交集中在：

- 后台日期选择器对齐 `f8b4d00` 的实现：`fcfc207`。
- 售后按钮布局、售后展开提示、修改订单售后回填、售后数量使用 5x5 弹窗。
- 拼盒改单和拼盒导出/送货单相关回归。

当前要特别记住：用户明确要求后台日期选择器只做成 `main@f8b4d00` 那套，不要重写整个管理页。
