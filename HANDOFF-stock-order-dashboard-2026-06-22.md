# 开单 / 库存 / 管理看板交接文档

更新时间：2026-06-22  
仓库：`1Rasy/spr`  
当前工作分支：`codex/products-excel-style-filters`  
Supabase Project ID：`wyjbnnqhiehjccmojbbg`

---

## 1. 当前项目定位

这是一个静态 HTML + Supabase 的开单、库存、商品、员工、管理看板系统。

主要页面：

| 页面 | 用途 |
|---|---|
| `index.html` | 员工入口 |
| `store.html` | 员工开单、门店历史、库存配置、卖进数据 |
| `dashboard.html` | 管理后台 / 卖进看板 / 开单明细导出 |
| `stock_summary.html` | 管理端库存汇总与库存 Excel 导出 |
| `products.html` | 商品表管理、商品排序、单位维护 |
| `employees.html` | 员工表、经销商客户编号映射 |
| `stock_import.html` | 经销商库存导入入口 |
| `store_import.html` | 门店导入入口 |
| `tests/static-regression.test.mjs` | 静态回归断言 |

---

## 2. 这轮完成的核心改动

### 2.1 管理看板 `dashboard.html`

当前状态：

- 页面入口仍叫“管理后台”。
- 卖进数据默认看本月。
- 可切换：
  - 今天
  - 近 7 天
  - 本月
  - 全部历史
  - 自定义日期
- 员工筛选已经从搜索框改成“员工按钮 / chips”：
  - 默认 `全部`
  - 下面直接显示有卖进数据的员工姓名
  - 点员工后同步刷新所有指标和排行
- 顶部指标只保留 4 个：
  - 卖进金额
  - 卖进单据
  - 卖进门店数
  - 平均客单价
- 已删除：
  - 动销人员
  - 最近卖进单据
  - 已加载 xx 张卖进单据绿色提示
  - 指标卡底部小提示
- “覆盖门店”已改为“卖进门店数”。
- 卖进排行默认显示在左侧主区域，不再做左右分栏。

### 2.2 管理看板导出开单明细

`dashboard.html` 新增按钮：

```text
导出开单单据
```

导出格式：真正 `.xlsx`，使用 SheetJS：

```html
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
```

导出会跟随当前筛选：

- 日期范围
- 员工按钮筛选

当前导出是“订单明细级”，一行一个商品明细。

导出表头：

```text
开单日期 / 员工 / 员工号 / 门店编号 / 门店 / 商品名 / 条码 / 价格 / 散数
```

已按要求去掉：

```text
单号
状态
```

开单日期只精确到天。

注意：`sales_order_items` 真实字段是：

```text
order_no
barcode
product_name
unit_price
qty
```

不是：

```text
order_id
price
```

所以导出逻辑已经改为用：

```js
.from('sales_order_items')
.select('order_no, barcode, product_name, unit_price, qty')
.in('order_no', orderNos)
```

---

## 3. 库存管理页 `stock_summary.html`

当前状态：

- 页面标题：`库存管理`
- 管理后台入口文字：`库存管理`
- 已删除：
  - 总库存管理
  - 复制核对清单
  - 绿色“已加载 xx 条库存”提示
  - 主要库存列
  - 需要重点核对
  - 员工工号副标题
  - 商品副标题
- 员工库存列表只显示员工名字，不在名字下方显示工号。
- 明细表格已修正错位问题：
  - 使用固定布局
  - 商品列、条码列、库存列、换算列分别固定宽度
  - 单元格顶部对齐
- 库存 Excel 导出已改成真正 `.xlsx`，不再是假 `.xls` HTML 文件。

库存导出表头：

```text
员工名字 / 员工号 / 商品名 / 条码 / 库存散数
```

导出会跟随当前筛选：

- 搜索框
- 只看非零库存

### 3.1 库存单位

库存管理页现在从 `products.unit` 取散件单位。

例如产品单位是 `袋`，换算显示就会变成：

```text
1件 2盒 3袋
```

不再固定显示 `散`。

---

## 4. 开单页 / 员工端 `store.html`

### 4.1 商品排序修复

问题原因：

之前 `products.html` 商品表虽然维护了 `sort_order`，但是 `store.html` 拉商品时没有按 `sort_order / id` 排序；品牌、规格也是直接用 `Set` 去重，实际顺序依赖当前数组顺序，所以看起来和商品表排序无关。

已修复：

- 拉取商品时按：

```js
.order('sort_order', { ascending: true })
.order('id', { ascending: true })
```

- 前端统一排序规则：

```text
sort_order 优先
没有 sort_order 再按 products.id
最后按商品名兜底
```

- 品牌按钮、规格按钮、商品列表都使用同一个排序规则生成。

### 4.2 开单页散件单位

现在开单页从 `products.unit` 取散件单位。

影响位置：

- 销售散件选择器
- 退回数量选择器
- 赠送数量选择器
- 订单详情里的正常销售换算
- 搭送赠品单位
- 售后退货单位

不再固定写死：

```text
个
袋
散
```

### 4.3 库存页散件单位

员工端库存配置页也从 `products.unit` 取单位。

影响位置：

- 当前库存量换算
- 当前库存量括号内单位
- 增库 / 减库散件选择器单位

### 4.4 允许库存为负继续开单

已按要求调整：库存没有及时导入时，也允许正常开单。

前端不再因为库存不足拦截。

提交成功后提示：

```text
✅ 开单成功
```

---

## 5. Supabase 数据库改动

### 5.1 已直接修改函数 `submit_sales_order_v2`

Supabase 里原来的 `submit_sales_order_v2` 有库存负数拦截：

```plpgsql
IF COALESCE(v_stock.qty, 0) < 0 THEN
  RAISE EXCEPTION '商品 [%] 车销可用库存不足，无法提交账单！', v_stock.product_barcode;
END IF;
```

已经删除。

现在函数允许 `van_stocks.qty` 写入负数。

函数仍然会：

1. upsert `sales_orders`
2. 删除原订单明细
3. 插入 `sales_order_items`
4. upsert `van_stocks`
5. 返回 `SUCCESS`

重要：这个数据库函数是直接在 Supabase 上改的，不是通过仓库 migration 文件提交的。后续如果做正式迁移，建议把这个函数定义补成 SQL migration，避免环境漂移。

### 5.2 真实字段确认

`submit_sales_order_v2` 使用的明细 JSON 字段：

```text
barcode
product_name
qty
unit_price
amount
remark
```

`sales_order_items` 表实际关联订单字段：

```text
order_no
```

不是 `order_id`。

---

## 6. 商品表 `products.html`

商品表已经有排序能力。

关键字段：

```text
id
sort_order
barcode
name
brand
spec
flavor
default_price
pcs_per_case
pcs_per_box
unit
is_active
```

排序逻辑：

```text
sort_order 优先
没有 sort_order 再按 id
```

`unit` 字段现在已经被员工端开单页和库存页使用。

如果商品表里 `unit` 为空，前端兜底为：

```text
个
```

---

## 7. 最近关键提交

当前分支：

```text
codex/products-excel-style-filters
```

最近关键提交：

```text
aec31c1 Respect product sorting and units in store flows
c0a44b2 Use product units in stock summary
```

更早的重要提交包括：

```text
5f1d910 Use employee chips for dashboard filtering
947069d Assert dashboard employee chip filters
b9298f0 Add dashboard order export and hide loaded status
0ed41a4 Assert dashboard order export
31b95b4 Export order item details from dashboard
d004e1e Assert dashboard order item export
7b818ae Use order number for item detail export
8eb9cf4 Assert order number based item export
5048ceb Export stock summary as real xlsx
a0472db Assert real xlsx stock export
```

---

## 8. 已知风险 / 注意事项

### 8.1 `store.html` 被压缩成较紧凑的单文件

`store.html` 当前仍可读，但为了快速改动，HTML/CSS/JS 比之前更紧凑。后续如果继续大量维护，建议拆分成：

```text
store.html
store.css
store.js
```

或者至少把 JS 格式化。

### 8.2 SheetJS 使用 CDN

当前 Excel 导出依赖：

```text
https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
```

如果后续国内部署或网络不稳定，建议把 `xlsx.full.min.js` 放到仓库本地，例如：

```text
vendor/xlsx.full.min.js
```

然后页面改成本地引用。

### 8.3 数据库 RLS 安全

之前 Supabase 提示过：public 表 RLS 多数关闭。

目前按用户要求先忽略安全性，但正式上线前必须处理：

- 匿名 key 可读写风险
- 管理后台无登录风险
- 前端暴露 Supabase publishable key

### 8.4 库存允许负数后的业务影响

现在开单允许库存负数，这符合当前需求：库存未及时导入时也能开单。

但后续报表中可能出现：

```text
库存负数
库存异常
```

这是预期结果，不再作为开单失败条件。

---

## 9. 下一步建议

1. 重新部署当前分支。
2. 在手机端测试：
   - 员工开单
   - 库存配置页
   - 商品品牌 / 规格排序
   - 单位显示
   - 库存为负时开单是否成功
3. 在管理后台测试：
   - 员工按钮筛选
   - 卖进金额 / 单据 / 门店数 / 客单价是否跟随筛选
   - 导出开单明细 Excel
   - 导出库存 Excel
4. 建议补一个 SQL migration，把 `submit_sales_order_v2` 的最新定义放进仓库。
5. 后续考虑本地化 SheetJS，避免 CDN 被墙或加载失败。

---

## 10. 交接给下一个 AI / Codex 的提示词

可以直接把下面这段给下一个 AI：

```text
你现在接手仓库 1Rasy/spr，分支 codex/products-excel-style-filters。
这是一个静态 HTML + Supabase 的开单、库存、管理后台系统。
重点文件：store.html、dashboard.html、stock_summary.html、products.html、employees.html、tests/static-regression.test.mjs。

当前最新需求已经处理：
1. dashboard.html 管理看板使用员工按钮筛选，不用员工搜索框。
2. dashboard.html 顶部指标为卖进金额、卖进单据、卖进门店数、平均客单价，并跟随日期和员工筛选。
3. dashboard.html 已删除最近卖进单据、动销人员、绿色已加载提示。
4. dashboard.html 导出开单明细 Excel，导出字段为：开单日期、员工、员工号、门店编号、门店、商品名、条码、价格、散数。不要导出单号和状态。sales_order_items 用 order_no 关联，不存在 order_id；价格字段是 unit_price，不是 price。
5. stock_summary.html 库存管理导出真正 xlsx，字段为员工名字、员工号、商品名、条码、库存散数。
6. stock_summary.html 和 store.html 都需要从 products.unit 读取散件单位。
7. store.html 开单页和库存页的品牌、规格、商品列表排序必须按 products.sort_order 优先、products.id 兜底。
8. 开单允许库存变负，不要因为库存不足拦截。Supabase 函数 submit_sales_order_v2 已经删除负库存 RAISE EXCEPTION。

注意：submit_sales_order_v2 是直接在 Supabase 上改的，仓库里还没有 migration，后续最好补 SQL migration。
```
