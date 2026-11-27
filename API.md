# 「摩托销售管理系统」接口契约 v1.3

> 定稿日期：2026.11.25；v1.3 更新：11.29 按 D（刘昊）实际实现修订手机号授权、后台登录、用户状态、活动报名与数据分析契约。
> 此后任何改动必须先改本文档，再改代码，口头约定一律无效。
> 责任人（对应四人分工表）：
> 任务1 = 组长兼小程序前端（李端）
> 任务2 = 管理后台前端兼测试协调（杨乐曈）
> 任务3 = 后端开发兼数据库负责人（秦旭）
> 任务4 = 后端开发兼数据分析负责人（刘昊）

## 一、全局规矩（所有接口必须遵守）

### 1. 路径与动词

- `/api/bikes` 表示集合，`/api/bikes/:id` 表示单条
- 查询用 GET，新增用 POST，整体更新用 PUT，**局部更新（如状态变更）用 PATCH**，删除用 DELETE
- 管理端接口统一加 `/api/admin/` 前缀，C 端（小程序）接口不加
- **登录、手机号、报名、数据分析的路径以 D 已实现为准**（见模块 1、5、7），前端按本文档调整调用

### 2. 统一返回信封

所有接口一律返回：

```json
// 成功
{ "code": 0, "message": "ok", "data": { ... } }

// 业务失败
{ "code": 1004, "message": "请勿重复报名", "data": null }

// 未登录
{ "code": 401, "message": "请先登录", "data": null }
```

### 3. 分页规则

列表接口一律支持 `page`（默认 1）、`pageSize`（默认 10）、可选 `keyword`，返回：

```json
{ "code": 0, "message": "ok", "data": { "total": 36, "page": 1, "pageSize": 10, "list": [ ... ] } }
```

### 4. 错误码表（以 D 已实现的含义为起点，新增业务分配独立码）

| code | 含义 | 前端处理 |
|---|---|---|
| 0 | 成功 | 取 data 渲染 |
| 401 | 未登录 | 跳登录页 |
| 403 | 无权限 / 账号被禁用 | toast 提示 |
| 404 | 不存在 | toast 提示 |
| 500 | 服务异常 | toast 提示 |
| 1002 | 报名未开放（不在报名时间内） | toast 显示 message |
| 1003 | 活动名额已满 | toast 显示 message |
| 1004 | 重复报名 | toast 显示 message |
| 1005 | 参数校验失败 | toast 显示 message |
| 1006 | 重复收藏 | toast 显示 message |

### 5. 鉴权与角色

- C 端 token 由 `POST /api/auth/wechat/login` 签发；管理端 token 由 `POST /api/auth/admin/login` 签发；**两套 token 分开签发、互不通用**
- 所有需登录的请求在 Header 带上 `Authorization: Bearer <token>`
- **角色沿用 D 的两角色**：`super_admin`（超级管理员）、`operator`（运营）。**&#8203;后台登录成功后角色从 `data.admin.role` 读取**（不是 `data.role`）
- 敏感操作权限（按本文档执行，鉴权由 D 实现）：

| 操作 | super_admin | operator |
|---|---|---|
| 内容管理（Banner/资讯/车型/图集上传） | ✅ | ✅ |
| 活动发布/下架/编辑、查看报名名单 | ✅ | ✅ |
| 查看数据分析 | ✅ | ✅ |
| 管理员账号管理、角色分配 | ✅ | ❌ |
| 含手机号的报名名单 CSV 导出 | ✅ | ❌ |
| 发起 AI 分析解读 | ✅ | ❌（需 D 确认后可放开） |

### 6. 字段命名铁律（前后端逐字对齐）

- 响应信封字段**固定为 `code / message / data`**，前端不得读 `msg` 或其他变体
- 价格字段固定为 `price`，单位**分**，前端展示时除以 100（不得直接格式化原始值）
- 客服接口请求字段**固定为 `question`**（字符串），不得发送 `messages` 数组
- 接口路径以本文档为唯一标准，已有代码路径不一致的一方改代码

### 7. 时间与金额

- 时间字段统一 `YYYY-MM-DD HH:mm:ss` 字符串（如 `2026-12-01 14:00:00`），不用时间戳
- **若后端实际返回 ISO 8601（含 `T`/`Z`）**&#8203;，前端在 `utils/request.js` 里统一格式化为上述格式后渲染，不改契约；D 需在第六节书面确认当前实现格式
- 价格一律用**整型存分**（如 219900 = ¥2199.00），前端展示时除以 100

### 8. 状态字段约定

- **内容模块**（banner / news / bike）：status 用数字 `1 = 上架`，`0 = 下架`；sort 数字越小越靠前
- **用户状态**：`active` / `disabled` 字符串；禁用/启用走 `PATCH` 并附 `reason`
- **活动模块**：status 沿用 D 的字符串枚举 `draft（草稿）/ published（已发布）/ offline（已下架）`；活动有独立报名时间窗，前端按 `signupOpen` 判断能否报名
- 页面上"进行中/已结束"等文案由前端根据时间字段与当前时间自行判断
- **图片存储**：数据库存相对 URL（如 `/uploads/2026/11/xxx.jpg`），前端展示时拼 baseURL
- **上传限制**：仅 jpg / png / webp，单张 ≤ 5MB，超限返回 1005

## 二、数据表（每表必有主键 id 与 created_at，查询字段建索引）

| 表 | 关键字段 | 设计要点 | 负责人 |
|---|---|---|---|
| admin_user | id, username, password_hash, nickname, role(super_admin/operator), status, created_at | 后台账号表，哈希存密码，绝不存明文 | 任务4（刘昊） |
| c_user | id, openid(唯一索引), nickname, phone, status(active/disabled), created_at | C 端用户表；手机号授权后回填 | 任务4（刘昊） |
| activity | id, title, cover, content, start_at, end_at, quota, status(draft/published/offline), 报名时间窗字段, created_at | 独立报名时间窗；发布/下架走 status | 任务4（刘昊） |
| signup | id, activity_id, user_id, phone, remark, is_valid, created_at | 报名只存可选 remark；手机号从 c_user 带入；**仅对有效报名防重**，取消后可重新报名 | 任务4（刘昊） |
| mock_visit | id, module, pv, uv, date, created_at | 数据分析模拟数据，灌 30 天 | 任务4（刘昊） |
| banner | id, title, image, link_type, link_url, sort, status | status 控制上下架；sort 排序 | 任务3（秦旭） |
| news | id, title, content, cover, date, status, sort, created_at | 新车资讯 | 任务3（秦旭） |
| bike | id, name, series, price(分), params(JSON), cover, status, sort | status 上下架；name/series 建索引 | 任务3（秦旭） |
| bike_image | id, bike_id, url, type(1主图/2细节), sort | 一车多图；bike_id 建索引 | 任务3（秦旭） |
| favorite | id, user_id, bike_id, created_at | user_id 引用 **c_user.id**；(user_id,bike_id) 唯一；取消收藏物理删除 | 任务3（秦旭） |
| chat_log | id, user_id, session_id, question, answer, created_at | user_id 引用 **c_user.id**；按 session_id 归组 | 任务3（秦旭） |

建表 SQL 分头出（账号/报名/活动表按 D 的表结构），最后由**任务3（秦旭）**&#8203;汇总成一份可对空库一键初始化的 schema.sql。

## 三、接口清单

### 模块 1：登录、手机号与个人信息【任务4（刘昊）负责，按实际实现】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| 小程序登录 | POST /api/auth/wechat/login | {code}（wx.login 的 code） | {token, user:{id, nickname, phone}} | — |
| 手机号授权 | POST /api/auth/wechat/phone | {code}（手机号授权回调拿到的 code） | — | 401/1005 |
| 我的信息 | GET /api/users/me | — | {user:{id, nickname, phone, status}}（**读 data.user**） | 401 |
| 我的报名列表 | GET /api/users/me/signups | page/pageSize | total+list:{activity_id, title, start_at, created_at, remark} | 401 |
| 后台登录 | POST /api/auth/admin/login | {username, password} | {token, admin:{id, username, nickname, role}}（**角色读 data.admin.role**） | 1005 账号或密码错误 |
| 用户列表（管理） | GET /api/admin/users | page/pageSize/keyword | total+list:{id, nickname, phone, status, created_at} | 403 |
| 修改用户状态（管理） | PATCH /api/admin/users/:id/status | {status: "active"/"disabled", reason}（禁用时必填 reason） | — | 403/1005 |
| 管理员列表（管理） | GET /api/admin/admins | page/pageSize | total+list:{id, username, nickname, role, status} | 403（仅 super_admin） |
| 新增管理员（管理） | POST /api/admin/admins | {username, password, nickname, role} | {id} | 403/1005 |

补充约定：用户被禁用（`disabled`）后无法登录（登录返回 403），已有收藏/报名数据保留、不可新增；禁用原因写入 `reason`，前端在用户列表展示。

使用方：小程序登录/手机号/个人信息/我的报名 → 任务1（李端）；用户管理页 → 任务2（杨乐曈）。

### 模块 2：首页内容（Banner + 新车资讯）【任务3（秦旭）负责】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| C 端 Banner 列表 | GET /api/banners | — | list:{id, title, image, link_type, link_url}（只返回 status=1，按 sort 升序） | — |
| Banner 列表（管理） | GET /api/admin/banners | page/pageSize | total+list:{id, title, image, link_type, link_url, sort, status} | 403 |
| 新增 Banner（管理） | POST /api/admin/banners | {title, image, link_type, link_url, sort, status}（title/image 必填） | {id} | 1005 |
| 编辑/上下架/排序（管理） | PUT /api/admin/banners/:id | 同上字段（未改动的项可不传） | — | 404/1005 |
| 删除 Banner（管理） | DELETE /api/admin/banners/:id | — | — | 404 |
| C 端资讯列表 | GET /api/news | page/pageSize | total+list:{id, title, cover, content, date}（只返回 status=1，按 sort 升序） | — |
| 资讯列表（管理） | GET /api/admin/news | page/pageSize | total+list:{id, title, cover, content, date, sort, status} | 403 |
| 新增资讯（管理） | POST /api/admin/news | {title, content, cover, sort, status}（title/content 必填） | {id} | 1005 |
| 编辑/上下架/排序（管理） | PUT /api/admin/news/:id | 同上字段 | — | 404/1005 |
| 删除资讯（管理） | DELETE /api/admin/news/:id | — | — | 404 |
| 热门车型（首页） | GET /api/bikes/hot | limit（默认 4） | list:{id, name, series, price, cover} | — |

上下架和排序一律走 PUT 编辑接口传 `status` / `sort` 字段，不设单独接口。
使用方：小程序首页 → 任务1（李端）；首页管理页 → 任务2（杨乐曈）。

### 模块 3：车型【任务3（秦旭）负责】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| C 端车型列表 | GET /api/bikes | page/pageSize/keyword/series | total+list:{id, name, series, price, cover}（只返回 status=1） | — |
| C 端车型详情 | GET /api/bikes/:id | — | {id, name, series, price, params, cover, is_favorited, images:[{url, type}]}（is_favorited：当前用户是否已收藏，未登录返回 false） | 404 |
| 车型列表（管理） | GET /api/admin/bikes | page/pageSize/keyword/series | total+list:{id, name, series, price, cover, status, sort} | 403 |
| 新增车型（管理） | POST /api/admin/bikes | {name, series, price, params, cover, status, sort, images:[{url, type, sort}]}（name/series/price/cover 必填） | {id} | 1005 |
| 编辑车型（管理） | PUT /api/admin/bikes/:id | 同上字段（images 传则整体替换图集） | — | 404/1005 |
| 删除车型（管理） | DELETE /api/admin/bikes/:id | — | — | 404 |
| 图片上传 | POST /api/upload | form-data: file | {url}（相对地址，前端拼 baseURL；jpg/png/webp，≤5MB） | 1005 |

车型字段说明：`price` 整型分；`params` 为 JSON 字符串（排量、坐高等键值对，前端原样展示）；`bike_image.type`：1=主图，2=细节图。**第一期不做价格区间筛选**，只支持 `keyword`（名称模糊）+ `series`。
使用方：小程序摩托模块 → 任务1（李端）；车型管理页 → 任务2（杨乐曈）。

### 模块 4：收藏【任务3（秦旭）负责】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| 收藏 | POST /api/favorites | {bike_id} | — | 401/1006 |
| 取消收藏 | DELETE /api/favorites/:bikeId | — | — | 401 |
| 我的收藏列表 | GET /api/favorites | page/pageSize | total+list:{bike_id, name, price, cover} | 401 |

使用方：小程序收藏交互与我的收藏 → 任务1（李端）。

### 模块 5：活动与报名【任务4（刘昊）负责，按实际实现】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| C 端活动列表 | GET /api/activities | page/pageSize/status | total+list:{id, title, cover, start_at, end_at, quota, status, signupCount, signedUp, signupOpen}（前端按 signupCount/signedUp/signupOpen 适配按钮与进度） | — |
| C 端活动详情 | GET /api/activities/:id | — | 同上 + content | 404 |
| 在线报名 | POST /api/activities/:id/signup | {remark}（可选备注）——**手机号从已授权账户自动读取，不由前端传** | — | 401/1002/1003/1004/1005 |
| 我的报名列表 | GET /api/users/me/signups | page/pageSize | total+list:{activity_id, title, start_at, created_at, remark} | 401 |
| 活动列表（管理） | GET /api/admin/activities | page/pageSize/keyword/status | total+list:{id, title, cover, start_at, end_at, quota, status, signupCount} | 403 |
| 新增/发布活动（管理） | POST /api/admin/activities | {title, cover, content, start_at, end_at, quota, status}（status 传 published 即发布） | {id} | 1005 |
| 编辑/下架（管理） | PUT /api/admin/activities/:id | 同上字段（下架传 status=offline） | — | 404/1005 |
| 删除活动（管理） | DELETE /api/admin/activities/:id | — | — | 404 |
| 报名名单（管理） | GET /api/admin/activities/:id/signups | page/pageSize | total+list:{user_id, phone, remark, created_at} | 403 |
| 名单导出（管理） | GET /api/admin/activities/:id/signups/export | — | CSV 文件流；**含手机号的 CSV 仅 super_admin 可导出** | 403 |

> 名单导出是统一 JSON 信封的唯一例外：直接返回文件流（`Content-Type: text/csv`），不走 `{code,message,data}` 包装，前端以 blob 下载。

使用方：小程序活动模块 → 任务1（李端）；活动管理页与名单导出 → 任务2（杨乐曈）。

### 模块 6：AI 智能客服【任务3（秦旭）负责】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| 多轮对话 | POST /api/chat | {sessionId（首传可不带）, question} | {answer, sessionId} | 1005 |

约定：答案锚定库内车型数据（系统提示词注入在架车型 name/series/price），库外问题固定回复"暂无相关车型信息，您可以浏览车型列表"；问答写入 chat_log（user_id 引用 c_user.id）。使用方：小程序客服页 → 任务1（李端）。

### 模块 7：AI 数据分析【任务4（刘昊）负责，按实际实现】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| 模块热度 | GET /api/admin/analytics/module-hot | dateRange 可选 | list:{module, pv} | 403 |
| 访问趋势 | GET /api/admin/analytics/trend | days（默认 7） | list:{date, pv, uv} | 403 |
| 转化漏斗 | GET /api/admin/analytics/funnel | — | list:{step, count} | 403 |
| AI 分析解读 | POST /api/admin/analytics/interpretation | dateRange 可选 | {summary} | 403/1005 |

约定：基于模拟数据（mock_visit 灌 30 天），不接真实埋点。分析查看 operator 可用；**发起 AI 解读仅 super_admin**（是否放开给 operator 由 D 确认）。使用方：数据分析页 → 任务2（杨乐曈）。

## 四、联调约定

1. 测试环境 baseURL：`http://<任务3（秦旭）的局域网IP>:3000`（联调开始当天发群里；若 D 单独起服务，两个地址都要发）
2. 演示数据：车型 ≥20 条由任务3（秦旭）灌库；活动 ≥5 条、模拟访问数据由任务4（刘昊）灌库
3. `schema.sql` 由任务3（秦旭）汇总（账号/报名/活动表按 D 的表结构），必须能对空库一键初始化
4. 改接口流程：先改本文档 → 群里通知 → 当天生效；前端发现字段对不上，以本文档为准
5. 测试用例与缺陷清单由任务2（杨乐曈）统一维护，缺陷按 P0/P1 分级并记录闭环
6. 复验链路：登录 → 车型详情与收藏 → 活动报名 → 后台查看并导出名单 → 客服多轮问答

## 五、已拍板项

1. **报名不采集姓名**（采用方案 B）：报名只传可选 `remark`，手机号从已授权账户读取；signup 表不设 name 字段。小程序的姓名输入框删除或改为可选备注。

## 六、待与 A（李端）确认的调用方式

| 项目 | 契约规定 | 需 A 确认的点 |
|---|---|---|
| 首页 | Banner `GET /api/banners`、资讯 `GET /api/news`、热门车型 `GET /api/bikes/hot?limit=4` | 三个区块是否都已接上、字段名是否对得上 |
| 车型筛选 | `GET /api/bikes?page&pageSize&keyword&series`，**不做价格区间** | 小程序筛选条件是否只有系列，是否需要价格排序 |
| 收藏 | `POST /api/favorites`、`DELETE /api/favorites/:bikeId`、`GET /api/favorites`，重复收藏返回 1006 | 详情页收藏按钮是否按 `is_favorited` 回显 |
| 客服 | `POST /api/chat` 传 `{sessionId, question}`，错误码 1005 | 对话页是否已改为发送 `question` 字符串 |
| 时间格式 | `YYYY-MM-DD HH:mm:ss` | 当前实现若返回 ISO 字符串，需 D 确认并在前端统一转换 |
