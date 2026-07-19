# Stock Adjustment Phase C Implementation Plan and Completion Record

> 本文件既记录实施计划，也记录截至 2026-07-12 已完成的工作。后续进度以 `docs/status/STOCK-ADJUSTMENT-PHASE-C.md` 为统一入口。

**Goal:** 在库存管理页内完成员工库存修改申请、管理员审核和库存流水，并保持与开单页一致的散数交互。

**Architecture:** 保持静态 HTML 与经典脚本结构；各页面通过 `StockAdjustmentApi.create(client)` 显式注入 Supabase client；员工端状态保存在 `store-stock-adjustment.js`；数量弹窗由 `store-qty-popup.js` 复用；单商品修改只局部更新。

**Tech Stack:** Vanilla JavaScript、Supabase JS v2、PostgreSQL、Node.js 内置测试运行器。

## Global Constraints

- PR #3 在用户明确确认前不合并。
- 员工端只修改散数整数。
- Vercel 分支 `stock-adjustment-phase-c` 必须包含完整 `tests/` 目录。
- PR 分支和 Vercel 测试分支必须指向同一提交。
- 每次实现更新必须同步更新 `docs/status/STOCK-ADJUSTMENT-PHASE-C.md`。
- 只报告实际运行过的测试，不把静态关键词检查描述为真实事务测试。

---

### Task 1: Restore UTF-8 source integrity

**Files:**
- `stock-adjustment-api.js`
- `store-stock-adjustment.js`
- `stock-adjustment-review.js`
- `inventory-movements-page.js`
- `tests/utf8-source-guard.test.mjs`

- [x] 编写会拒绝乱码源码并执行语法检查的测试。
- [x] 从最后一个未损坏提交恢复源码。
- [x] 确认 UTF-8 防回归测试通过。

### Task 2: Inject Supabase client into the shared API

**Files:**
- `stock-adjustment-api.js`
- `tests/stock-adjustment-api.test.mjs`

- [x] 编写 `create(client)`、RPC 映射和错误转换测试。
- [x] 移除对 `window.client` 的隐式依赖。
- [x] 员工页、审核页和流水页均显式传入本页 client。

### Task 3: Rebuild employee stock-adjustment interaction

**Files:**
- `store-stock-adjustment.js`
- `store-qty-popup.js`
- `store-stock-adjustment.css`
- `tests/stock-adjustment-employee-ui.test.mjs`

- [x] 增加/减少改为直接按钮。
- [x] 只保留散数，不显示箱、盒、整或价格。
- [x] 复用开单页 1–25、5×5 数量弹窗。
- [x] 单商品变化只更新当前行和摘要。
- [x] 编辑负数申请恢复“减少 + 绝对值散数”。
- [x] 进入库存修改页时避免原库存页返回按钮先消失造成页面上跳。
- [x] 库存修改页只显示一个返回按钮。
- [x] 删除商品名称下重复的规格口味文字行。
- [x] 增加/减少竖向排列在数量左侧。
- [x] 当前库存与预计库存左对齐。

### Task 4: Reorganize request history and submission flow

**Files:**
- `store-stock-adjustment.js`
- `store-stock-adjustment.css`
- `tests/stock-adjustment-employee-ui.test.mjs`

- [x] 申请记录移动到品牌、规格和商品列表之前。
- [x] 待审核与已驳回拆分。
- [x] 分区展示待审核、已驳回、草稿、历史和已撤回申请。
- [x] 页面主体移除原因和备注输入框。
- [x] 点击提交按钮时才打开原因选择面板。
- [x] 原因删除“漏录入库”，保留盘点差异、破损报废、调货、其他。

### Task 5: Repair review and movement pages

**Files:**
- `stock-adjustment-review.js`
- `inventory-movements-page.js`
- `tests/stock-adjustment-pages.test.mjs`

- [x] 审核页接入共享 API。
- [x] 流水页接入共享 API。
- [x] 提交、同意、驳回增加防重复点击。
- [x] 页面错误信息改为可读中文。

### Task 6: Deploy and verify database functions

**Files:**
- `database/20260712_stock_adjustment_phase_c.sql`
- `database/20260712_stock_adjustment_phase_c_hardening.sql`
- `tests/stock-adjustment-database-regression.sql`

- [x] 部署 `stock_adjustment_phase_c` migration。
- [x] 部署 `stock_adjustment_phase_c_hardening` migration。
- [x] 确认申请、明细、历史和库存流水表存在。
- [x] 确认保存、提交、撤回、驳回、通过、我的申请、待审核和流水 RPC 存在。
- [x] 在自动回滚事务中执行保存 → 提交 → 审核通过 → 库存变化 → 流水与历史验证。
- [x] 确认测试结束后没有申请、流水或库存残留。

### Task 7: Verify and publish both branches

- [x] 运行库存调整定向 Node 测试。
- [x] 运行修改过的 JavaScript 语法检查。
- [x] 同步 `feat/stock-adjustment-phase-c`。
- [x] 同步 `stock-adjustment-phase-c`，包含完整 `tests/`。
- [x] 确认 Vercel 与 Netlify 预览部署成功。
- [x] 保持 PR #3 为 Draft，未合并。

### Task 8: Keep implementation status synchronized

**Files:**
- `docs/status/STOCK-ADJUSTMENT-PHASE-C.md`
- `docs/decisions/STOCK-ADJUSTMENT-UI-002.md`
- `docs/decisions/IMPLEMENTATION-STATUS-SYNC-001.md`

- [x] 建立统一状态文档。
- [x] 将最近几轮 UI 与提交流程要求写入决策文档。
- [x] 删除计划中“生产 Supabase 未部署”的过时描述。
- [x] 规定以后每次代码变更必须同时更新状态文档。

## Current Result

库存调整 Phase C 已具备测试环境下的员工提交、管理端审核、库存变更和流水记录完整链路。当前继续等待测试体验反馈；收到反馈后按“代码、测试、状态文档同一次推送”的方式迭代。