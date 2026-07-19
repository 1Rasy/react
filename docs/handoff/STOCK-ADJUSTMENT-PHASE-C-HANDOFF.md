# 库存调整 Phase C 接手文档

- 当前阶段：稳定性收口代码、数据库和自动化验证已完成；等待用户在自动部署的测试页面完成实际交互验收
- PR：`#3 feat: add stock adjustment phase C`
- PR 分支：`feat/stock-adjustment-phase-c`
- 网页测试分支：`stock-adjustment-phase-c`
- 合并状态：继续保持 Draft，不得合并或转为 Ready for review
- 唯一进度入口：`docs/status/STOCK-ADJUSTMENT-PHASE-C.md`

## 1. 已完成内容

### 原子提交

- 新增 `database/20260712_stock_adjustment_atomic_submit.sql`。
- 新增 `save_and_submit_stock_adjustment_request` RPC。
- RPC 在一个 PostgreSQL 语句事务中调用既有保存和提交函数；任一步异常会整体回滚。
- 员工端改为一次 `stockAdjustmentApi.saveAndSubmit(...)` 调用。
- 旧 `save`、`submit` API 和旧 migration 均保留，未修改已应用 migration。
- 新 migration 已应用到 Supabase 项目 `wyjbnnqhiehjccmojbbg`。

### 员工端稳定性

- 提交失败保留商品、方向、数量、原因、说明和备注。
- 失败后关闭并重开提交面板，表单值仍恢复。
- 共享核心只保留盘点差异、破损报废、调货、其他。
- 共享核心数量计算只接受整数散数，不再计算箱或盒。
- 最新 UI 决策中的十项规则均有源码契约和定向测试覆盖。

### 数据库回归

`tests/stock-adjustment-database-regression.sql` 已由占位注释改为可执行事务脚本，覆盖：

1. 增加并审核；
2. 减少并允许负库存；
3. 多商品增减混合；
4. 驳回后编辑重提；
5. 撤回后编辑重提；
6. 重复提交、同意和驳回保护；
7. 任一商品失败整单回滚；
8. 负数申请编辑语义；
9. “其他”必须填写说明；
10. 流水查询审核通过记录。

真实 Supabase 回归结果 10/10 PASS。测试使用 `KD2_PHASE_C_TEST_*` 和 `KD2_ADMIN` 标记，外层事务结束后独立确认申请、明细、历史、流水均为 0。

## 2. 测试结果

语法检查 5/5 PASS：

```bash
node --check stock-adjustment-api.js
node --check store-stock-adjustment.js
node --check store-qty-popup.js
node --check stock-adjustment-review.js
node --check inventory-movements-page.js
```

定向 Node 测试：

- API：5/5
- 员工 UI：16/16
- 核心：6/6
- 审核和流水页：3/3
- 导出：3/3
- UTF-8：2/2
- migration 契约：9/9

全量：

```bash
node --test tests/*.test.mjs
```

结果：44/44 PASS，失败 0，跳过 0，没有既有失败。

Node 测试是静态源码契约、语法和本地纯逻辑测试；数据库 10 个场景才是真实业务测试。

## 3. 网页测试分支工作方式

- 接手人员完成修改和自动化验证后，将同一提交推送到 `feat/stock-adjustment-phase-c`，并同步到 `stock-adjustment-phase-c`。
- `stock-adjustment-phase-c` 推送后由 Vercel 自动部署，开发者不需要手动操作 Vercel。
- 不需要查询 Vercel 项目权限、部署列表、检查状态、预览地址或连接器访问能力，也不要把这些事项写成开发阻塞。
- 用户负责打开自动部署后的网页完成实际交互验收，并将页面问题或复现步骤反馈给开发者。
- 开发者只根据用户反馈继续修复，不因自己无法访问 Vercel 而额外排查部署平台。

## 4. 后续限制

- 不新增库存调整范围或界面。
- 不恢复箱、盒、整件、价格、数字输入框、方向下拉框、开单首页入口或“漏录入库”。
- 不修改已应用旧 migration。
- PR #3 保持 Draft，不合并。
- 两个分支必须保持同一提交，源码、`tests/` 和 `docs/` 同步更新。
