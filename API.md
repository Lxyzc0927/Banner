# 「摩托销售管理系统」接口契约 v1.4

> 定稿日期：2026.11.25；v1.4 更新：11.29 直接对照 D（刘昊）远端提交 `264b515` 的代码逐行核实（后端测试 31/31 通过），修正错误码全表、登录/活动/分析的返回结构、补齐 D 已实现的隐藏接口（发布/下架/取消报名/用户详情/管理员编辑/埋点），确认时间为 ISO 8601、数据库为 SQLite。
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
- D 还提供兼容别名：`POST /api/auth/wx-login` = `/api/auth/wechat/login`，`POST /api/auth/phone` = `/api/auth/wechat/phone`，`GET /api/signups/mine` = `/api/users/me/signups`（前端用哪个都行）

### 2. 统一返回信封与 HTTP 状态码

所有接口一律返回：

```json
// 成功
{ "code": 0, "message": "ok", "data": { ... } }

// 业务失败（HTTP 仍为 200，前端只认信封 code）
{ "code": 1004, "message": "你已经报名过该活动", "data": null }

// 协议级错误（HTTP 状态码同步为 400/401/403/404/500）
{ "code": 400, "message": "参数错误", "data": null }
```

- 特例 1：报名成功返回 **HTTP 201**（信封结构不变）
- 特例 2：名单导出返回 **CSV 文件流**（`Content-Type: text/csv`），前端以 blob 下载
- 业务失败可能带 `details`（如重复报名带 `signupNo`/`createdAt`），前端可选用

### 3. 分页规则

列表接口一律支持 `page`（默认 1）、`pageSize`（默认 10）、可选 `keyword`，返回：

```json
{ "code": 0, "message": "ok", "data": { "total": 36, "page": 1, "pageSize": 10, "list": [ ... ] } }
```

### 4. 错误码全表（与 D 的 `server/src/errors.js` 一致）

| code | 含义 | 前端处理 |
|---|---|---|
| 0 | 成功 | 取 data 渲染 |
| 400 | 参数校验失败（HTTP 400） | toast 显示 message |
| 401 | 未登录 | 跳登录页 |
| 403 | 无权限 / 后台账号被禁用 | toast 提示 |
| 404 | 不存在 | toast 提示 |
| 409 | 数据冲突 | toast 提示 |
| 500 | 服务异常 | toast 提示 |
| 1001 | 后台账号或密码错误 | toast 显示 message |
| 1002 | 报名未开放（未开始/已结束） | toast 显示 message |
| 1003 | 活动名额已满 | toast 显示 message |
| 1004 | 重复报名 | toast 显示 message |
| 1005 | 活动未发布或已下架 | toast 显示 message |
| 1006 | 账号已存在（新增管理员重名） | toast 显示 message |
| 1007 | 内置保护账号不可操作 | toast 提示 |
| 1008 | 用户账号被禁用 | 提示联系管理员 |
| 1009 | 状态不合法 | toast 提示 |
| 1010 | 报名缺少手机号 | 引导用户完成手机号授权后重试 |
| 1011 | 手机号已绑定其他微信账号 | toast 显示 message |
| 1012 | 并发更新冲突（活动 version） | 提示刷新后重试 |
| 1013 | 导出名单为空 | toast 提示 |
| 1014 | AI 服务不可用 / 解读请求过频（3 秒限频） | toast 提示稍后再试 |
| 1015 | 重复收藏（预留，任务3 实现） | toast 显示 message |

> ⚠️ 注意：旧版文档把 1006 写成"重复收藏"是错的，D 已把 1006 占用为"账号已存在"。收藏模块（任务3 实现）改用 **1015**。

### 5. 鉴权与权限点

- C 端 token 由 `POST /api/auth/wechat/login` 签发；管理端 token 由 `POST /api/auth/admin/login` 签发；**两套 token 分开签发、互不通用**
- 所有需登录的请求在 Header 带上 `Authorization: Bearer <token>`
- 角色沿用两角色：`super_admin`（超级管理员）、`operator`（运营）；**后台登录成功后角色从 `data.admin.role` 读取**，`data.admin.permissions` 直接给出权限点数组
- 后端按**权限点**鉴权，D 已实现：

| 权限点 | super_admin | operator | 控制的接口 |
|---|---|---|---|
| user:read / user:write | ✅ | ✅ | 用户列表/详情/禁用启用 |
| admin:read / admin:write | ✅ | ❌ | 管理员增删改、重置密码 |
| activity:read / activity:write | ✅ | ✅ | 活动列表/新增/编辑/名单 |
| activity:publish | ✅ | ✅ | 发布/下架活动 |
| activity:export | ✅ | ❌ | 含完整手机号的名单导出（operator 看脱敏 138****5678） |
| analytics:read | ✅ | ✅ | 各分析接口 |
| analytics:interpret | ✅ | ❌ | 发起 AI 解读 |

### 6. 字段命名铁律（前后端逐字对齐）

- 响应信封字段**固定为 `code / message / data`**，前端不得读 `msg`
- **接口 JSON 字段一律驼峰**（`startAt`、`signupStartAt`、`avatarUrl`），数据库列才是下划线（`start_at`）——前端不要照搬建表字段名
- 价格字段固定为 `price`，单位**分**，前端展示时除以 100
- 客服接口请求字段**固定为 `question`**（字符串），不得发送 `messages` 数组
- 接口路径以本文档为唯一标准，已有代码路径不一致的一方改代码

### 7. 时间格式（已按 D 实现确认）

- **后端统一返回 ISO 8601 UTC 字符串**（如 `2026-12-01T06:00:00.000Z`），活动时间入参也用此格式
- 前端在 `utils/request.js` 里统一转本地时间 `YYYY-MM-DD HH:mm:ss` 后渲染；分析接口的 `from`/`to` 用 `YYYY-MM-DD`（纯日期）

### 8. 状态字段约定

- **内容模块**（banner / news / bike，任务3 实现）：status 用数字 `1 = 上架`，`0 = 下架`；sort 数字越小越靠前
- **用户状态**：`active` / `disabled` 字符串；禁用/启用走 `PATCH` 并附 `reason`（禁用必填）；被禁用用户登录返回 1008
- **活动模块**：status 枚举 `draft（草稿）/ published（已发布）/ offline（已下架）`；返回还带 `statusLabel`（中文）与 `phase`（`draft/offline/upcoming/ongoing/ended`，前端直接用 phase 判断"进行中/已结束"）、`signupOpen`（当前能否报名）、`remaining`（剩余名额）
- **报名状态**：`confirmed（已报名）/ cancelled（已取消）`；取消后名额释放、可重新报名
- **图片存储**：数据库存相对 URL（如 `/uploads/2026/11/xxx.jpg`），前端展示时拼 baseURL
- **上传限制**（任务3 实现）：仅 jpg / png / webp，单张 ≤ 5MB，超限返回 400

## 二、数据表（数据库为 SQLite；每表必有主键 id 与 created_at）

### D 已建（以 `server/sql/schema.sql` 为准，勿改动）

| 表 | 关键字段 | 说明 |
|---|---|---|
| admin_user | id, username, password_hash, display_name, role, status, last_login_at, created_at, updated_at | 后台账号；密码哈希存储 |
| c_user | id, openid(唯一), unionid, nickname, avatar_url, phone(唯一), status(active/disabled), disabled_reason, disabled_at, last_login_at, created_at, updated_at | 手机号授权后回填 |
| activity | id, title, subtitle, cover, description, location, start_at, end_at, signup_start_at, signup_end_at, quota, status(draft/published/offline), version, created_by, created_at, updated_at | 时间校验：end_at>start_at、signup_end_at>signup_start_at 且 ≤ end_at |
| signup | id, signup_no(唯一), activity_id, user_id, phone, remark, status(confirmed/cancelled), is_mock, created_at, cancelled_at | 同一活动同一用户仅一条 confirmed（唯一索引） |
| visit_event | id, event_id, visitor_id, user_id, session_id, module, action, page, target_id, channel, duration_ms, created_at | 埋点流水，分析数据来源 |
| ai_insight | id, range_from, range_to, prompt_version, summary, payload, created_by, created_at | AI 解读记录 |
| audit_log | id, actor_type, actor_id, action, target_type, target_id, detail, created_at | 操作审计 |
| app_meta | key, value | schema 版本 |

### 任务3（秦旭）待建（加进 schema.sql，列名沿用下划线风格）

| 表 | 关键字段 | 设计要点 |
|---|---|---|
| banner | id, title, image, link_type, link_url, sort, status, created_at | status 控制上下架；sort 排序 |
| news | id, title, content, cover, date, status, sort, created_at | 新车资讯 |
| bike | id, name, series, price(分), params(JSON), cover, status, sort, created_at | name/series 建索引 |
| bike_image | id, bike_id, url, type(1主图/2细节), sort, created_at | 一车多图；bike_id 建索引 |
| favorite | id, user_id(引用 c_user.id), bike_id, created_at | (user_id,bike_id) 唯一；取消收藏物理删除；重复收藏返回 1015 |
| chat_log | id, user_id(引用 c_user.id), session_id, question, answer, created_at | 按 session_id 归组 |

schema.sql 由任务3（秦旭）把上面两部分合成**一份可对空库一键初始化的文件**（SQLite 语法，参照 D 的写法）。

## 三、接口清单

### 模块 1：登录、手机号与个人信息【D 已实现】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| 小程序登录 | POST /api/auth/wechat/login | {code（必填）, nickname?, avatarUrl?, phoneCode?（可随登录一起授权手机号）} | {token, tokenType:"Bearer", expiresIn, isNew, phoneBound, user:{id, nickname, avatarUrl, phone, status, createdAt}, mock} | 400/1008 |
| 手机号授权 | POST /api/auth/wechat/phone | {code} | {user:{...}, changed:true/false} | 401/400/1011 |
| 我的信息 | GET /api/users/me | — | {user:{id, nickname, avatarUrl, phone, status, createdAt}} | 401 |
| 我的信息（带报名数） | GET /api/auth/me | — | {user:{...}, signupCount} | 401 |
| 我的报名列表 | GET /api/users/me/signups | page/pageSize | total+list:[{id, signupNo, status(confirmed/cancelled), phone, remark, createdAt, cancelledAt, activity:{id, title, cover, location, startAt, endAt}}] | 401 |
| 后台登录 | POST /api/auth/admin/login | {username, password} | {token, tokenType, expiresIn, admin:{id, username, displayName, role, roleLabel, permissions:[...], status, lastLoginAt, createdAt}}（**角色读 data.admin.role**） | 400/1001/403 |
| 后台当前信息 | GET /api/auth/admin/me | — | {admin:{...}} | 401 |
| 用户列表（管理） | GET /api/admin/users | page/pageSize/keyword/status(active/disabled) | total+list:[{id, openid, nickname, avatarUrl, phone, status, disabledReason, disabledAt, lastLoginAt, createdAt, signupCount}]+summary:{active, disabled} | 403 |
| 用户详情（管理） | GET /api/admin/users/:id | — | {user:{...}, signups:[最近10条]} | 403/404 |
| 用户报名记录（管理） | GET /api/admin/users/:id/signups | page/pageSize | total+list（同我的报名结构） | 403/404 |
| 修改用户状态（管理） | PATCH /api/admin/users/:id/status | {status:"active"/"disabled", reason}（禁用时必填 reason，否则 400） | {user:{...}, changed:true/false} | 403/404/400 |
| 管理员列表（管理） | GET /api/admin/admins | page/pageSize | total+list:[{id, username, displayName, role, roleLabel, status, lastLoginAt, createdAt}] | 403（admin:read） |
| 新增管理员（管理） | POST /api/admin/admins | {username, password, displayName, role} | {admin:{...}} | 403/400/1006 |
| 编辑管理员（管理） | PUT /api/admin/admins/:id | {displayName?, role?, status?} | {admin:{...}} | 403/404/400/1007 |
| 重置管理员密码（管理） | POST /api/admin/admins/:id/reset-password | {password} | — | 403/404/400/1007 |

补充约定：用户被禁用后登录返回 1008、报名返回 1008；已有数据保留、不可新增。

使用方：小程序登录/手机号/我的 → 任务1（李端）；用户与管理员管理页 → 任务2（杨乐曈）。

### 模块 2：首页内容（Banner + 新车资讯）【任务3（秦旭）实现，按本契约】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| C 端 Banner 列表 | GET /api/banners | — | list:[{id, title, image, linkType, linkUrl}]（只返回 status=1，按 sort 升序） | — |
| Banner 列表（管理） | GET /api/admin/banners | page/pageSize | total+list | 403 |
| 新增 Banner（管理） | POST /api/admin/banners | {title, image, linkType, linkUrl?, sort?, status?}（title/image 必填） | {id} | 400 |
| 编辑（管理） | PUT /api/admin/banners/:id | 同上字段（未改可不传） | — | 404/400 |
| 删除（管理） | DELETE /api/admin/banners/:id | — | — | 404 |
| C 端资讯列表 | GET /api/news | page/pageSize | total+list:[{id, title, cover, content, date}]（只返回 status=1） | — |
| 资讯列表（管理） | GET /api/admin/news | page/pageSize | total+list | 403 |
| 新增资讯（管理） | POST /api/admin/news | {title, content, cover?, sort?, status?} | {id} | 400 |
| 编辑（管理） | PUT /api/admin/news/:id | 同上字段 | — | 404/400 |
| 删除（管理） | DELETE /api/admin/news/:id | — | — | 404 |
| 热门车型（首页） | GET /api/bikes/hot | limit（默认 4） | list:[{id, name, series, price, cover}] | — |

### 模块 3：车型【任务3（秦旭）实现，按本契约】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| C 端车型列表 | GET /api/bikes | page/pageSize/keyword/series | total+list:[{id, name, series, price, cover}]（只返回 status=1） | — |
| C 端车型详情 | GET /api/bikes/:id | — | {id, name, series, price, params, cover, isFavorited, images:[{url, type}]}（isFavorited：未登录返回 false） | 404 |
| 车型列表（管理） | GET /api/admin/bikes | page/pageSize/keyword/series | total+list | 403 |
| 新增车型（管理） | POST /api/admin/bikes | {name, series, price, params?, cover?, status?, sort?, images?:[{url, type, sort?}]} | {id} | 400 |
| 编辑车型（管理） | PUT /api/admin/bikes/:id | 同上字段（images 传则整体替换图集） | — | 404/400 |
| 删除车型（管理） | DELETE /api/admin/bikes/:id | — | — | 404 |
| 图片上传 | POST /api/upload | form-data: file | {url}（相对地址，前端拼 baseURL） | 400 |

约定：`price` 整型分；`params` 为 JSON 字符串（前端原样展示）；`images[].type`：1=主图，2=细节图。第一期不做价格区间筛选（只做 keyword+series，埋点里的排序/价格筛选事件是留给统计演示的）。
使用方：小程序摩托模块 → 任务1（李端）；车型管理页 → 任务2（杨乐曈）。

### 模块 4：收藏【任务3（秦旭）实现，按本契约】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| 收藏 | POST /api/favorites | {bikeId} | — | 401/1015 |
| 取消收藏 | DELETE /api/favorites/:bikeId | — | — | 401 |
| 我的收藏列表 | GET /api/favorites | page/pageSize | total+list:[{bikeId, name, price, cover}] | 401 |

使用方：小程序收藏交互与我的收藏 → 任务1（李端）。

### 模块 5：活动与报名【D 已实现】

**活动对象字段（驼峰）**&#8203;：id, title, subtitle, cover, description, location, startAt, endAt, signupStartAt, signupEndAt, quota, status, statusLabel, phase, signupOpen, signupCount, remaining, signedUp, createdAt, updatedAt（管理端额外返回 createdBy/cancelledCount）。

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| C 端活动列表 | GET /api/activities | page/pageSize/keyword/includeEnded | total+list:[活动对象]（只返回 published；进行中的排前面） | — |
| C 端活动详情 | GET /api/activities/:id | — | 活动对象 | 404 |
| 在线报名 | POST /api/activities/:id/signup | {remark?}（≤200字）——**手机号从已授权账户自动读取**；未授权返回 1010，前端引导授权后重试 | **HTTP 201**：{signup:{id, signupNo, status, phone, remark, createdAt}, activity:{id, title, startAt, endAt, quota, signedUp, remaining}} | 400/1002/1003/1004/1005/1008/1010 |
| 取消报名 | DELETE /api/activities/:id/signup | — | {signup:{id, signupNo, status:"cancelled", cancelledAt}, activity:{id, quota, signedUp, remaining}} | 401/404/1002（活动已结束不能取消） |
| 我的报名列表 | GET /api/users/me/signups | page/pageSize | 见模块 1（activity 嵌套在 list[].activity） | 401 |
| 活动列表（管理） | GET /api/admin/activities | page/pageSize/keyword/status | total+list:[活动对象] | 403 |
| 活动详情（管理） | GET /api/admin/activities/:id | — | 活动对象 | 403/404 |
| 新增活动（管理） | POST /api/admin/activities | {title（必填）, subtitle?, cover?, description?, location?, startAt, endAt, signupStartAt, signupEndAt, quota（>0）, status?（默认 draft）}——**字段驼峰，传 start_at 会 400**；报名截止不能晚于活动结束 | {activity:{...}} | 400/1002 |
| 编辑活动（管理） | PUT /api/admin/activities/:id | 同上字段（部分传） | {activity:{...}} | 404/400/1012 |
| 发布活动（管理） | POST /api/admin/activities/:id/publish | — | {activity:{...}}（status 变 published） | 403/404/1002 |
| 下架活动（管理） | POST /api/admin/activities/:id/offline | — | {activity:{...}}（status 变 offline） | 403/404 |
| 活动统计（管理） | GET /api/admin/activities/:id/stats | — | {confirmed, cancelled, remaining...}（以实现为准） | 403/404 |
| 报名名单（管理） | GET /api/admin/activities/:id/signups | page/pageSize/status | total+list:[{id, signupNo, status, phone（operator 看脱敏 138****5678）, remark, createdAt, cancelledAt, user:{id, nickname}}] | 403 |
| 名单导出（管理） | GET /api/admin/activities/:id/signups/export | — | CSV 文件流（完整手机号需 activity:export，即 super_admin） | 403/1013 |

> 后台没有"删除活动"路由，前端不要调用；下线活动用 `POST /:id/offline`。
> 使用方：小程序活动模块 → 任务1（李端）；活动管理页与名单导出 → 任务2（杨乐曈）。

### 模块 6：AI 智能客服【任务3（秦旭）实现，按本契约】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| 多轮对话 | POST /api/chat | {sessionId?（首传可不带）, question} | {answer, sessionId} | 400 |

约定：答案锚定库内车型数据（系统提示词注入在架车型 name/series/price），库外问题固定回复"暂无相关车型信息，您可以浏览车型列表"；问答写入 chat_log（user_id 引用 c_user.id）。使用方：小程序客服页 → 任务1（李端）。

### 模块 7：AI 数据分析【D 已实现】

所有分析接口查询参数统一：`from` / `to`（`YYYY-MM-DD`，可省略，默认近 14 天，最大 366 天）；返回都带 `range:{from, to, days}`。

| 接口 | 方法+路径 | data 返回 | 错误码 |
|---|---|---|---|
| 总览 | GET /api/admin/analytics/overview | {range, overview:{pv,uv,signups,...}, compare:{环比}} | 403 |
| 模块热度 | GET /api/admin/analytics/modules | {range, list:[{module, label, pv}]} | 403 |
| 访问趋势 | GET /api/admin/analytics/trend | {range, list:[{day, pv, uv, signups}]}（**日期字段为 day**） | 403 |
| 转化漏斗 | GET /api/admin/analytics/funnel | {range, steps:[{label, order, count, dropRate...}]}（**读 data.steps**；可选参数 activityId） | 403 |
| 渠道分布 | GET /api/admin/analytics/channels | {range, list} | 403 |
| 汇总 | GET /api/admin/analytics/summary | 汇总指标+compare | 403 |
| 最近解读 | GET /api/admin/analytics/insights/latest | {insight}（无记录时 insight 为 null） | 403 |
| AI 分析解读 | POST /api/admin/analytics/interpret | {from?, to?, question?} | {insight:{id, range, summary, source, model, ...}}（**读 data.insight**） | 403/1014（3 秒限频） |

约定：数据来源为 `POST /api/track` 埋点（见下）；分析查看 operator 可用，**发起 AI 解读仅 super_admin**。使用方：数据分析页 → 任务2（杨乐曈）。

### 模块 8：行为埋点【D 已实现，李端需接入】

| 接口 | 方法+路径 | 请求参数 | data 返回 |
|---|---|---|---|
| 上报行为 | POST /api/track | {event, ts?, module?, bikeId?/activityId?, sessionId?} | {tracked:true/false} |

约定：前端只传 `{event, ...}`，后端自动生成会话（登录用户+当天）。event 取值：
- `view` + module：`home / bike / bike_detail（带 bikeId）/ activity / activity_detail（带 activityId）/ mine / chat`
- `signup_click`、`signup_success`（带 activityId）
- `bike_sort`、`bike_price_filter`、`bike_tag_filter`
不在白名单内的事件后端忽略（返回 tracked:false）。**李端需在首页、车型列表/详情、活动页、客服页、报名按钮处埋点**。

## 四、联调约定

1. 测试环境 baseURL：`http://<任务3（秦旭）的局域网IP>:3000`（联调开始当天发群里）
2. 演示数据：车型 ≥20 条由任务3（秦旭）灌库；活动、模拟访问数据由任务4（刘昊）的 seed 脚本灌（`npm run seed`）
3. `schema.sql` 由任务3（秦旭）汇总：D 的 8 张表照抄 + 任务3 的 6 张表，SQLite 语法，可对空库一键初始化
4. 改接口流程：先改本文档 → 群里通知 → 当天生效；前端发现字段对不上，以本文档为准
5. 测试用例与缺陷清单由任务2（杨乐曈）统一维护，缺陷按 P0/P1 分级并记录闭环
6. 复验链路：登录 → 车型详情与收藏 → 活动报名/取消 → 后台查看并导出名单 → 客服多轮问答 → 分析页有数据（依赖埋点已接）

## 五、已拍板项

1. **报名不采集姓名**：报名只传可选 `remark`，手机号从已授权账户读取；小程序的姓名输入框删除或改为可选备注。
2. **时间格式为 ISO 8601**（D 已按此实现），前端统一转本地时间渲染；分析接口 from/to 用 `YYYY-MM-DD`。
3. **重复收藏错误码为 1015**（1006 已被 D 占用为"账号已存在"）。
4. **后台无删除活动接口**，下线一律用 offline。
5. 数据库为 SQLite，与 D 保持一致；任务3 的建表 SQL 也用 SQLite 语法。

## 六、待确认项

| 项目 | 契约规定 | 需确认的点 |
|---|---|---|
| 模块 2/3/4/6（任务3 未实现） | 字段已按驼峰定稿 | 李端/杨乐曈先按本文档开发页面，联调时以秦旭实现为准 |
| 埋点接入进度 | 李端按模块 8 埋点 | 李端确认各页面已埋、事件名对得上 |
| AI 解读放开 | 仅 super_admin | D 确认 operator 是否放开 |
| 上传图片目录 | `/uploads/年/月/xxx.jpg` | 秦旭实现时与 D 的静态目录（server/public）对齐 |
