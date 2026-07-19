# 交接文档：管理员看板 / 导入页统一 / 员工经销商客户编号

日期：2026-06-21
仓库：`1Rasy/spr`
分支：`codex/products-excel-style-filters`
本地路径：`C:\Users\10703\Desktop\开单3\spr`
Supabase Project ID：`wyjbnnqhiehjccmojbbg`

---

## 1. 当前状态

当前分支已推送到 GitHub，最新提交为：

```text
d847333 Show dealer customer codes on employees
3bee182 Unify import page styling
7c3f993 Add admin dashboard
```

工作区状态：

```text
## codex/products-excel-style-filters...origin/codex/products-excel-style-filters
```

说明：本地分支已与远端分支同步。

---

## 2. 本轮完成的页面

### 2.1 `dashboard.html`

新增管理员看板页面。

入口按钮：

```text
导入门店 -> store_import.html
导入库存 -> stock_import.html
商品表 -> products.html
员工表 -> employees.html
```

看板首页读取：

```text
sales_orders
employees
```

展示内容：

```text
卖进金额
卖进单据
覆盖门店
动销人员
平均客单价
人员卖进排行
最近卖进单据
```

时间筛选：

```text
今天
近 7 天
本月
全部历史
自定义日期
```

注意：当前没有登录/权限系统，仍然是静态 HTML 直接用 Supabase publishable key 访问。

### 2.2 `store_import.html`

门店导入页已统一为库存导入页的视觉样式。

已删除页面上的多余说明：

```text
数据清洗
差集
覆盖
```

按钮文案已改为：

```text
确认导入数据
```

保留原有导入逻辑：

```text
读取 employees.employee_code 作为员工白名单
解析 Excel
筛选有效门店
写入 temp_upload_assets
调用 sync_and_mask_assets()
```

说明：用户只要求去掉多余说明，没有要求改数据库逻辑。

### 2.3 `stock_import.html`

库存导入页保留固定列导入规则。

保留内容：

```text
A单号，B单据编号，C制单日期，D客户编号，E客户，F商品编号，
G条形码，H商品名称，I包装，J件，K金额/1，L散，
M单位/2，N单价/3，O折扣，P应收款。
```

已删除规则块里多余的流程说明，例如白名单、重复行、500 条分批等说明。

导入逻辑未改，仍然：

```text
读取 dealer_employee_mappings
用 customer_code 白名单过滤
生成 row_key
每 500 条 upsert raw_dealer_outbounds
数据库触发器更新 van_stocks
```

### 2.4 `employees.html`

员工表现在同时读取：

```text
employees
dealer_employee_mappings
```

页面列顺序：

```text
员工工号
员工姓名
经销商客户编号
操作
启用
```

要求已满足：

```text
不加排序按钮
启用在最右边
经销商客户编号展示 dealer_employee_mappings.customer_code
经销商客户编号可查看、可编辑、可保存
```

实现要点：

```text
loadEmployees()
  同时读取 employees 和 dealer_employee_mappings

getEmployeeCustomerCodes(employeeCode)
  从 mappings 中取当前员工绑定的 customer_code

renderCustomerCodesInput(e)
  用 textarea 展示 customer_code，一行一个

saveMappingsForEmployee(nextEmployeeCode, previousEmployeeCode, nextCustomerCodes)
  保存经销商客户编号
```

编辑规则：

```text
支持一行一个客户编号
支持逗号、中文逗号、分号、空白分隔
自动去重
```

保存行为：

```text
保存员工本行时同步保存经销商客户编号
新增员工时也可填写经销商客户编号
如果修改员工工号，原旧工号绑定的客户编号会迁到新工号
从某员工移除客户编号时，不删除 mapping 行，只把 employee_code 置空
新增不存在的 customer_code 时，会 upsert 到 dealer_employee_mappings
```

注意：如果用户不希望自动创建新的 `customer_code` mapping，后续应把 `upsert` 改成只允许更新已存在编号，并在保存前提示不存在的编号。

---

## 3. 回归测试

新增/维护测试文件：

```text
tests/static-regression.test.mjs
```

覆盖内容：

```text
dashboard.html 存在
dashboard 有四个管理入口
dashboard 查询 sales_orders 和 employees
employees.html 没有排序按钮
employees.html 读取 dealer_employee_mappings
employees.html 展示并保存 customer_code
员工表列顺序正确，启用在最右
导入门店和导入库存共用导入页样式
导入页不出现“数据清洗 / 差集 / 覆盖”
库存导入保留 A-P 固定列规则
```

验证命令：

```powershell
& 'C:\Users\10703\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\static-regression.test.mjs
git diff --check
```

最近一次验证结果：

```text
static-regression.test.mjs exit 0
git diff --check exit 0
```

浏览器本地预览也检查过：

```text
dashboard.html 可渲染
store_import.html / stock_import.html 样式统一
employees.html 表头为：员工工号 / 员工姓名 / 经销商客户编号 / 操作 / 启用
employees.html 无控制台 error
```

---

## 4. 数据表关系

### 4.1 `employees`

关键字段：

```text
id
created_at
employee_code
name
is_active
```

### 4.2 `dealer_employee_mappings`

关键字段：

```text
id
created_at
customer_code
customer_name
employee_code
```

页面中的“经销商客户编号”对应：

```text
dealer_employee_mappings.customer_code
```

页面通过 `employee_code` 把 mapping 归属到员工。

---

## 5. 风险和注意事项

### 5.1 RLS / 权限

当前前端仍是静态 HTML 直连 Supabase。

风险：

```text
拿到 publishable key 的人理论上可能读写公开表
```

正式上线前建议：

```text
启用 RLS
补齐 policies
或改成后端 / Edge Function 代理写入
```

不要只打开 RLS 而不写 policy，否则现有页面会无法读写。

### 5.2 员工表保存 mapping 的行为

当前实现允许在员工表里新增原本不存在的 `customer_code`。

代码位置：

```text
employees.html -> saveMappingsForEmployee()
```

当前逻辑：

```javascript
client
  .from('dealer_employee_mappings')
  .upsert(toAssign, { onConflict: 'customer_code' })
```

如果后续要求只能选择已有经销商客户编号，需要改这里。

### 5.3 删除 / 解绑客户编号

从员工 textarea 中删掉某个客户编号时：

```text
dealer_employee_mappings.employee_code = null
```

不会删除 mapping 行。

### 5.4 GitHub 推送

普通 `git push` 可能报：

```text
schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030E)
```

之前成功方式是用 Codex 的非沙盒授权重试：

```powershell
git push origin codex/products-excel-style-filters
```

---

## 6. 常用检查

查看当前分支状态：

```powershell
git status --short --branch
```

查看最近提交：

```powershell
git log --oneline -8
```

跑静态测试：

```powershell
& 'C:\Users\10703\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\static-regression.test.mjs
```

格式检查：

```powershell
git diff --check
```

---

## 7. 后续建议

1. 用真实 Supabase 数据测试 `employees.html` 中新增、编辑、保存经销商客户编号。
2. 确认是否允许员工表中新建不存在的 `customer_code`。
3. 如果不允许，改成只更新已有 mapping，并提示不存在的客户编号。
4. 增加 dashboard 入口暴露方式，目前没有把管理员看板放回 `index.html`。
5. 正式上线前处理 RLS、权限和后端代理问题。
