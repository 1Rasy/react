# 库存调整 Phase C 接手提示词

把下面内容完整发送给 Codex。开始执行前必须先读取仓库文档，不要根据旧聊天或旧审查评论自行恢复过时方案。

---

请接手仓库 `1Rasy/spr` 的 PR #3：`feat: add stock adjustment phase C`，继续在原分支 `feat/stock-adjustment-phase-c` 上工作。

## 一、开始前读取

必须按顺序读取：

1. `docs/status/STOCK-ADJUSTMENT-PHASE-C.md`
2. `docs/handoff/STOCK-ADJUSTMENT-PHASE-C-HANDOFF.md`
3. `docs/decisions/STOCK-ADJUSTMENT-UI-002.md`
4. `docs/decisions/BRANCH-TEST-FILES-001.md`
5. `docs/decisions/IMPLEMENTATION-STATUS-SYNC-001.md`
6. `docs/superpowers/plans/2026-07-12-stock-adjustment-stabilization.md`
7. PR #3 最新描述、最新提交和最新评论

以仓库状态文档和最新 UI 决策为准，不要根据早期审查评论恢复已经被用户否定的界面。

## 二、当前阶段

当前不是继续扩展新功能，而是库存调整 Phase C 的稳定性收口和页面问题修复阶段。

工作目标：

1. 根据状态文档和用户反馈修复实际页面问题；
2. 保持员工端原子提交与现有数据库业务规则；
3. 完整验证员工提交、管理员审核、库存变化和库存流水；
4. 更新测试、状态文档和两个分支。

PR 保持 Draft，不要合并，不要改成 Ready for review。

## 三、当前已确认的员工端规则

必须保持：

- 库存修改入口位于库存管理页；
- 进入修改页时不能先显示库存管理页上跳或闪动；
- 修改页只保留一个返回按钮；
- 商品名称下方不重复显示规格口味行；
- 增加在上、减少在下，竖向排列在数量控件左边；
- 只调整整数散数；
- 散数使用开单页相同的 1–25、5×5 数量弹窗；
- 当前库存和预计库存左对齐；
- 待审核、已驳回、未提交草稿、历史记录、已撤回申请位于页面上方并分开显示；
- 页面主体不提前显示修改原因；
- 点击提交后才弹出原因和备注面板；
- 原因只保留盘点差异、破损报废、调货、其他；
- 不存在“漏录入库”；
- 编辑负数申请时恢复为“减少 + 绝对值散数”；
- 单商品方向和数量变化只更新当前行与摘要，不重新加载整页。

禁止恢复：

- 箱、盒、整件、价格输入；
- 普通数字输入框；
- 增加/减少下拉框；
- 开单首页顶层库存调整入口；
- “漏录入库”原因；
- 与销售、售后、ERP 有关的新范围。

## 四、网页验收与部署分工

测试分支为：

```text
stock-adjustment-phase-c
```

工作方式：

1. 完成代码和自动化验证后，把同一提交推送到 `feat/stock-adjustment-phase-c`；
2. 将 `stock-adjustment-phase-c` 同步到相同提交；
3. Vercel 会自动部署测试分支；
4. 不需要手动操作 Vercel，不要查询项目权限、部署列表、状态、预览链接或连接器访问能力；
5. 用户负责打开自动部署后的网页完成实际交互验收；
6. 用户反馈具体页面问题或复现步骤后，再开始下一轮修复。

不要把自己无法读取 Vercel 项目或预览页面写成阻塞项，也不要为此额外排查部署平台。开发者一侧的交付边界是：已验证提交成功推送并同步到测试分支。

## 五、当前原子提交实现

员工端已经改为只调用：

```text
save_and_submit_stock_adjustment_request
```

该 RPC 在同一个数据库事务内完成：

- 新建或更新申请；
- 替换明细；
- 校验原因和整数散数；
- 提交为待审核；
- 更新版本和提交时间；
- 写入历史；
- 返回完整申请快照。

任何一步失败必须整单回滚，不能留下草稿、部分明细或多余历史。

不要修改已经应用的旧 migration，新的数据库变化必须新增 migration。

必须保持：

- `stock-adjustment-api.js` 使用 `saveAndSubmit(...)`；
- `store-stock-adjustment.js` 只调用一次 `stockAdjustmentApi.saveAndSubmit(...)`；
- 提交失败时保留商品、方向、数量、原因、说明和备注；
- 提交成功后再清空并刷新；
- 旧的 `save` 和 `submit` API 暂时保留。

## 六、真实业务回归

至少验证：

1. 增加库存申请通过后库存增加并生成一条流水；
2. 减少库存申请通过后库存减少，允许结果为负数；
3. 多商品同时包含增加和减少；
4. 驳回不改库存，编辑重提保留方向、数量、原因和备注；
5. 撤回不改库存，编辑重提成功；
6. 重复提交、重复同意、重复驳回不会产生重复状态或流水；
7. 任一商品失败时整单回滚；
8. 负数申请编辑时正确恢复减少；
9. 其他原因必须填写说明；
10. 库存流水页能查到审核通过产生的流水。

测试数据必须明确标记，并在结束后删除或事务回滚。记录每个场景的请求号、商品、调整前库存、调整后库存、流水数量和清理结果。

## 七、测试

实际运行：

```bash
node --check stock-adjustment-api.js
node --check store-stock-adjustment.js
node --check store-qty-popup.js
node --check stock-adjustment-review.js
node --check inventory-movements-page.js

node --test tests/stock-adjustment-api.test.mjs
node --test tests/stock-adjustment-employee-ui.test.mjs
node --test tests/stock-adjustment-core.test.mjs
node --test tests/stock-adjustment-pages.test.mjs
node --test tests/inventory-movement-export.test.mjs
node --test tests/utf8-source-guard.test.mjs
node --test tests/*.test.mjs
```

必须报告真实命令、通过数、失败数和既有失败。区分静态测试和真实数据库流程。分支自动部署不代替功能测试；实际页面表现由用户验收并反馈。

## 八、文档和分支同步

每轮代码修改必须在同一次推送中：

1. 更新测试；
2. 更新 `docs/status/STOCK-ADJUSTMENT-PHASE-C.md`；
3. 必要时更新接手文档和实施计划；
4. 推送 `feat/stock-adjustment-phase-c`；
5. 将 `stock-adjustment-phase-c` 同步到相同提交；
6. 确认两个分支 `status=identical`、`ahead_by=0`、`behind_by=0`；
7. 更新 PR #3 描述中的最新提交和真实测试结果。

源码、`tests/` 和 `docs/` 必须在同一个提交。

## 九、完成后回复

只报告：

- 实际发现的问题；
- 修改的文件；
- 原子提交如何实现；
- 真实业务回归结果；
- 测试命令及通过/失败数量；
- 最新提交；
- 两个分支是否一致；
- 状态文档是否已更新。

不要报告 Vercel 权限、连接器或部署读取情况。不要合并 PR。
