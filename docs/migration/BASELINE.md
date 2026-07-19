# 迁移基线记录

## 源码

- 仓库：`https://github.com/1Rasy/mdlztest.git`
- 默认分支：`main`
- GitHub `main`：`7aeea35a879a59e654bc0d7375defb9612c128b1`
- 提交时间：`2026-07-19T01:57:26+08:00`
- 提交标题：`fix: make product columns responsive`
- 获取后初始工作树：clean

## 自动测试

命令：

```text
C:\Users\10703\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/*.test.mjs
```

初次结果：76 项，73 通过，3 失败。

| 失败 | 判定 | 证据 |
| --- | --- | --- |
| qty popup after-sale handler | 旧断言 | 断言仍找 `STATE.key === 'afterSaleQty'`，当前实现用 `STATE.handler === 'afterSale'` 分派，数量变化链仍存在 |
| static regression | 旧断言集合 | Dashboard、员工表、统一库存导入、库存管理的 UI/函数名称已经演进，断言仍匹配旧字符串；对应当前功能代码存在且有其他专项测试覆盖 |
| stock baseline copy | 旧断言 | 2026-07-17 的 `chore: remove inventory page descriptions` 主动移除页面说明文案；A/B/C 解析与 RPC 仍存在 |

只更新上述测试对当前实现的断言后：76 项，76 通过，0 失败。生产 HTML、JavaScript、CSS、SQL 未修改。

## 视觉基线

本地只读静态服务：`http://127.0.0.1:4173`。已在浏览器检查以下视口：

| 页面 | 视口 | 冻结要点 |
| --- | --- | --- |
| `index.html` | 1440×900、390×844 | 紫色主题、搜索、两列员工卡；移动端仍为两列 |
| `dashboard.html` | 1440×900 | 1220px 最大内容宽、渐变 hero、6 列快捷入口、3 列指标、420px 排行 + 趋势 |
| 共享门店页 | 390×844 目标契约 | 12px 外边距卡片、三等分入口、全宽搜索、移动键盘搜索态、右侧字母栏、底部浮动提交 |

关键响应式断点：Dashboard 1000px 时快捷入口降为 3 列且内容改单列；640px 时快捷入口 2 列、指标单列、员工筛选 2 列；门店详情在 560px、360px 有按钮/布局微调。React 迁移必须保留现有 CSS 尺寸和 DOM class，批次视觉验收以这些视口做像素差分。

## 未验证项

- 未登录真实移动设备，仅用浏览器视口核对；软键盘、iOS 返回手势、PNG 下载需实机复核。
- 未连接或修改线上 Supabase；线上表、RPC、触发器的实际版本和授权尚未只读核验。
- 未用真实业务 Excel/历史订单做导入导出差分；格式契约目前来自实际代码和已有测试。
- `atom`、`order`、`adjust` 参数存在共享脚本过早清理的当前缺口，见行为契约。
