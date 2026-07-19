# 库存调整 Phase C 当前进度

- 状态：稳定性收口、真实数据库回归、管理后台 UI 统一、审核历史和流水日期组件均已完成代码与定向验证
- 最后同步日期：2026-07-13
- PR 分支：`feat/stock-adjustment-phase-c`
- 网页测试分支：`stock-adjustment-phase-c`
- PR：#3，继续保持 Draft，不合并、不转为 Ready for review
- 本文用途：后续开发者继续工作的唯一进度入口

> 代码、测试和本文必须同步到同一个提交。测试分支推送后由平台自动部署，页面实际验收由用户完成；开发者不操作或排查 Vercel。

## 1. 已完成的核心能力

### 员工端原子提交

- 新增 `save_and_submit_stock_adjustment_request`。
- 员工端提交改为一次 `stockAdjustmentApi.saveAndSubmit(...)` 调用。
- 保存、明细、状态、版本、提交时间和历史中的任一步失败，整条 RPC 回滚。
- 提交失败保留商品、方向、数量、原因、说明和备注；成功后才清空。
- 调整原因只保留盘点差异、破损报废、调货和其他。
- 数量只接受整数散数，允许审核后库存为负数。

### 管理后台桌面 UI

库存流水和库存调整审核已统一为与库存管理页一致的桌面后台视觉：

- 浅灰背景、紫色主色、白色卡片、圆角和高信息密度表格。
- 页面按桌面宽屏设计，不增加手机卡片布局。
- 查询、审核、驳回、导出及数据库业务规则保持不变。

## 2. 本轮新增：审核历史

新增 migration：

- `database/20260713_stock_adjustment_review_history.sql`

新增 RPC：

- `get_stock_adjustment_review_history(p_limit integer default 100)`

实现边界：

- 只返回当前状态为 `approved` 或 `rejected` 的审核完成申请。
- 按审核时间倒序排列。
- 默认最近 100 条，数据库限制范围为 1–500 条。
- 返回申请信息及商品名称、规格、口味、条码和调整数量。
- 使用固定 `search_path = pg_catalog, public`。
- 显式撤销默认执行权限，再按项目现有前端架构授权 `anon, authenticated`。

审核页面新增“审核历史”区域：

- 每条历史记录默认折叠，避免页面过长。
- 显示申请单号、员工、已通过/已驳回、审核时间、审核人和提交时间。
- 显示调整原因、补充说明和备注。
- 驳回记录显示驳回理由。
- 展开后显示商品及调整数量。
- 审核通过或驳回后，待审核队列和历史记录一起刷新。

## 3. 本轮新增：库存流水日期范围组件

原“开始日期 + 结束日期”原生输入框已替换为 dashboard 首页同款组件：

- 本日
- 昨日
- 近 7 天
- 本月
- 全部历史
- 自定义双月日期范围面板

实现规则：

- 快捷日期按钮点击后立即查询。
- 自定义日期支持先选开始日期，再选结束日期。
- 选择顺序反向时自动交换起止日期。
- 保留隐藏的 `start`、`end` 字段，现有流水 RPC 和 Excel 导出参数不变。
- “全部历史”使用 `2000-01-01` 至当天作为查询范围，以兼容现有 RPC 必填日期参数。
- 业务员、变化类型、查询和导出功能保持原样。

新增样式文件：

- `stock-adjustment-admin-enhancements.css`

该文件只包含审核历史和 dashboard 日期组件的补充样式，不重构其他后台页面。

## 4. 数据库验证

Supabase 项目：`wyjbnnqhiehjccmojbbg`。

已应用 migration：

- `stock_adjustment_review_history`

实际执行：

```sql
select jsonb_array_length(public.get_stock_adjustment_review_history(100));
```

结果：RPC 正常返回，当前数据库命中 2 条审核历史；抽样记录包含完整申请信息和商品明细。

安全顾问结果：

- 新 RPC 固定了 `search_path`，未产生搜索路径缺失告警。
- 顾问仍提示项目现有匿名 `SECURITY DEFINER` RPC 架构风险；该警告与既有库存调整 RPC 相同，本轮未扩大到认证和权限体系重构。

## 5. 自动化验证

本轮先增加新测试并在旧页面上确认失败：

- 审核历史测试：FAIL
- dashboard 日期组件测试：FAIL

完成实现后的新鲜验证：

```bash
node --check stock-adjustment-api.js
node --check stock-adjustment-review.js
node --check inventory-movements-page.js
node --test tests/stock-adjustment-api.test.mjs tests/stock-adjustment-pages.test.mjs tests/stock-adjustment-review-history.test.mjs
```

结果：

- JavaScript 语法检查：3/3 PASS
- 定向 Node 测试：17/17 PASS
- 失败 0，跳过 0

此前稳定性收口全量测试：

- `node --test tests/*.test.mjs`：44/44 PASS

本轮没有重新声明新的全量测试数量；17/17 是针对 API、审核/流水页面和新 migration 的新鲜定向验证。

## 6. 真实数据库业务回归

此前已完成 10/10 PASS：

1. 增加库存并生成流水；
2. 减少库存并允许负数；
3. 多商品混合增减；
4. 驳回后编辑重提；
5. 撤回后编辑重提；
6. 重复提交、同意和驳回保护；
7. 任一商品失败整单回滚；
8. 负数申请恢复为减少 + 绝对值；
9. 其他原因必须填写说明；
10. 流水查询命中审核流水。

测试事务结束后确认申请、明细、历史和流水测试残留均为 0。

## 7. 本轮主要修改文件

- `database/20260713_stock_adjustment_review_history.sql`
- `stock-adjustment-api.js`
- `stock-adjustment-review.html`
- `stock-adjustment-review.js`
- `inventory-movements.html`
- `inventory-movements-page.js`
- `stock-adjustment-admin-enhancements.css`
- `tests/stock-adjustment-api.test.mjs`
- `tests/stock-adjustment-pages.test.mjs`
- `tests/stock-adjustment-review-history.test.mjs`
- `docs/status/STOCK-ADJUSTMENT-PHASE-C.md`

## 8. 完成边界

- 将最终提交同步到 `stock-adjustment-phase-c` 后，开发者一侧交付完成。
- 用户在自动部署页面验收审核历史和流水日期选择器的实际视觉及操作。
- 用户反馈具体页面问题后再进入下一轮修复。
- PR #3 必须继续保持 Draft，不得合并或转为 Ready for review。
