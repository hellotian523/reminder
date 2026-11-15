# 微信待办备忘录与定时提醒小程序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个支持微信服务通知早报与自设 DDL 提前提醒的微信待办小程序与云开发后台

**Architecture:** 原生微信小程序前端负责待办 CRUD、分类呈现与 PushPlus Token 配置；微信云开发（CloudBase）提供数据存储与两个定时触发云函数（早报聚合 cronDailyMorning + 5分钟 DDL 临期巡检 cronCheckDdl），调用 PushPlus API 实现免认证的 100% 稳定微信直达卡片提醒。

**Tech Stack:** 微信小程序原生框架 (WXML, WXSS, JS, JSON), 微信云开发 (CloudBase 云数据库 + Node.js 云函数), PushPlus Webhook API

**Spec:** `docs/superpowers/specs/2026-11-15-wechat-todo-reminder-design.md`

## Global Constraints
- 必须完全兼容微信开发者工具和微信客户端运行规范；
- 避免任何复杂第三方打包工具（如 Webpack/Vite），采用原生无构建开箱即用结构；
- 微信云数据库环境与 OpenID 鉴权开箱即用，所有云函数独立封装；
- 所有时间计算采用东八区（Asia/Shanghai，UTC+8）；
- 严禁假实现、TODO、TBD，所有代码必须完整闭环。

---

### Task 1: 小程序项目根配置与脚手架搭建

**Files:**
- Create: `project.config.json`
- Create: `app.json`
- Create: `app.js`
- Create: `app.wxss`
- Create: `tests/test_scaffold.js`

**Interfaces:**
- Consumes: None
- Produces: 小程序工程标准入口、页面路由配置、全局云环境初始化逻辑

- [ ] **Step 1: 编写脚手架有效性自动化检查脚本**
创建 `tests/test_scaffold.js`，校验 `app.json` 和 `project.config.json` 是否存在且包含合法的页面路由与云函数根目录配置。

- [ ] **Step 2: 运行测试验证失败**
执行 `node tests/test_scaffold.js`，预期抛出配置文件不存在异常。

- [ ] **Step 3: 编写项目配置文件与全局样式**
编写 `project.config.json`（定义 miniprogramRoot 与 cloudfunctionRoot）、`app.json`（配置 pages、window 导航栏外观）、`app.js`（初始化 wx.cloud）、`app.wxss`（全局主题色与轻量卡片样式）。

- [ ] **Step 4: 运行测试验证通过**
执行 `node tests/test_scaffold.js`，验证通过。

- [ ] **Step 5: 提交**
Git commit: `feat: setup miniprogram scaffold and project configurations`

---

### Task 2: 待办业务云函数 todoApi 实现与逻辑校验

**Files:**
- Create: `cloudfunctions/todoApi/package.json`
- Create: `cloudfunctions/todoApi/index.js`
- Create: `tests/test_todoApi.js`

**Interfaces:**
- Consumes: 云开发云数据库 `todos` 集合
- Produces: 
  - `addTodo({ title, desc, ddl, remind_offset_minutes })`: 自动计算 `target_remind_time = ddl - remind_offset_minutes * 60000` 并写入
  - `updateTodo({ id, title, desc, ddl, remind_offset_minutes })`: 重新计算提醒时间并重置 `has_reminded = false`
  - `deleteTodo({ id })`
  - `toggleStatus({ id, status })`
  - `listTodos({ filter: 'all' | 'today' | 'done' })`

- [ ] **Step 1: 编写 todoApi 核心运算与逻辑单测**
创建 `tests/test_todoApi.js`，重点测试 `calcTargetRemindTime` 时间戳计算逻辑、参数合法性校验以及状态流转逻辑。

- [ ] **Step 2: 运行测试验证失败**
执行 `node tests/test_todoApi.js`，确认未实现报错。

- [ ] **Step 3: 实现 todoApi 云函数完整业务逻辑**
在 `cloudfunctions/todoApi/index.js` 中导出路由分发器及各子操作，处理 wx-server-sdk 数据库读写与本地计算。

- [ ] **Step 4: 运行测试验证通过**
执行 `node tests/test_todoApi.js`，所有断言测试通过。

- [ ] **Step 5: 提交**
Git commit: `feat: implement todoApi cloud function with remind offset calculation`

---

### Task 3: 用户配置云函数 userApi 与 PushPlus 连通性测试

**Files:**
- Create: `cloudfunctions/userApi/package.json`
- Create: `cloudfunctions/userApi/index.js`
- Create: `tests/test_userApi.js`

**Interfaces:**
- Consumes: `users` 集合，PushPlus HTTP API (`http://www.pushplus.plus/send`)
- Produces:
  - `getUserSettings()`: 获取当前用户的 pushplus_token、morning_report_enabled、morning_report_time
  - `saveUserSettings({ pushplus_token, morning_report_enabled, morning_report_time })`
  - `testPush({ pushplus_token })`: 发送测试微信卡片以校验 Token 有效性

- [ ] **Step 1: 编写 userApi 逻辑与推送请求构造单测**
在 `tests/test_userApi.js` 中测试 Token 格式校验、PushPlus 请求 payload 组装及响应解析逻辑。

- [ ] **Step 2: 运行测试验证失败**
执行 `node tests/test_userApi.js`，预期失败。

- [ ] **Step 3: 实现 userApi 云函数**
在 `cloudfunctions/userApi/index.js` 中实现配置持久化和基于 https/fetch 的 PushPlus 发送模块。

- [ ] **Step 4: 运行测试验证通过**
执行 `node tests/test_userApi.js`，断言通过。

- [ ] **Step 5: 提交**
Git commit: `feat: implement userApi with PushPlus test push`

---

### Task 4: 每日晨报聚合定时云函数 cronDailyMorning

**Files:**
- Create: `cloudfunctions/cronDailyMorning/package.json`
- Create: `cloudfunctions/cronDailyMorning/config.json`
- Create: `cloudfunctions/cronDailyMorning/index.js`
- Create: `tests/test_cronDailyMorning.js`

**Interfaces:**
- Consumes: `users` 集合、`todos` 集合
- Produces: 
  - 定时器：每天 08:30 触发 (`0 30 8 * * * *`)
  - 扫描未完成待办，分为【已逾期】、【今日待办】、【后续事项】，生成高质量 Markdown 表格/列表，调用 PushPlus 发送到微信。

- [ ] **Step 1: 编写晨报归类与 Markdown 渲染逻辑单测**
在 `tests/test_cronDailyMorning.js` 中准备一组测试数据（包含逾期、今日、跨天任务），校验生成的 Markdown 正文结构、统计计数以及空待办时的友好兜底。

- [ ] **Step 2: 运行测试验证失败**
执行 `node tests/test_cronDailyMorning.js`，预期失败。

- [ ] **Step 3: 实现 cronDailyMorning 云函数与定时配置**
编写 `index.js` 和 `config.json` 定时触发器配置。

- [ ] **Step 4: 运行测试验证通过**
执行 `node tests/test_cronDailyMorning.js`，断言通过。

- [ ] **Step 5: 提交**
Git commit: `feat: implement cronDailyMorning cloud function and timer trigger`

---

### Task 5: DDL 提前提醒巡检定时云函数 cronCheckDdl

**Files:**
- Create: `cloudfunctions/cronCheckDdl/package.json`
- Create: `cloudfunctions/cronCheckDdl/config.json`
- Create: `cloudfunctions/cronCheckDdl/index.js`
- Create: `tests/test_cronCheckDdl.js`

**Interfaces:**
- Consumes: `todos`（查找 `status == 'pending' && has_reminded == false && target_remind_time <= now`）
- Produces:
  - 定时器：每 5 分钟触发 (`0 */5 * * * * *`)
  - 构造即时预警卡片推送并标记 `has_reminded = true`

- [ ] **Step 1: 编写 DDL 触发筛选与防重标记逻辑单测**
创建 `tests/test_cronCheckDdl.js`，验证在给定时间轴下，能够准确命中到达预警时间的任务，且未到时间或已完成的任务不会被误推。

- [ ] **Step 2: 运行测试验证失败**
执行 `node tests/test_cronCheckDdl.js`，预期失败。

- [ ] **Step 3: 实现 cronCheckDdl 巡检与推送逻辑**
编写 `index.js` 与 `config.json`。

- [ ] **Step 4: 运行测试验证通过**
执行 `node tests/test_cronCheckDdl.js`，断言通过。

- [ ] **Step 5: 提交**
Git commit: `feat: implement cronCheckDdl 5-minute scanner`

---

### Task 6: 个人设置页开发 (pages/settings/)

**Files:**
- Create: `pages/settings/settings.json`
- Create: `pages/settings/settings.wxml`
- Create: `pages/settings/settings.wxss`
- Create: `pages/settings/settings.js`

**Interfaces:**
- Consumes: `userApi` 云函数
- Produces: PushPlus Token 配置表单、连通性测试按钮、晨报开关与时间选择器、1分钟获取指南展示

- [ ] **Step 1: 编写设置页 UI 结构 (WXML & WXSS)**
清晰的卡片式分组设计，支持复制指南链接、密码样式遮罩 Token。

- [ ] **Step 2: 实现设置页控制器逻辑 (JS)**
页面加载时拉取现有配置，绑定测试推送与保存按钮事件，给出明确 Toast 提示。

- [ ] **Step 3: 语法与结构静态检查**
使用脚本校验 WXML/JS/JSON 语法的完整性与闭环。

- [ ] **Step 4: 提交**
Git commit: `feat: implement settings page for pushplus configuration`

---

### Task 7: 待办新增与编辑页开发 (pages/edit/)

**Files:**
- Create: `pages/edit/edit.json`
- Create: `pages/edit/edit.wxml`
- Create: `pages/edit/edit.wxss`
- Create: `pages/edit/edit.js`

**Interfaces:**
- Consumes: `todoApi` 云函数
- Produces: 
  - 待办标题输入（表单验证，必填）
  - 详细备注输入
  - 截止日期选择器（Picker: date）与时间选择器（Picker: time）
  - 提前提醒单选 Picker（准时、15m、30m、1h、2h、1d）
  - 支持新增模式与编辑已有模式

- [ ] **Step 1: 编写编辑页表单 WXML 与 WXSS**
包含醒目的截止时间选择卡片与提前预警时间档位展示。

- [ ] **Step 2: 实现编辑页交互与保存提交逻辑 (JS)**
将日期与时间拼接为 Unix 时间戳，计算偏移量后调用 `todoApi` 保存，保存成功后返回并刷新上一页。

- [ ] **Step 3: 语法与逻辑自检**
脚本校验事件绑定与字段正确性。

- [ ] **Step 4: 提交**
Git commit: `feat: implement todo edit and create page with remind offset picker`

---

### Task 8: 待办首页开发 (pages/index/) 与端到端完整闭环验证

**Files:**
- Create: `pages/index/index.json`
- Create: `pages/index/index.wxml`
- Create: `pages/index/index.wxss`
- Create: `pages/index/index.js`
- Create: `README.md`
- Create: `tests/e2e_smoke.js`

**Interfaces:**
- Consumes: `todoApi`, `pages/edit`, `pages/settings`
- Produces:
  - 顶部数据看板（待办数、今日数、逾期数）
  - Tab 切换（今日必做 / 全部 / 已完成）
  - 待办卡片列表，支持勾选完成、点击修改、滑动/长按删除
  - 浮动新建按钮（+）与右上角设置齿轮按钮
  - 完整使用指南与本地自测套件

- [x] **Step 1: 编写首页 WXML 列表与看板组件**
- [x] **Step 2: 编写首页 WXSS 动效与现代极简风格样式**
- [x] **Step 3: 编写首页控制器 JS 数据拉取、过滤与下拉刷新逻辑**
- [x] **Step 4: 编写全链路 Smoke 模拟验证脚本 tests/e2e_smoke.js**
- [x] **Step 5: 运行端到端测试并输出项目 README.md 文档**
执行 `node tests/e2e_smoke.js`，输出开箱即用导入指引。
- [x] **Step 6: 最终提交**
Git commit: `feat: complete main todo index page and project documentation`
