# 04 · API 契约

> 本文件是前后端共同遵守的契约。**先改文档，再改代码**；口头约定不算。
> 在线自测：`npm start` 后访问 <http://127.0.0.1:3000/admin/>，或使用文末 curl。

## 1. 通用约定

### 1.1 Base URL

- 本地：`http://127.0.0.1:3000`
- 小程序真机：把 `127.0.0.1` 换成电脑局域网 IP，并在开发者工具勾选「不校验合法域名」；上线需配置 HTTPS 合法域名。

### 1.2 统一返回信封

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

- `code=0` 成功；非 0 失败。
- 业务错误（`1xxx`）HTTP 状态通常为 200，前端只认 `code`。
- 认证 / 权限 / 不存在 / 服务异常使用对应 HTTP 状态码：401 / 403 / 404 / 500。
- 错误响应可能带 `details` 与 `requestId`：

```json
{
  "code": 1004,
  "message": "你已经报名过该活动",
  "data": null,
  "details": { "signupNo": "S4-...", "createdAt": "2026-11-25T07:14:01.632Z" },
  "requestId": "req_..."
}
```

### 1.3 鉴权

```http
Authorization: Bearer <token>
```

- C 端 token：`type=user`；后台 token：`type=admin`；不能混用。
- C 端 token 默认 7 天；后台 12 小时（`.env` 可改）。
- 用户被禁用后，旧 token 立即失效（服务端每次请求查库）。

### 1.4 分页

列表接口统一：

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `page` | int | 1 | 页码 |
| `pageSize` | int | 10 | 每页条数，最大 200 |

返回：

```json
{ "list": [], "total": 0, "page": 1, "pageSize": 10 }
```

### 1.5 时间

- 请求 / 响应时间：ISO 8601 UTC，例如 `2026-11-25T07:14:01.632Z`。
- 日期查询参数：`YYYY-MM-DD`，按 UTC+8 解释。
- 后台 `datetime-local` 按 UTC+8 输入，提交前转 ISO。

## 2. 登录与手机号

### 2.1 微信登录

`POST /api/auth/wechat/login`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `code` | string | 是 | `wx.login` 的 code；mock 模式可传 `mock:demo-user-1` |
| `nickname` | string | 否 | 昵称，最大 40 |
| `avatarUrl` | string | 否 | 头像 URL，最大 500 |
| `phoneCode` | string | 否 | 手机号授权 code；mock 可传 `mock:13800138000` |
| `phone` | string | 否 | 仅 mock 模式使用，11 位手机号 |

请求：

```json
{ "code": "mock:demo-user-1", "nickname": "阿远" }
```

响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "eyJ...",
    "tokenType": "Bearer",
    "expiresIn": 604800,
    "isNew": true,
    "phoneBound": false,
    "mock": true,
    "user": {
      "id": 133,
      "nickname": "阿远",
      "avatarUrl": null,
      "phone": null,
      "status": "active",
      "createdAt": "2026-11-25T07:13:53.110Z"
    }
  }
}
```

错误：`1001` 登录失败；`1008` 已禁用；`1011` 手机号已绑定。

### 2.2 手机号授权

`POST /api/auth/wechat/phone`（需 C 端登录）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `code` | string | 二选一 | `getPhoneNumber` 返回的 code；mock 可传 `mock:13800138000` |
| `phone` | string | 二选一 | 仅 mock 模式，11 位手机号 |

```json
{ "code": "mock:13800138000" }
```

响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "changed": true,
    "user": {
      "id": 133,
      "nickname": "阿远",
      "phone": "13800138000",
      "status": "active"
    }
  }
}
```

错误：`1011` 该手机号已绑定其他微信账号。

### 2.3 当前用户

`GET /api/auth/me`（需 C 端登录）

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "user": { "id": 1, "nickname": "阿远", "phone": "138...", "status": "active" },
    "signupCount": 2
  }
}
```

### 2.3.1 兼容小程序现有路径

小程序当前调用的是下面三个路径，后端已提供等价别名，不需要 A 改页面即可联调：

| 小程序现有路径 | 等价接口 |
| --- | --- |
| `POST /api/auth/wx-login` | `POST /api/auth/wechat/login` |
| `POST /api/auth/phone` | `POST /api/auth/wechat/phone` |
| `GET /api/signups/mine` | `GET /api/users/me/signups` |

三个别名与正式路径使用同一处理函数、同一鉴权、同一返回结构；后续统一契约时可以保留别名，避免前端回归。

### 2.4 后台登录

`POST /api/auth/admin/login`

```json
{ "username": "superadmin", "password": "Admin@123456" }
```

响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "eyJ...",
    "tokenType": "Bearer",
    "expiresIn": 43200,
    "admin": {
      "id": 1,
      "username": "superadmin",
      "displayName": "超级管理员",
      "role": "super_admin",
      "roleLabel": "超级管理员",
      "status": "active",
      "permissions": ["admin:read", "admin:write", "..."]
    }
  }
}
```

错误：`1001` 用户名或密码错误；403 账号已禁用。

### 2.5 当前后台账号

`GET /api/auth/admin/me`（需后台登录）→ `{ "admin": {...} }`

### 2.6 角色与权限点

`GET /api/auth/admin/roles`（需 `admin:read`，即超级管理员）

```json
{
  "roles": [
    { "value": "super_admin", "label": "超级管理员", "permissions": ["admin:read", "..."] },
    { "value": "operator", "label": "运营管理员", "permissions": ["user:read", "..."] }
  ]
}
```

权限点：

| 权限 | super_admin | operator |
| --- | --- | --- |
| `admin:read` / `admin:write` | ✓ | — |
| `user:read` / `user:write` | ✓ | ✓ |
| `activity:read` / `activity:write` / `activity:publish` | ✓ | ✓ |
| `activity:export`（完整手机号 CSV） | ✓ | — |
| `activity:export_masked`（脱敏手机号 CSV） | ✓ | ✓ |
| `analytics:read` | ✓ | ✓ |
| `analytics:interpret`（发起 AI 解读） | ✓ | — |
| `audit:read` | ✓ | — |

> 手机号可见范围：`super_admin` 在报名列表 / 统计 / CSV 中看完整手机号；`operator` 只看到 `139****0001` 形式。完整手机号 CSV 与 AI 解读默认只给超级管理员，运营管理员仍可查看分析看板和已有解读。

## 3. 后台账号

### 3.1 列表

`GET /api/admin/admins?page=1&pageSize=10&keyword=&role=&status=`（需 `admin:read`）

响应 `list` 元素：

```json
{
  "id": 1,
  "username": "superadmin",
  "displayName": "超级管理员",
  "role": "super_admin",
  "roleLabel": "超级管理员",
  "status": "active",
  "lastLoginAt": "2026-11-25T07:13:12.000Z",
  "createdAt": "2026-11-25T07:12:34.000Z"
}
```

### 3.2 新建

`POST /api/admin/admins`（需 `admin:write`）

```json
{
  "username": "operator2",
  "password": "Operator2@123",
  "displayName": "运营二号",
  "role": "operator"
}
```

- 用户名 3—40 位，仅字母 / 数字 / `_ . -`。
- 密码至少 8 位。
- 重复用户名：`1006`。
- 成功 HTTP 201。

### 3.3 修改

`PUT /api/admin/admins/:id`（需 `admin:write`）

```json
{ "displayName": "运营二号", "role": "operator", "status": "active" }
```

- 不能禁用自己：`1007`。
- 不能降低自己的角色：`1007`。
- 不能移除最后一名启用的超级管理员：`1007`。

### 3.4 重置密码

`POST /api/admin/admins/:id/reset-password`

```json
{ "password": "NewPassword@123" }
```

## 4. C 端用户管理

### 4.1 用户列表

`GET /api/admin/users?page=1&pageSize=10&keyword=&status=active|disabled`（需 `user:read`）

- `keyword` 匹配昵称、手机号、openid。
- 响应：

```json
{
  "list": [
    {
      "id": 1,
      "openid": "mock_seed_u01",
      "nickname": "阿远",
      "avatarUrl": null,
      "phone": "13800000001",
      "status": "active",
      "disabledReason": null,
      "disabledAt": null,
      "lastLoginAt": "2026-11-25T07:12:34.000Z",
      "createdAt": "2026-11-05T02:00:00.000Z",
      "signupCount": 2
    }
  ],
  "total": 133,
  "page": 1,
  "pageSize": 10,
  "summary": { "active": 132, "disabled": 1 }
}
```

### 4.2 用户详情

`GET /api/admin/users/:id`（需 `user:read`）

```json
{
  "user": { "id": 1, "nickname": "阿远", "phone": "138...", "signupCount": 2 },
  "signups": [
    {
      "id": 10,
      "signupNo": "S1-...",
      "status": "confirmed",
      "createdAt": "2026-11-25T06:00:00.000Z",
      "activity": { "id": 1, "title": "GS 探秘之旅 · 大连站", "startAt": "...", "endAt": "...", "status": "published" }
    }
  ]
}
```

### 4.3 禁用 / 启用

`PATCH /api/admin/users/:id/status`（需 `user:write`）

```json
{ "status": "disabled", "reason": "恶意刷报名" }
```

- 禁用必须填 `reason`，否则 400。
- 启用传 `{ "status": "active" }`，`reason` 可省略。
- 禁用后：旧 token 访问返回 `1008`；重新登录返回 `1008`；不能报名。
- 历史报名保留。

### 4.4 用户报名列表

`GET /api/admin/users/:id/signups?page=1&pageSize=10`（需 `user:read`）

### 4.5 C 端我的报名

`GET /api/users/me/signups?page=1&pageSize=10`（需 C 端登录）

```json
{
  "list": [
    {
      "id": 158,
      "signupNo": "S4-...",
      "status": "confirmed",
      "phone": "13712345678",
      "remark": "希望安排试驾车",
      "createdAt": "2026-11-25T07:14:01.632Z",
      "activity": {
        "id": 4,
        "title": "秋季骑行装备特惠",
        "cover": "/admin/assets/cover-gear.svg",
        "location": "大连 · 高新店",
        "startAt": "...",
        "endAt": "..."
      }
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 10
}
```

## 5. 活动管理（后台）

活动对象：

```json
{
  "id": 1,
  "title": "GS 探秘之旅 · 大连站",
  "subtitle": "和 GS 一起，去看海与山",
  "cover": "/admin/assets/cover-gs.svg",
  "description": "活动详情……",
  "location": "大连 · 东港机车营地",
  "startAt": "2026-11-27T01:00:00.000Z",
  "endAt": "2026-11-29T10:00:00.000Z",
  "signupStartAt": "2026-11-22T01:00:00.000Z",
  "signupEndAt": "2026-11-26T10:00:00.000Z",
  "quota": 120,
  "status": "published",
  "statusLabel": "已发布",
  "phase": "upcoming",
  "signupOpen": true,
  "signupCount": 5,
  "remaining": 115,
  "signedUp": false,
  "version": 1,
  "createdAt": "...",
  "updatedAt": "...",
  "createdBy": 1,
  "createdByName": "超级管理员",
  "cancelledCount": 0
}
```

> `phase` 与 `signupOpen` 是服务端按当前时间派生，前端不要自己算。

### 5.1 活动列表

`GET /api/admin/activities?page=1&pageSize=10&keyword=&status=&phase=`

- `status`：`draft|published|offline`
- `phase`：`upcoming|ongoing|ended`（仅对已发布活动有意义）
- 响应含 `summary: { draft, published, offline }`

### 5.2 新建活动

`POST /api/admin/activities`（需 `activity:write`）

```json
{
  "title": "接口测试活动",
  "subtitle": "发布流程",
  "cover": "/admin/assets/cover-gs.svg",
  "description": "用于验证草稿到发布的完整流程",
  "location": "测试场地",
  "startAt": "2026-11-28T01:00:00.000Z",
  "endAt": "2026-11-29T10:00:00.000Z",
  "signupStartAt": "2026-11-25T00:00:00.000Z",
  "signupEndAt": "2026-11-27T10:00:00.000Z",
  "quota": 5,
  "status": "draft"
}
```

约束：

- 标题 2—80 字；描述 ≤ 5000；地点 ≤ 120；封面 ≤ 500。
- `endAt > startAt`；`signupEndAt > signupStartAt`；`signupEndAt <= endAt`。
- `quota` 1—100000。
- `status=published` 时活动不能已经结束。
- 成功 HTTP 201。

### 5.3 活动详情

`GET /api/admin/activities/:id`（需 `activity:read`）

### 5.4 编辑活动

`PUT /api/admin/activities/:id`（需 `activity:write`）

- 支持部分字段更新。
- 建议带 `version`；不一致返回 `1012`。
- 名额不能小于已报名人数：`1009`。
- 成功返回更新后的活动，`version + 1`。

### 5.5 发布 / 下架

`POST /api/admin/activities/:id/publish`（需 `activity:publish`）

- 草稿 / 已下架 → 已发布；活动已结束返回 `1002`。
- 已发布重复发布返回 `1009`。

`POST /api/admin/activities/:id/offline`（需 `activity:publish`）

- 已发布 / 草稿 → 已下架；重复下架 `1009`。
- 下架后 C 端不可见、不可报名，历史报名保留。

### 5.6 报名统计

`GET /api/admin/activities/:id/stats`（需 `activity:read`）

```json
{
  "activity": { "id": 1, "title": "GS 探秘之旅 · 大连站", "...": "..." },
  "quota": 120,
  "signedUp": 5,
  "cancelled": 1,
  "remaining": 115,
  "signupRate": 4.17,
  "cancellationRate": 16.67,
  "daily": [{ "day": "2026-11-12", "count": 0 }],
  "recent": [{ "signupNo": "S1-...", "nickname": "阿远", "phone": "138...", "createdAt": "..." }]
}
```

### 5.7 报名名单

`GET /api/admin/activities/:id/signups?page=1&pageSize=10&status=confirmed|cancelled&keyword=`

- `keyword` 匹配手机号、报名编号、昵称。
- 响应含 `summary: { confirmed, cancelled }`。

### 5.8 导出 CSV

`GET /api/admin/activities/:id/signups/export?status=&keyword=`（需 `activity:export` 或 `activity:export_masked`）

- `Content-Type: text/csv; charset=utf-8`
- 文件带 UTF-8 BOM；最多 10000 行。
- `super_admin` 导出完整手机号；`operator` 仅导出脱敏手机号（`139****0001`），不能拿到完整号码。
- 列：报名编号, 活动名称, 用户ID, 昵称, 手机号, 报名状态, 报名时间, 取消时间, 备注
- 对 `= + - @` 开头的内容加 `'` 防公式注入。
- 每次导出写审计日志。

## 6. 活动与报名（C 端）

### 6.1 活动列表

`GET /api/activities?page=1&pageSize=10&keyword=&includeEnded=false`

- 只返回 `status=published`。
- 默认排除已结束活动；`includeEnded=true` 可包含。
- 可选鉴权：带 C 端 token 时返回 `signedUp`。
- 排序：进行中优先，其次按开始时间升序。

### 6.2 活动详情

`GET /api/activities/:id`

- 只返回已发布活动；草稿 / 下架 404。
- 带 token 时返回 `mySignup`（当前有效报名）。

```json
{
  "id": 4,
  "title": "秋季骑行装备特惠",
  "signupOpen": true,
  "remaining": 183,
  "signedUp": false,
  "mySignup": null,
  "...": "..."
}
```

### 6.3 报名

`POST /api/activities/:id/signup`（需 C 端登录）

```json
{ "remark": "希望安排试驾车" }
```

成功 HTTP 201：

```json
{
  "code": 0,
  "message": "报名成功",
  "data": {
    "signup": {
      "id": 158,
      "signupNo": "S4-...",
      "status": "confirmed",
      "phone": "13712345678",
      "remark": "希望安排试驾车",
      "createdAt": "2026-11-25T07:14:01.632Z"
    },
    "activity": {
      "id": 4,
      "title": "秋季骑行装备特惠",
      "startAt": "...",
      "endAt": "...",
      "quota": 200,
      "signedUp": 17,
      "remaining": 183
    }
  }
}
```

错误：

| code | 场景 |
| --- | --- |
| `1002` | 报名未开始 / 已结束 / 活动已结束 |
| `1003` | 名额已满 |
| `1004` | 已报名（details 带已有报名编号） |
| `1005` | 活动未发布 / 已下架 |
| `1008` | 用户已禁用 |
| `1010` | 未授权手机号 |

**幂等性说明**：重复提交不会产生第二条报名，返回 `1004` + 已有报名信息；前端据此展示「已报名」即可。

### 6.4 取消报名

`DELETE /api/activities/:id/signup`（需 C 端登录）

- 仅活动结束前可取消。
- 取消后名额立即释放，可重新报名。
- 无有效报名返回 404。

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "signup": { "id": 158, "signupNo": "S4-...", "status": "cancelled", "cancelledAt": "..." },
    "activity": { "id": 4, "quota": 200, "signedUp": 16, "remaining": 184 }
  }
}
```

## 7. 用户行为分析

所有接口需 `analytics:read`（两种后台角色都有）。公共参数：

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `from` | `YYYY-MM-DD` | `to - 13 天` | 开始日期（UTC+8） |
| `to` | `YYYY-MM-DD` | 今天 | 结束日期（UTC+8） |

最大 366 天；`from > to` 返回 400。

### 7.1 看板聚合

`GET /api/admin/analytics/summary?from=2026-11-12&to=2026-11-25`

```json
{
  "range": { "from": "2026-11-12", "to": "2026-11-25", "days": 14 },
  "overview": {
    "pv": 2694,
    "uv": 285,
    "sessions": 879,
    "avgDurationMs": 67900,
    "signups": 62,
    "conversionRate": 21.75,
    "pagesPerSession": 3.07,
    "topModule": { "module": "home", "moduleLabel": "首页", "pv": 879, "pvShare": 32.63 },
    "moduleCount": 5
  },
  "modules": [
    {
      "module": "home",
      "moduleLabel": "首页",
      "pv": 879,
      "uv": 285,
      "avgDurationMs": 48100,
      "pvShare": 32.63
    }
  ],
  "trend": [
    {
      "day": "2026-11-12",
      "pv": 150,
      "uv": 47,
      "sessions": 53,
      "signups": 2,
      "conversionRate": 4.26
    }
  ],
  "funnel": {
    "basis": "session",
    "activityId": null,
    "hasData": true,
    "steps": [
      {
        "order": 1,
        "label": "进入首页",
        "description": "打开小程序并浏览首页",
        "sessions": 879,
        "visitors": 285,
        "rateFromStart": 100,
        "rateFromPrev": 100,
        "dropRate": 0
      }
    ],
    "overallConversion": 7.05,
    "biggestDrop": { "label": "点击报名", "dropRate": 56.4, "from": "查看活动详情" }
  },
  "channels": [
    {
      "channel": "wechat_search",
      "events": 1026,
      "sessions": 306,
      "signups": 23,
      "conversionRate": 7.52
    }
  ],
  "compare": {
    "current": {},
    "previous": {},
    "previousRange": { "from": "2026-10-29", "to": "2026-11-11" },
    "delta": { "pv": 10.59, "uv": 4.78, "sessions": 9.6, "signups": 6.9, "conversionRate": 0.43 }
  },
  "generatedAt": "2026-11-25T07:20:10.000Z"
}
```

**无数据时**：`hasData=false`，各步骤的 `rateFromStart`、`rateFromPrev`、`dropRate` 为 `null`，`overallConversion` 为 `null`，`biggestDrop` 为 `null`。前端和报告必须显示“暂无数据”，不能把 0/0 解释成 100% 流失。

### 7.2 单接口

| 接口 | 返回 |
| --- | --- |
| `GET /api/admin/analytics/overview` | `{ range, overview, compare }` |
| `GET /api/admin/analytics/modules` | `{ range, list }` |
| `GET /api/admin/analytics/trend` | `{ range, list }` |
| `GET /api/admin/analytics/funnel?activityId=` | `{ range, basis, steps, overallConversion, biggestDrop }` |
| `GET /api/admin/analytics/channels` | `{ range, list }` |

`funnel` 可选 `activityId`：只过滤第 3—5 步的目标活动；第 1—2 步仍是全站首页 / 活动列表。

### 7.3 生成 AI 解读

`POST /api/admin/analytics/interpret`（需 `analytics:interpret`，默认仅超级管理员）

```json
{ "from": "2026-11-12", "to": "2026-11-25", "question": "重点看报名流失" }
```

- `question` 可选，≤ 300 字，只作为分析角度。
- 同一管理员 3 秒内只能请求一次，否则 `1014`。
- 返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "insight": {
      "id": 12,
      "range": { "from": "2026-11-12", "to": "2026-11-25" },
      "source": "fallback",
      "model": "rule-based-v1",
      "promptVersion": "v1.0",
      "createdAt": "2026-11-25T07:20:10.000Z",
      "headline": "访客 285 人，报名转化率 21.75%",
      "summary": "近 14 天共产生 2694 次浏览……",
      "findings": [
        {
          "title": "首页是当前流量入口",
          "evidence": "PV 879，占全站 32.63%……",
          "implication": "首页承担主要分发职责……"
        }
      ],
      "recommendations": [
        {
          "priority": "P0",
          "action": "针对「查看活动详情 → 点击报名」做一次专项排查……",
          "owner": "产品",
          "expectedImpact": "若该环节流失率降低 10 个百分点，整体漏斗转化率预计提升约 1.62 个百分点。"
        }
      ],
      "risks": ["当前数据为模拟行为数据……"],
      "confidence": "medium",
      "meta": { "fallbackReason": "未配置 LLM_API_KEY" }
    }
  }
}
```

- `source=llm` 表示真实调用大模型；`source=fallback` 表示规则兜底。前端必须显示区别，不能把兜底说成大模型。
- 结果写入 `ai_insight`，保存输入快照与 `fallbackReason`。

### 7.4 最近一次解读

`GET /api/admin/analytics/insights/latest`

```json
{
  "insight": {
    "id": 12,
    "range": { "from": "2026-11-12", "to": "2026-11-25" },
    "source": "fallback",
    "model": "rule-based-v1",
    "summary": "...",
    "payload": {
      "insight": { "headline": "...", "summary": "...", "findings": [] },
      "input": { "overview": {}, "modules": [], "funnel": {} },
      "fallbackReason": "未配置 LLM_API_KEY"
    },
    "createdAt": "..."
  }
}
```

无记录时 `{ "insight": null }`。

### 7.5 小程序行为埋点

`POST /api/track`（可选登录）

请求体：

```json
{ "event": "view", "ts": 1795590000000, "module": "activity" }
```

支持的事件：

| event | props | 后端映射 |
| --- | --- | --- |
| `view` | `module`：`home` / `bike` / `bike_detail` / `activity` / `activity_detail` / `mine` / `chat`；详情带 `bikeId` / `activityId` | `module` + `action=view` + `page` |
| `signup_click` | `activityId` | `module=activity`、`page=activity_detail`、`action=signup_click` |
| `signup_success` | `activityId` | 同上，`action=signup_success` |
| `bike_sort` | `sort` | `module=bike`、`page=bike_list`、`action=bike_sort` |
| `bike_price_filter` | `min` / `max` | `module=bike`、`page=bike_list` |
| `bike_tag_filter` | `source` / `category` / `tier` / `tags` | `module=bike`、`page=bike_list` |

响应：

```json
{ "code": 0, "message": "ok", "data": { "tracked": true, "eventId": "evt_track_..." } }
```

说明：

- 可选登录：登录时记录 `user_id`，匿名时记录设备哈希；不影响首页 / 活动浏览。
- 未传 `sessionId` 时，后端按“IP + User-Agent + 当天”生成会话；即使中途登录，同一个会话仍能串起 `signup_click → signup_success`。
- `ts` 只作为客户端提示，服务端以收到请求的时间写入 `created_at`，避免客户端时间漂移。
- 未知事件返回 `{ tracked: false }`，不报错，避免前端埋点影响主流程。

## 8. 系统

| 接口 | 说明 |
| --- | --- |
| `GET /api/health` | 健康检查：状态、schema 版本、mock / LLM 是否配置 |
| `GET /api/meta` | 服务元信息、模块列表、错误码摘要 |

## 9. 错误码总表

| code | HTTP | 含义 | 前端处理 |
| --- | --- | --- | --- |
| 0 | 200 | 成功 | 正常 |
| 400 | 400 | 参数错误 | 展示 message，定位表单字段 |
| 401 | 401 | 未登录 / token 过期 | 清 token，跳登录 |
| 403 | 403 | 无权限 / 后台账号禁用 | 提示无权限，返回上一页 |
| 404 | 404 | 资源不存在 | 空状态 / 返回列表 |
| 500 | 500 | 服务异常 | 提示稍后重试，记录 requestId |
| 1001 | 200 | 登录失败 / 用户名密码错误 | 提示重新输入 |
| 1002 | 200 | 活动不在报名期 / 已结束 | 刷新活动状态 |
| 1003 | 200 | 名额已满 | 按钮置灰，提示其他活动 |
| 1004 | 200 | 重复报名 | 展示已有报名编号，不用再提交 |
| 1005 | 200 | 活动未发布 / 已下架 | 返回列表 |
| 1006 | 200 | 用户名 / 账号重复 | 提示换用户名 |
| 1007 | 200 | 受保护账号操作 | 提示不能禁用自己 / 最后一名超管 |
| 1008 | 200 | 用户已禁用 | 提示联系管理员，清登录态 |
| 1009 | 200 | 状态不允许（重复发布、名额低于已报名） | 刷新后重试 |
| 1010 | 200 | 未授权手机号 | 拉起手机号授权 |
| 1011 | 200 | 手机号已绑定其他账号 | 提示换手机号 / 联系管理员 |
| 1012 | 200 | 并发更新冲突 | 刷新详情，重新编辑 |
| 1013 | 200 | 导出为空 | 提示暂无数据（当前仍导出表头） |
| 1014 | 200 | AI 请求过于频繁 | 稍后再试 |

## 10. curl 示例

```bash
# 健康检查
curl http://127.0.0.1:3000/api/health

# 后台登录
curl -X POST http://127.0.0.1:3000/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"Admin@123456"}'

# 看板数据（替换 TOKEN）
curl "http://127.0.0.1:3000/api/admin/analytics/summary?from=2026-11-12&to=2026-11-25" \
  -H "Authorization: Bearer TOKEN"

# 小程序 mock 登录
curl -X POST http://127.0.0.1:3000/api/auth/wechat/login \
  -H "Content-Type: application/json" \
  -d '{"code":"mock:demo-user-1","phoneCode":"mock:13800138000"}'

# 报名（替换 USER_TOKEN 与活动 ID）
curl -X POST http://127.0.0.1:3000/api/activities/4/signup \
  -H "Authorization: Bearer USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"remark":"希望安排试驾车"}'

# 导出名单（替换 ADMIN_TOKEN）
curl -L "http://127.0.0.1:3000/api/admin/activities/4/signups/export" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -o signups.csv
```

## 11. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-11-25 | 首版：登录、用户、活动、报名、统计、分析、AI |
