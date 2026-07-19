# spr 项目交接文档：门店开单系统当前状态

更新时间：2026-07-01  
仓库：`1Rasy/spr`  
本地目录：`C:\Users\10703\Desktop\开单3\spr`  
当前分支：`main`  
当前最新提交：`8153970 Remove submit icon and prevent tap zoom`

## 1. 项目定位

这是一个纯静态 HTML + Supabase 直连的小店业务员开单系统。前端没有打包流程，页面通过 CDN 加载依赖，直接访问 Supabase。

核心用户：

- 业务员：在手机上查门店、开单、改单、删单、看历史、看库存、看卖进数据、生成送货单图片。
- 管理员：在 `dashboard.html` 查看汇总、趋势、导出开单明细 Excel。
- 商品维护人员：在 `products.html` 维护商品、规格、口味、价格、拼盒标记。

## 2. 关键文件

### 门店端

- `store.html`：门店首页入口，只保留页面壳、样式和脚本引用。
- `store_stock.html`：库存管理入口。
- `store_report.html`：卖进数据入口。
- `store_new.html`：线外/手动新门店入口。
- `store-style.css`：门店端共享样式，当前是压缩成一行的 CSS。
- `store-app.js`：门店端全部业务逻辑，包括门店列表、历史订单、开单、库存、卖进数据、新门店、送货单图片、拼盒。

### 后台端

- `dashboard.html`：管理后台、汇总、趋势图、开单明细导出。
- `products.html`：商品维护页，已支持 `allow_mix_box` 拼盒标记。

### 数据库脚本和测试

- `database/20260701_add_products_allow_mix_box.sql`：给 `products` 增加 `allow_mix_box boolean not null default false`。
- `tests/store-dashboard-behavior.test.mjs`：门店端和后台关键行为静态检查。
- `tests/mix-box.test.mjs`：拼盒相关静态检查。
- `tests/delivery-note-download.test.mjs`：送货单直接下载相关静态检查。
- `tests/price-link-ui.test.mjs`：同规格多口味价格联动检查。
- `tests/stock-quantity-display.test.mjs`：库存三级单位显示检查。
- `tests/new-store-export.test.mjs`：线外门店和后台导出分表检查。

## 3. Supabase 约定

项目：`wyjbnnqhiehjccmojbbg`

主要表：

- `products`：商品基础资料。前端使用 `barcode / name / brand / spec / flavor / default_price / pcs_per_case / pcs_per_box / unit / allow_mix_box / is_active`。
- `employee_store_assets`：业务员可见门店。手动创建的新门店使用 `atom_code` 前缀 `NEW_`。
- `sales_orders`：订单主表。当前开单成功后会按选择日期更新 `created_at`。
- `sales_order_items`：订单明细。新逻辑使用 `sale_unit / sale_qty / sale_unit_price`，同时兼容旧字段 `qty / unit_price / amount`。
- `van_stocks`：车存库存，仍按最小散件单位扣减。

RPC：

- `submit_sales_order_v2`：开单/改单提交入口。前端传入 `p_items` 和 `p_stock_updates`，数据库写订单、写明细、更新库存。

重要字段：

- `sales_order_items.sale_unit`：`散`、`整`、`拼盒`。
- `sales_order_items.sale_qty`：销售数量。拼盒场景当前保存的是参与拼盒的散件数量。
- `sales_order_items.sale_unit_price`：销售单价。拼盒场景保存的是一中盒价格。
- `products.allow_mix_box`：是否允许该规格做拼盒入口。

## 4. 门店端当前行为

### 员工直达

`store-app.js` 支持 `store.html?emp=员工工号`。优先读取 URL 参数，没有参数才读取 `sessionStorage`，都没有则回到 `index.html`。

拆分页跳转会保留 `emp`，例如：

- `store_stock.html?emp=...`
- `store_report.html?emp=...`
- `store_new.html?emp=...`

### 门店列表

普通门店列表来自 `employee_store_assets`，但会隐藏 `atom_code` 以 `NEW_` 开头的线外门店。线外门店只在 `store_new.html` 里展示。

搜索状态下会进入 `store-search-mode`，隐藏首字母分组和侧边字母栏。

### 历史订单

点进门店后进入历史订单列表：

- 卡片点击进入详情。
- 每张历史订单卡片有 `生成单据` 按钮。
- 按钮使用 `event.stopPropagation()`，不会触发进入详情。
- 金额文案使用 `实收：xx.xx`。

### 开单

开单页按商品品牌、规格、口味展示：

- 口味名称使用更醒目的 `flavor-badge`。
- 每个口味有两行销售入口：`散` 在上，`整` 在下。
- 价格是下拉选择器，不是手动输入框。
- 同一 `brand + spec` 下，多口味价格联动：改一个口味的散价/整价，会同步同规格其他口味。
- `整=扣 x单位` 只作为扣减提示，不参与独立库存层级显示。
- 提交按钮文案是 `提交账单`，已去掉火箭符号。
- 页面禁用双击放大相关触控行为，降低手机端误触放大概率。

### 日期

开单页有 `修改日期`。当前逻辑不是只改 UI，而是在 `submitOrder()` RPC 成功后调用：

```js
client.from('sales_orders').update({ created_at: orderDateToCreatedAt(orderData.date) })
```

如果日期更新失败，会抛错，不显示虚假的开单成功。

### 拼盒

拼盒逻辑集中在 `store-app.js`：

- `allow_mix_box` 为 true 且该规格有 `pcs_per_box > 0` 时显示拼盒入口。
- 拼盒按钮文案：`点击拼盒`。
- `0/x单位` 显示在按钮外侧，避免按钮宽度随着数量变化。
- 拼盒价格是一个普通价格下拉，不显示实时变动金额。
- 展开后按口味显示加减按钮，录入各口味参与拼盒的散件数量。
- 提交前校验：拼盒散件总数必须能被 `pcs_per_box` 整除。
- 库存扣减仍扣散件数量。
- 明细写入时 `sale_unit:'拼盒'`，`sale_qty` 为散件数，`sale_unit_price` 为中盒价，`amount` 按比例分摊到各口味。

示例：

炫迈 28 片，`pcs_per_box = 9`，三个口味合计 9 小盒，拼盒价 76.50：

- 前台录入：各口味用加减录散件数。
- 数据库存明细：每个口味各自一行，`sale_unit = 拼盒`。
- 送货单/后台导出：聚合后显示 `1中盒`，单价 `76.50`，不是 `9小盒`。

### 送货单图片

`store.html` 和拆分页都加载：

```html
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
```

生成流程：

1. 点击历史订单卡片或详情页里的 `生成单据`。
2. 查询 `sales_order_items`。
3. 根据 `barcode` 查询 `products`。
4. 用 `products.brand + products.spec` 聚合商品，忽略 `flavor`。
5. 构建隐藏在屏幕外的黑白送货单 DOM。
6. 用 `html2canvas` 生成 PNG。
7. 直接下载图片，不再弹出预览层，避免截图带出网址。

送货单不显示：

- 门店编号
- 单据编号
- 系统订单号
- 条码
- 二维码
- 手机号
- 收货人/收货人签字
- 备注栏

### 库存管理

库存管理页只显示当前库存，不做库存调整。

库存显示使用 `formatQtyToUnits(total, p.pcs_per_case, p.pcs_per_box, unitOf(p))`，不是开单页的 `formatStockQty()`。

显示规则：

- 有 `pcs_per_box`：`件 / 中盒 / 散`，例如 `1件 2中盒 3小包`。
- 没有 `pcs_per_box`：`件 / 散`，例如 `1件 3包`。
- 括号里保留最小散件总数。

### 卖进数据

`store_report.html` 默认打开显示 `今天`。

筛选按钮：

- 今天
- 昨天
- 本周
- 本月
- 全部
- 日期选择

`日期选择` 使用一个原生 `date` 输入。当前实现是单日选择，不是日期范围。为了避免第一次点开就自动确认今天，输入框被设为 `report-date-input`，不覆盖按钮，只有 `onchange` 后才应用。

卖进数据金额文案：

- 汇总：`总实收：xx.xx`
- 卡片：`实收：xx.xx`
- 不显示金钱 emoji。

### 线外新门店

`store_new.html` 管理手动创建的新门店：

- 创建新门店时生成 `NEW_` 前缀临时门店编码。
- 新门店提交第一张单后写入 `employee_store_assets`。
- 新门店卡片不显示临时编码。
- 新门店卡片不再单独显示“去开单/历史”按钮，点击卡片直接进入开单/历史。
- 删除线外门店前会检查 `sales_orders` 是否还有历史单据。
- 如果还有历史单据，不允许删除，并提示先删除历史单据再删除门店。

## 5. 后台当前行为

`dashboard.html` 负责后台汇总和导出。

### 趋势图

卖进趋势图已改为 SVG 折线：

- 使用 `renderTrendLine()`。
- 点使用圆形 `circle`，并用 `preserveAspectRatio="xMidYMid meet"` 避免非等比缩放导致圆点变形。
- 已去掉上方冗余说明。

### 日期筛选

后台日期筛选支持：

- 固定范围按钮。
- 一个自定义范围选择入口。
- 选择范围时先点开始日期，再点结束日期；反向选择会通过 `normalizeCustomDateRange()` 归一化。

导出文件名使用当前筛选日期范围：

- 单日：`开单明细_07-01.xlsx`
- 多日：`开单明细_06-25-07-01.xlsx`
- 全部：`开单明细_全部历史.xlsx`

### 开单明细导出

`exportOrderExcel()` 导出开单明细 Excel。

列结构类似：

```text
开单日期 / 员工 / 员工号 / 门店编号 / 门店 / 商品名 / 条码 / 整数 / 整价 / 散数 / 散价 / 金额
```

线外门店会被分到第二个 sheet：

- Sheet1：普通门店。
- Sheet2：`线外门店`。

拼盒导出规则：

- 读取 `products.pcs_per_box`。
- 对 `sale_unit === '拼盒'` 的明细，按 `brand + spec` 聚合。
- 数量显示到 `整数`，值为 `sale_qty / pcs_per_box`。
- 单价显示到 `整价`，值为 `sale_unit_price`。
- 金额求和。

## 6. 商品维护页当前行为

`products.html` 已支持拼盒标记：

- 商品表格有 `拼盒` 列。
- 新增商品行有 `new_allow_mix_box` 复选框。
- 编辑字段包含 `allow_mix_box`。
- 筛选字段包含 `allow_mix_box`。
- 保存商品时会写入 `allow_mix_box`。

建议配置方式：

- 同一个可拼盒规格下，参与拼盒的各口味都勾选 `拼盒`。
- `pcs_per_box` 就是拼盒成盒数量，不需要额外 `mix_box_size`。

## 7. 验证方式

本项目没有构建步骤。推荐用 bundled Node 运行静态测试：

```powershell
$node='C:\Users\10703\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\store-dashboard-behavior.test.mjs
& $node tests\mix-box.test.mjs
& $node tests\delivery-note-download.test.mjs
& $node tests\price-link-ui.test.mjs
& $node tests\stock-quantity-display.test.mjs
& $node tests\new-store-export.test.mjs
git diff --check
```

语法检查可用：

```powershell
$node='C:\Users\10703\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
@'
const fs = require('fs');
const vm = require('vm');
for (const file of ['store-app.js']) {
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
}
for (const file of ['products.html','dashboard.html']) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => m[1])
    .filter(s => !s.includes('cdn.jsdelivr.net'));
  scripts.forEach((script, i) => new vm.Script(script, { filename: `${file}#script${i + 1}` }));
}
console.log('syntax ok');
'@ | & $node -
```

## 8. 当前已知风险

### 8.1 部分文件存在乱码

当前 `store.html`、`store_stock.html`、`store_report.html`、`store_new.html` 的页面壳文本存在可见乱码，例如标题、搜索框 placeholder、返回按钮文字。`store-app.js` 中主要动态 UI 文案大部分仍是正常中文或 Unicode escape。

部分测试文件里也有乱码断言。后续修 UI 文案时要先整体确认编码，避免继续把正常中文写坏。

### 8.2 `dashboard.html` 被检测到 NUL 字节

`rg` 检索时提示 `dashboard.html` 是 binary file，并在文件中检测到 NUL 字节。当前页面脚本还能被读取到，但后续编辑前建议先清理 NUL 字节并做完整语法检查。

### 8.3 `tests/static-regression.test.mjs` 可能滞后

当前更可靠的是按功能拆开的测试文件。`static-regression.test.mjs` 包含较旧的断言，后续如果恢复全量静态测试，建议先更新这个文件。

### 8.4 CSS 被压缩成一行

`store-style.css` 是一行大文件，后续小改容易造成难审 diff。建议等业务稳定后单独做一次格式化提交，不要和功能改动混在一起。

## 9. 后续建议任务

优先级从高到低：

1. 修复页面壳乱码：集中处理 `store.html`、`store_stock.html`、`store_report.html`、`store_new.html`，并补一个防乱码静态测试。
2. 清理 `dashboard.html` 的 NUL 字节，并运行后台导出相关检查。
3. 整理 `store-style.css` 格式，降低后续维护成本。
4. 如果业务确实需要，卖进数据页的 `日期选择` 再升级为范围选择；当前门店端还是单日选择。
5. 把 Supabase 线上 `submit_sales_order_v2` 的最终版本同步成仓库 migration，避免数据库函数和仓库脚本继续漂移。

## 10. 开发注意事项

- 不要把开单页价格改回手动输入框。
- 不要把开单页顺序改回整在上、散在下。
- 不要改 `submitOrder()` 的库存扣减和 RPC 参数，除非同时验证改单、删单、拼盒、送货单、后台导出。
- 不要让线外门店出现在普通门店列表。
- 不要让送货单显示系统内部字段。
- 不要让生成单据重新弹出预览层；当前需求是直接下载图片。
- 涉及中文文本编辑时，优先用 UTF-8 明确写入并检查页面源码，避免再次出现乱码。
