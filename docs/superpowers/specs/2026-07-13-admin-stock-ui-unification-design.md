# 管理后台库存页面 UI 统一设计

## 目标

将 `stock-adjustment-review.html`（库存调整审核）和 `inventory-movements.html`（库存流水）统一为与 `stock_summary.html`（库存管理）一致的桌面后台视觉体系。

本次只调整页面结构、信息层级和样式，不修改查询、审核、驳回、导出、数据库或 API 行为。

## 使用场景

- 使用者：管理后台操作人员。
- 主要设备：桌面电脑和宽屏浏览器。
- 不为手机阅读单独设计，不把宽表格改成卡片列表。
- 页面可以横向滚动，但核心操作区必须在常见桌面宽度内清晰可见。

## 已实施结果

### 统一视觉

- 页面背景、主色、卡片、圆角、阴影和表格样式与库存管理页保持一致。
- 页面使用最大宽度 1280px 的桌面容器，并设置桌面最小宽度。
- 不增加移动端媒体查询或手机卡片布局。

### 库存流水

- 新增统一标题区、返回管理看板、刷新按钮和单行筛选区。
- 保留开始日期、结束日期、业务员、变化类型、查询和 Excel 导出。
- 表格保留全部字段和顺序。
- 数量增加显示绿色，减少显示红色，零值显示灰色。
- 新增加载、错误、结果数量和空状态。

### 库存调整审核

- 新增统一标题区、返回管理看板和刷新按钮。
- 新增待审核申请数和待审核商品行数概览。
- 每个申请使用独立分组卡片，展示申请单号、员工、提交时间、原因、说明、备注和商品明细。
- 同意按钮保持紫色主按钮，驳回按钮使用红色描边。
- 保留原有 `prompt` 驳回理由、API 调用和防重复操作逻辑。

## 修改文件

- `stock-adjustment.css`
- `stock-adjustment-review.html`
- `stock-adjustment-review.js`
- `inventory-movements.html`
- `inventory-movements-page.js`
- `tests/stock-adjustment-pages.test.mjs`
- `docs/status/STOCK-ADJUSTMENT-PHASE-C.md`

## 验证

- `node --check stock-adjustment-review.js`：PASS
- `node --check inventory-movements-page.js`：PASS
- `node --test tests/stock-adjustment-pages.test.mjs`：6/6 PASS

页面实际效果由用户在 `stock-adjustment-phase-c` 自动部署页面上验收。
