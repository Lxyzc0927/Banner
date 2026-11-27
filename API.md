# 「摩托销售管理系统」接口契约 v1.0

> 定稿日期：2026.11.25。此后任何改动必须先改本文档，再改代码，口头约定一律无效。
> 责任人（对应四人分工表，下文以"任务几"指代）：
> 任务1 = 组长兼小程序前端（李端）
> 任务2 = 管理后台前端兼测试协调（杨乐曈）
> 任务3 = 后端开发兼数据库负责人（秦旭）
> 任务4 = 后端开发兼数据分析负责人（刘昊）

## 一、全局规矩（所有接口必须遵守）

### 1. 路径与动词

- `/api/bikes` 表示集合，`/api/bikes/:id` 表示单条
- 查询用 GET，新增用 POST，整体更新用 PUT，删除用 DELETE
- 管理端接口统一加 `/api/admin/` 前缀，C 端（小程序）接口不加

### 2. 统一返回信封

所有接口一律返回：

```json
// 成功
{ "code": 0, "message": "ok", "data": { ... } }

// 业务失败
{ "code": 1003, "message": "该活动名额已满", "data": null }

// 未登录
{ "code": 401, "message": "请先登录", "data": null }
```

### 3. 分页规则

列表接口一律支持 `page`（默认 1）、`pageSize`（默认 10）、可选 `keyword`，返回：

```json
{ "code": 0, "message": "ok", "data": { "total": 36, "page": 1, "pageSize": 10, "list": [ ... ] } }
```

### 4. 错误码表

| code | 含义 | 前端处理 |
|---|---|---|
| 0 | 成功 | 取 data 渲染 |
| 401 | 未登录 | 跳登录页 |
| 403 | 无权限 | toast 提示 |
| 404 | 不存在 | toast 提示 |
| 500 | 服务异常 | toast 提示 |
| 1002 | 重复操作（重复收藏/重复报名） | toast 显示 message |
| 1003 | 活动名额已满 | toast 显示 message |
| 1004 | 参数校验失败 | toast 显示 message |

### 5. 鉴权

- 登录后所有 C 端请求在 Header 带上 `Authorization: Bearer <token>`
- token 由 `POST /api/login` 签发，有效期 7 天
- **管理端 token 与 C 端 token 分开签发、互不通用**：后台账号走 `POST /api/admin/login`，C 端用户走 `POST /api/login`
- **敏感接口仅 admin 角色可调**：角色分配、管理员增删、图片上传（管理端）、数据分析、名单导出；viewer 只读，调用返回 403
- 管理端接口校验角色：admin 可管理，viewer 只读（至少两角色）

### 6. 字段命名铁律（前后端逐字对齐，11.28 审查补充）

- 响应信封字段**固定为 `code / message / data`**，前端不得读 `msg` 或其他变体
- 价格字段固定为 `price`，单位**分**，前端展示时除以 100（不得直接格式化原始值）
- 客服接口请求字段**固定为 `question`**（字符串），不得发送 `messages` 数组
- 接口路径以本文档为唯一标准（小程序登录 = `POST /api/login`，报名 = `POST /api/signups`），已有代码路径不一致的一方改代码

### 7. 时间与金额

- 时间一律传/返回 `YYYY-MM-DD HH:mm:ss` 字符串（如 `2026-11-28 14:00:00`），不用时间戳
- 价格一律用**整型存分**（如 219900 = ¥2199.00），前端展示时除以 100

### 8. 状态、排序与图片约定（11.27 对齐补充）

- **status 枚举**（全库统一，返回数字）：`1 = 上架/启用/发布`，`0 = 下架/禁用/未发布`。页面上显示"进行中/已结束"等文案，由前端根据 `start_at / end_at` 与当前时间自行判断，不单独存状态
- **sort 排序**：数字越小越靠前（1 排最前）
- **图片存储**：数据库存后端返回的相对 URL（如 `/uploads/2026/11/xxx.jpg`），前端展示时自己拼 baseURL 前缀
- **上传限制**：仅 jpg / png / webp，单张 ≤ 5MB，超限返回 1004
- **角色对照**：admin = 超级管理员，viewer = 内容编辑（接口用英文名，页面显示中文）

## 二、数据表（每表必有主键 id 与 created_at，查询字段建索引）

| 表 | 关键字段 | 设计要点 | 负责人 |
|---|---|---|---|
| banner | id, title, image, link_type, link_url, sort, status | status 控制上下架；sort 排序 | 任务3（秦旭） |
| news | id, title, content, cover, status, sort, created_at | 新车资讯；与 banner 同为首页内容管理 | 任务3（秦旭） |
| bike | id, name, series, price(分), params(JSON), cover, status, sort | status 上下架；name/series 建索引 | 任务3（秦旭） |
| bike_image | id, bike_id, url, type(1主图/2细节), sort | 一车多图；bike_id 建索引 | 任务3（秦旭） |
| favorite | id, user_id, bike_id, created_at | (user_id,bike_id) 唯一；取消收藏物理删除 | 任务3（秦旭） |
| chat_log | id, user_id, session_id, question, answer, created_at | 按 session_id 归组，便于回放 | 任务3（秦旭） |
| mock_visit | id, module, pv, uv, date, created_at | 数据分析模拟数据，灌 30 天 | 任务4（刘昊） |
| user | id, openid(唯一索引), username, password_hash, nickname, phone, role, status, created_at | 手机号授权后回填；role 区分 admin/viewer/user；admin 账号用 username+password_hash（bcrypt 等哈希存储，绝不存明文）登录 | 任务4（刘昊） |
| activity | id, title, cover, content, start_at, end_at, quota, status | 报名前校验当前时间在期内 | 任务4（刘昊） |
| signup | id, activity_id, user_id, phone, created_at | (activity_id,user_id) 唯一防重复报名 | 任务4（刘昊） |

建表 SQL 分头出，最后由**任务3（秦旭）**&#8203;合并成一份可一键导入的 schema.sql。

## 三、接口清单

### 模块 1：登录与用户【任务4（刘昊）负责】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| 管理端登录 | POST /api/admin/login | {username, password} | {token, role} | 1004 账号或密码错误 |
| 小程序登录 | POST /api/login | code（wx.login 的） | {token, user:{id, nickname, phone}} | — |
| 回填手机号 | PUT /api/users/me/phone | phoneCode（手机号授权 code） | — | 401 |
| 我的信息 | GET /api/users/me | — | {id, nickname, phone} | 401 |
| 用户列表（管理） | GET /api/admin/users | page/pageSize/keyword（名称或手机号模糊） | total+list | 403 |
| 禁用用户（管理） | PUT /api/admin/users/:id/status | status(0/1) | — | 403 |
| 角色分配（管理） | PUT /api/admin/users/:id/role | role(admin/viewer) | — | 403 |
| 管理员列表（管理） | GET /api/admin/admins | page/pageSize | total+list:{id,username,nickname,role,status} | 403 |
| 新增管理员（管理） | POST /api/admin/admins | {username,password,nickname,role} | {id}（password 后端加密存储） | 1004 |

补充约定（11.27 对齐）：禁用用户后该用户**无法登录**（登录接口返回 403），已有收藏/报名数据保留、但不可新增；页面显示角色名用对照：admin=超级管理员、viewer=内容编辑。

使用方：小程序登录/手机号授权页面 → 任务1（李端）；用户管理页 → 任务2（杨乐曈）。

### 模块 2：首页内容（Banner + 新车资讯）【任务3（秦旭）负责】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| C 端 Banner 列表 | GET /api/banners | — | list:{id,title,image,link_type,link_url}（只返回 status=1，按 sort 升序） | — |
| Banner 列表（管理） | GET /api/admin/banners | page/pageSize | total+list | 403 |
| 新增 Banner（管理） | POST /api/admin/banners | {title,image,link_type,link_url,sort} | — | 1004 |
| 编辑/上下架/排序（管理） | PUT /api/admin/banners/:id | 同上 + status + sort（上下架和排序都走编辑接口传字段，不设单独接口） | — | 404/1004 |
| 删除 Banner（管理） | DELETE /api/admin/banners/:id | — | — | 404 |
| C 端资讯列表 | GET /api/news | page/pageSize | total+list:{id,title,cover,content,date}（只返回 status=1，按 sort 升序） | — |
| 热门车型（C 端首页） | GET /api/bikes/hot | limit(默认4) | list:{id,name,series,price,cover}（取 status=1 中热度最高的 N 条） | — |
| 资讯列表（管理） | GET /api/admin/news | page/pageSize | total+list | 403 |
| 新增资讯（管理） | POST /api/admin/news | {title,content,cover,sort} | — | 1004 |
| 编辑/上下架/排序（管理） | PUT /api/admin/news/:id | 同上 + status + sort | — | 404/1004 |
| 删除资讯（管理） | DELETE /api/admin/news/:id | — | — | 404 |

车型管理端列表**第一期不支持价格区间筛选**（收敛范围，防返工），只支持 keyword（按名称模糊）+ series；后续有余力再加 price_min/price_max。

使用方：小程序首页 → 任务1（李端）；首页管理页 → 任务2（杨乐曈）。

### 模块 3：车型【任务3（秦旭）负责】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| C 端车型列表 | GET /api/bikes | page/pageSize/keyword/series/status=1 | total+list:{id,name,series,price,cover} | — |
| C 端车型详情 | GET /api/bikes/:id | — | {id,name,series,price,params,cover,is_favorited,images:[{url,type}]}（is_favorited 为当前用户收藏状态回显，未登录返回 false） | 404 |
| 车型列表（管理） | GET /api/admin/bikes | page/pageSize/keyword | total+list（含 status） | 403 |
| 新增车型（管理） | POST /api/admin/bikes | {name,series,price,params,cover,status} | {id} | 1004 |
| 编辑车型（管理） | PUT /api/admin/bikes/:id | 同上 | — | 404/1004 |
| 删除车型（管理） | DELETE /api/admin/bikes/:id | — | — | 404 |
| 图片上传 | POST /api/upload | form-data: file | {url}（相对地址，前端拼 baseURL；jpg/png/webp，≤5MB） | 1004 |

车型必填字段：`name / series / price / cover / status`；`params` 为 JSON 字符串（排量、坐高等参数键值对，前端按原样展示）。`bike_image.type` 取值：`1 = 主图`，`2 = 细节图`。

使用方：小程序摩托模块 → 任务1（李端）；车型管理页 → 任务2（杨乐曈）。

### 模块 4：收藏【任务3（秦旭）负责】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| 收藏 | POST /api/favorites | {bike_id} | — | 401/1002 |
| 取消收藏 | DELETE /api/favorites/:bikeId | — | — | 401 |
| 我的收藏列表 | GET /api/favorites | page/pageSize | total+list:{bike_id,name,price,cover} | 401 |

使用方：小程序收藏交互与我的收藏 → 任务1（李端）。

### 模块 5：活动与报名【任务4（刘昊）负责】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| C 端活动列表 | GET /api/activities | page/pageSize/status | total+list:{id,title,cover,start_at,end_at,quota,signed_count} | — |
| C 端活动详情 | GET /api/activities/:id | — | 同上 + content | 404 |
| 在线报名 | POST /api/signups | {activity_id, phone} | — | 401/1002/1003/1004 |
| 我的报名列表 | GET /api/signups/me | page/pageSize | total+list:{activity_id,title,start_at,created_at} | 401 |
| 活动列表（管理） | GET /api/admin/activities | page/pageSize/keyword | total+list（含 status） | 403 |
| 新增活动（管理） | POST /api/admin/activities | {title,cover,content,start_at,end_at,quota} | {id} | 1004 |
| 编辑/下架（管理） | PUT /api/admin/activities/:id | 同上 + status | — | 404/1004 |
| 删除活动（管理） | DELETE /api/admin/activities/:id | — | — | 404 |
| 报名统计（管理） | GET /api/admin/activities/:id/signups | page/pageSize | total+list:{user_id,phone,created_at} | 403 |
| 名单导出（管理） | GET /api/admin/activities/:id/signups/export | — | CSV 文件流（UTF-8，首行列名，已按现有实现统一为 CSV） | 403 |

> **名单导出是统一 JSON 信封的唯一例外**：该接口直接返回文件流（`Content-Type: text/csv`，带下载文件名头），不走 `{code,message,data}` 包装。前端用浏览器直接打开该地址或以 blob 下载保存即可。仅 admin 可调用。

使用方：小程序活动模块 → 任务1（李端）；活动管理页与名单导出 → 任务2（杨乐曈）。

### 模块 6：AI 智能客服【任务3（秦旭）负责】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| 多轮对话 | POST /api/chat | {sessionId(首传可不带), question} | {answer, sessionId} | 1004 |

约定：答案必须锚定库内车型数据（系统提示词注入在架车型的 name/series/price），库外问题固定回复"暂无相关车型信息，您可以浏览车型列表"；问答写入 chat_log。使用方：小程序客服入口与对话页 → 任务1（李端）。

### 模块 7：AI 数据分析【任务4（刘昊）负责】

| 接口 | 方法+路径 | 请求参数 | data 返回 | 错误码 |
|---|---|---|---|---|
| 模块热度 | GET /api/stats/module-hot | dateRange 可选 | list:{module, pv} | — |
| 访问趋势 | GET /api/stats/trend | days(默认7) | list:{date, pv, uv} | — |
| 转化漏斗 | GET /api/stats/funnel | — | list:{step, count} | — |
| AI 分析解读 | POST /api/stats/interpretation | dateRange 可选 | {summary}（大模型基于统计结果生成的文字解读） | 1004 |

约定：基于模拟数据（mock_visit 表灌 30 天数据），不接真实埋点。使用方：数据分析页 → 任务2（杨乐曈）。

## 四、联调约定

1. 测试环境 baseURL：`http://<任务3（秦旭）的局域网IP>:3000`（12.01 联调开始当天发群里）
2. 演示数据：车型 ≥20 条由任务3（秦旭）灌库；活动 ≥5 条、模拟访问数据由任务4（刘昊）灌库（12.04 13:00 前）
3. 数据库脚本 `schema.sql` 由任务3（秦旭）汇总，必须能对空库一键导入
4. 改接口流程：先改本文档 → 群里通知 → 当天生效。前端发现字段对不上，以本文档为准
5. 测试用例与缺陷清单由任务2（杨乐曈）统一维护，缺陷按 P0/P1 分级并记录闭环
