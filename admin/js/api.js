/* ============================================================
 * api.js · 管理后台统一接口层（组员 B / 杨乐曈）
 * 依据：API.md v1.6（C 的 71fc209，2026-11-29 定稿）+ D 服务端实现 + 组长历轮复审意见
 *
 * 用法：
 *   1) 所有接口路径集中在 API 常量里，最终定值时只改这一处。
 *   2) request() 自动处理：拼 baseURL、带 Bearer token、拆信封、非 0 弹 toast、
 *      401 同时清 token 与角色并跳登录。
 *   3) 现在 USE_MOCK = true，页面继续用 data.js 的假数据演示；
 *      联调当天把 USE_MOCK 改成 false、填好 baseURL，再按速查把各页面 fetch 接上即可。
 *
 * 本轮按联调意见对齐：
 *   - 模块热度 /analytics/modules，AI 解读 /analytics/interpret（读 data.insight）
 *   - 分析接口日期区间用 query: { from, to }
 *   - 登录角色读 data.admin.role 并落本地；会话失效同时清 token 与角色
 *   - 活动适配读 startAt / signupCount / phase；账户状态用 active/disabled 字符串枚举
 *   - 用户状态走 PATCH，禁用附 reason；CSV 导出走 Bearer + Blob，URL 不带 token
 *
 * 复审修复（组长 c2be4f2 复审意见）：
 *   - [P1] 401 只清理「请求所属会话仍是当前会话」的登录态，旧请求的延迟 401 不再清掉新登录
 *   - [P2] 401 处理前置到 blob/json 分流之前，CSV 导出遇 401 同样清理会话
 *   - [P2] 权限判断先要求有有效会话，未登录时 canInterpret() 不再误返回 true
 *
 * 复审修复（组长 d54dbc3 复审意见）：
 *   - [P2] canInterpret() 只对已登录的 super_admin 返回 true（operator 调解读接口 403）
 *   - [P2] 引入会话版本号：每次登录/退出递增，401 只在版本仍匹配时清理，
 *          解决同秒重登签发相同 JWT 时 token 比较无法区分两次登录的问题
 *
 * 复审修复（组长 09190e8 复审意见）：
 *   - [P2] 为每次登录尝试分配标识，退出会使在途尝试失效；退出后才返回的登录响应不再恢复会话
 *   - [P3] 401 的清理与「登录已过期」提示都限定在当前会话，旧请求的延迟 401 不再误报
 *
 * 复审修复（组长 df5b8a0 复审意见）：
 *   - [P2] 登录尝试标识改存 localStorage（跨标签页共享），另一标签页退出也能作废旧登录响应
 *
 * 复审修复（组长 39530d0 复审意见）：
 *   - [P3] 会话记录绑定「退出版本」，读取 token/角色时校验版本；
 *          即使另一页在校验通过后、写入前退出，迟到写入的会话也无法被读到
 *
 * 复审修复（组长 743412c 复审意见）：
 *   - [P2] token/角色/归属版本合并为「单条会话记录」一次原子写入，消除分步写的中间态；
 *          读取时校验归属版本，失效记录直接忽略；旧响应写入失败不再 clearAll，
 *          避免把另一标签页刚写入的新会话一起删掉
 *
 * 同步 API.md v1.6（联调基线）：
 *   - 活动发布/下架改专用路由：POST /:id/publish、POST /:id/offline（原 PUT {status} 作废）
 *   - 分析接口补齐 8 个：新增 overview/channels/summary/insightsLatest
 *   - 补用户详情/报名记录、管理员编辑/重置密码、后台当前信息
 *   - 字段：banner 读管理端 linkType/linkUrl；admin 读 displayName；
 *          趋势日期字段 day、漏斗读 steps[].sessions、模块读 moduleLabel
 *   - 权限点数组 data.admin.permissions 随会话保存，Perm 优先按权限点、回退角色
 *
 * 复审修复（组长 c48f1fa 复审意见）：
 *   - [P1] 新增 isTrustedApiBase() 主机白名单：只允许本机/回环/私网 IP。
 *          request() 对非白名单地址直接拒绝，杜绝 base 参数把 Bearer 令牌/账号密码
 *          发送到任意外部服务器；Bridge 切换地址时复用同一校验并先清空登录态
 * ============================================================ */

/* ---------- 全局配置：联调时只改这里 ---------- */
const API_CONFIG = {
  USE_MOCK: true,                                  // 联调时改为 false
  baseURL: 'http://127.0.0.1:3000',                // C 发局域网 IP 后替换；末尾不要带 /
  sessionKey: 'admin_session',                     // 单条会话记录 {token, role, owner}，一次原子写入
  sessionVersionKey: 'admin_session_version',      // 会话版本号：区分同秒重登签发的相同 JWT
  loginAttemptKey: 'admin_login_attempt',          // 登录尝试标识：跨标签页共享，退出时换新使在途登录失效
  logoutVersionKey: 'admin_logout_version',        // 退出版本：只由退出递增，用于绑定会话记录
  successCode: 0,                                  // code === 0 视为成功
  timeout: 10000
};

/* ---------- 主机白名单：防止 base 参数把令牌发到任意服务器 ----------
 * 联调地址只会是本机/回环/局域网私网 IP。公网域名或公网 IP 一律拒绝，
 * 这样即便有人构造 admin/index.html?base=https://evil.example 诱导点击，
 * URL 里的地址也不会被用来发带 Authorization 的请求。
 */
function isTrustedApiBase(raw) {
  try {
    const s = String(raw || '').trim();
    if (!s) return false;
    // 仅允许 http/https，且必须带主机
    const m = /^(https?):\/\/([^\/:?#]+)(?::\d+)?(?:[\/?#]|$)/i.exec(s);
    if (!m) return false;
    const host = m[2].toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true;
    // IPv4 私网段：10/8、172.16/12、192.168/16
    const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (ip) {
      const a = Number(ip[1]), b = Number(ip[2]);
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
    }
    return false;
  } catch (e) { return false; }
}

/* ---------- 路径常量：与 API.md v1.6 一一对应 ---------- */
const API = {
  // 登录（D）
  login:        '/api/auth/admin/login',
  me:           '/api/auth/admin/me',              // GET 后台当前信息 -> {admin}
  // 首页内容（C）
  home:         '/api/home',                       // GET 首页聚合 -> {banners, news, hotBikes}
  banners:      '/api/admin/banners',              // GET/POST/PUT/DELETE
  news:         '/api/admin/news',                 // GET/POST/PUT/DELETE
  hotBikes:     '/api/bikes/hot',                  // GET?limit=
  // 车型（C）
  bikes:        '/api/admin/bikes',                // GET/POST/PUT/DELETE
  bikeFilters:  '/api/bikes/filters',              // GET -> {categories, tags}
  upload:       '/api/upload',                     // POST form-data:file -> {url}
  // 活动与报名（D）—— 后台无删除路由，下架用专用 offline
  activities:   '/api/admin/activities',           // GET 列表 / POST 新增(201)
  activity:     id => `/api/admin/activities/${id}`,             // GET 详情(直接是活动对象) / PUT 编辑(回传 version)
  activityStats:id => `/api/admin/activities/${id}/stats`,       // GET 活动统计
  publish:      id => `/api/admin/activities/${id}/publish`,     // POST 发布
  offline:      id => `/api/admin/activities/${id}/offline`,     // POST 下架（不是 PUT {status}）
  signups:      id => `/api/admin/activities/${id}/signups`,
  exportUrl:    id => `/api/admin/activities/${id}/signups/export`, // CSV 流，信封例外
  // 用户与管理员（D）
  users:        '/api/admin/users',
  user:         id => `/api/admin/users/${id}`,                // GET 用户详情
  userSignups:  id => `/api/admin/users/${id}/signups`,        // GET 用户报名记录
  userStatus:   id => `/api/admin/users/${id}/status`,
  admins:       '/api/admin/admins',
  admin:        id => `/api/admin/admins/${id}`,               // PUT 编辑管理员
  resetAdminPwd:id => `/api/admin/admins/${id}/reset-password`, // POST 重置密码
  // 数据分析（D）—— v1.6 共 8 个
  overview:     '/api/admin/analytics/overview',
  moduleHot:    '/api/admin/analytics/modules',
  trend:        '/api/admin/analytics/trend',
  funnel:       '/api/admin/analytics/funnel',
  channels:     '/api/admin/analytics/channels',
  summary:      '/api/admin/analytics/summary',
  insightsLatest:'/api/admin/analytics/insights/latest',
  interpret:    '/api/admin/analytics/interpret',
  // 小程序端（A）参考：手机号授权 / 我的报名
  wxPhone:      '/api/auth/wechat/phone',          // POST { code } -> 绑定手机号
  mySignups:    '/api/users/me/signups'            // GET 我的报名
};

/* ---------- 会话存取：单条会话记录 + 版本管理 ----------
 * 会话版本（session version）用来区分「同秒重新登录」：D 给同一账号同一秒会签发
 * 完全相同的 JWT，仅比较 token 无法识别这是两次不同的登录。每次成功登录 / 退出
 * 都会递增版本；请求发出时记录当时的版本，401 时只有版本仍匹配才清理会话。
 *
 * token / 角色 / 归属版本合并为「一条记录」一次 setItem 写入，避免分步写造成中间态；
 * 读取时校验 owner 是否等于当前退出版本，不等即视为失效记录、直接忽略。
 * 关键：写入失败只丢弃本次写入，绝不 clearAll —— 否则旧响应会把另一标签页刚写好的
 * 新会话一起删掉。
 */

const Token = {
  // 退出版本只由退出递增。会话记录写入时绑定发起登录时的退出版本，读取时若绑定版本
  // 与当前版本不一致就当作无会话，堵住「校验通过后、写入前被另一页退出」的窄窗口。
  logoutVersion() { return Number(localStorage.getItem(API_CONFIG.logoutVersionKey) || 0); },
  bumpLogoutVersion() {
    const v = this.logoutVersion() + 1;
    localStorage.setItem(API_CONFIG.logoutVersionKey, String(v));
    return v;
  },
  // 读取会话记录：解析失败或归属版本不符都返回 null（失效记录被忽略，不清理存储）
  read() {
    const raw = localStorage.getItem(API_CONFIG.sessionKey);
    if (!raw) return null;
    let rec;
    try { rec = JSON.parse(raw); } catch (e) { return null; }
    if (!rec || typeof rec !== 'object' || rec.owner !== this.logoutVersion()) return null;
    return rec;
  },
  get()     { const rec = this.read(); return rec ? (rec.token || '') : ''; },
  getRole() { const rec = this.read(); return rec ? (rec.role || '') : ''; },
  getPermissions() { const rec = this.read(); return rec && Array.isArray(rec.permissions) ? rec.permissions : []; },
  setRole(r) {
    const rec = this.read();
    if (rec && r) {
      rec.role = r;
      localStorage.setItem(API_CONFIG.sessionKey, JSON.stringify(rec));
    }
  },
  // 单条原子写入：一次 setItem 写完 token/角色/权限点/归属版本，没有分步写的中间态。
  // 版本不符时只抛错丢弃本次写入，绝不清 localStorage —— 不能误删别页的新会话。
  setSession(t, r, exitVersion, permissions) {
    if (exitVersion !== this.logoutVersion()) throw new Error('SESSION_INVALIDATED');
    localStorage.setItem(API_CONFIG.sessionKey, JSON.stringify({
      token: t, role: r || '', permissions: Array.isArray(permissions) ? permissions : [], owner: exitVersion
    }));
    // 写后复核：若写入瞬间发生了退出，仅报错让调用方知道本次登录未落地；
    // 失效记录留在存储里但读取时会被忽略，不去 clearAll 误伤新会话。
    if (exitVersion !== this.logoutVersion()) throw new Error('SESSION_INVALIDATED');
  },
  // 登录尝试标识：存 localStorage，多个标签页共享。每次登录/退出都换新标识，
  // 登录响应写入会话前校验标识仍是自己发起时的值；另一标签页退出也能作废旧尝试。
  newLoginAttempt() {
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    localStorage.setItem(API_CONFIG.loginAttemptKey, id);
    return id;
  },
  loginAttempt() { return localStorage.getItem(API_CONFIG.loginAttemptKey) || ''; },
  // 会话版本：localStorage 存字符串，读取时转数字
  version()  { return Number(localStorage.getItem(API_CONFIG.sessionVersionKey) || 0); },
  bump()     { const v = this.version() + 1; localStorage.setItem(API_CONFIG.sessionVersionKey, String(v)); return v; },
  // 会话失效时删除这条记录（不改变版本，版本由调用方按语义递增）
  clearAll() { localStorage.removeItem(API_CONFIG.sessionKey); }
};

/* ---------- 统一请求封装 ----------
 * 返回 data 字段（成功时）；失败自动 toast 并抛错，调用方用 try/catch 兜底。
 * opts: { method, body, query, silent, responseType: 'json'|'blob' }
 */
async function request(path, opts = {}) {
  if (API_CONFIG.USE_MOCK) {
    if (!opts.silent) toast('当前为演示模式（USE_MOCK=true），未发起真实请求');
    throw new Error('MOCK_MODE');
  }
  const { method = 'GET', body, query, silent = false, responseType = 'json' } = opts;
  // 令牌/账号密码只发给可信地址：baseURL 非本机/私网时直接拒绝，绝不发请求
  if (!isTrustedApiBase(API_CONFIG.baseURL)) {
    if (!silent) toast('后端地址不在允许范围（仅本机/局域网），已阻止请求');
    throw new Error('UNTRUSTED_BASE');
  }
  let url = API_CONFIG.baseURL + path;
  if (query && Object.keys(query).length) {
    url += '?' + Object.keys(query)
      .filter(k => query[k] !== undefined && query[k] !== null && query[k] !== '')
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(query[k]))
      .join('&');
  }
  const headers = {};
  const token = Token.get();
  // 记录请求发出时的会话版本，用于 401 时判断是否仍是当前会话
  const sessionVersion = Token.version();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body instanceof FormData ? body : (body !== undefined ? JSON.stringify(body) : undefined),
      signal: AbortSignal.timeout ? AbortSignal.timeout(API_CONFIG.timeout) : undefined
    });
  } catch (e) {
    if (!silent) toast('网络异常，请检查后端地址与网络');
    throw e;
  }

  // 鉴权失败：放在 blob / json 分流之前，让 CSV 导出与 JSON 请求走同一套会话清理。
  // 用会话版本而非 token 判断是否为当前会话：同秒重登会签发完全相同的 JWT，token 比较
  // 区分不出两次登录。只有「请求发出时的会话版本 === 当前版本」才说明是当前登录态失效，
  // 才清理 token/角色并提示；否则是旧会话请求的延迟 401，既不清理用户后来重新登录的会话，
  // 也不弹出「登录已过期」误导用户。
  if (res.status === 401) {
    const isCurrentSession = sessionVersion === Token.version();
    if (isCurrentSession) {
      Token.clearAll();
      if (!silent) toast('登录已过期，请重新登录');
    }
    throw new Error('UNAUTHORIZED');
  }

  // 名单导出是 CSV 文件流，不走信封
  if (responseType === 'blob') {
    if (!res.ok) { if (!silent) toast('导出失败：HTTP ' + res.status); throw new Error('HTTP ' + res.status); }
    return await res.blob();
  }

  let payload;
  try { payload = await res.json(); }
  catch (e) { if (!silent) toast('返回不是合法 JSON'); throw e; }

  if (payload.code !== API_CONFIG.successCode) {
    if (!silent) toast(payload.message || ('请求失败：' + payload.code));
    const err = new Error(payload.message || 'BUSINESS_ERROR');
    err.code = payload.code;
    throw err;
  }
  return payload.data;
}

/* ---------- 字段适配：把后端数据 normalize 成骨架字段 ----------
 * 接页面时若不想大改渲染逻辑，可在 fetch 后套这些函数。
 * 以 D 服务端 51bc0d3 的实际返回为准：
 *   活动：title / startAt / signupCount / phase（不是 start_at / signup_count / status 直译）
 *   账户状态：字符串枚举 active / disabled（不是 1 / 0）
 *   角色：super_admin / operator
 */
const PHASE_LABEL = { draft: '未开始', upcoming: '未开始', ongoing: '进行中', ended: '已结束', offline: '已下架' };
// 管理端 banner 返回原始 linkType/linkUrl，C 端返回拼好的 link；两种都兼容
const LINK_TYPE_PATH = { bike: '/bike/', activity: '/activity/' };
function joinLink(type, url) {
  if (!type) return '';
  const prefix = LINK_TYPE_PATH[type];
  if (!prefix || !url) return '';
  return prefix + url;
}
const Adapt = {
  // 管理端：{linkType, linkUrl} -> link；C 端：已有 link 直接透传
  banner: b => ({
    id: b.id, title: b.title,
    image: b.image || b.cover || '',
    link: b.link || joinLink(b.linkType, b.linkUrl),
    linkType: b.linkType || '', linkUrl: b.linkUrl || '',
    sort: b.sort,
    status: b.status === 1 ? '上架' : '下架',
    rawStatus: b.status
  }),
  // 响应 price 单位分 -> 展示元；query 的 minPrice/maxPrice 仍按元发送
  bike: b => ({ id: b.id, name: b.name, category: b.category || '', price: b.price / 100, cc: b.cc, cover: b.cover || '', status: b.status === 1 ? '上架' : '下架' }),
  price:   fen => fen / 100,
  yuanToFen: yuan => Math.round(Number(yuan) * 100),
  activity: a => ({
    id: a.id, name: a.title,
    date: a.startAt ? String(a.startAt).slice(0, 10) : '',
    startAt: a.startAt, endAt: a.endAt,
    signup: a.signupCount != null ? a.signupCount : (a.signups || 0),
    quota: a.quota,
    phase: a.phase,
    status: PHASE_LABEL[a.phase] || (a.status === 'published' ? '进行中' : a.status === 'offline' ? '已下架' : '未开始'),
    rawStatus: a.status,
    statusLabel: a.statusLabel,
    signupOpen: !!a.signupOpen,
    version: a.version                     // 编辑活动需原样回传，防 1012 并发冲突
  }),
  // 状态为字符串枚举：active / disabled
  user: u => ({ id: u.id, name: u.nickname || u.name, phone: u.phone, status: u.status === 'active' ? '正常' : '禁用', rawStatus: u.status, disabledReason: u.disabledReason || '' }),
  // v1.6：管理员展示名读 displayName，回退 username/name
  admin: a => ({ id: a.id, name: a.displayName || a.username || a.name, displayName: a.displayName || '', username: a.username || '', role: a.role === 'super_admin' ? '超级管理员' : '运营管理员', rawRole: a.role, status: a.status === 'active' ? '启用' : '禁用', rawStatus: a.status })
};

/* ---------- 各模块调用方法（供页面直接调用） ----------
 * 例：
 *   const list = await Api.banners.list({ page:1, pageSize:8 });
 *   const data = await Api.banners.create({ title, link, sort });
 *   await Api.upload(file);                // -> { url }，相对地址，展示时拼 baseURL
 *   Api.signups.exportCsv(id);             // 触发浏览器下载 CSV
 */
const Api = {
  async login(username, password) {
    // 在共享存储登记本次尝试：等待响应期间若任一标签页退出（或又发起新登录），
    // 标识会被换掉，迟到的成功响应必须丢弃，否则会把 token/角色写回共享会话。
    const attempt = Token.newLoginAttempt();
    const exitVersion = Token.logoutVersion();   // 会话记录绑定发起登录时的退出版本
    const data = await request(API.login, { method: 'POST', body: { username, password } });
    if (attempt !== Token.loginAttempt()) {
      throw new Error('LOGIN_SUPERSEDED');   // 尝试已作废，不恢复会话
    }
    // 先递增会话版本，再写入新 token/角色：让此前发出的旧请求 401 无法清理这次新登录
    Token.bump();
    // 角色读 data.admin.role，权限点读 data.admin.permissions（v1.6 后端按权限点鉴权）
    const admin = (data && data.admin) || {};
    Token.setSession(data.token, admin.role, exitVersion, admin.permissions);  // 写入时复查退出版本，跨页退出会使其失效
    return data;   // { token, admin: { id, username, displayName, role, permissions, ... } }
  },

  // 退出登录：换新共享尝试标识使所有标签页的在途登录失效，递增退出版本使旧会话记录失效，
  // 递增会话版本使在途请求失效，再清理 token/角色
  async logout() {
    Token.newLoginAttempt();
    Token.bumpLogoutVersion();
    Token.bump();
    Token.clearAll();
  },

  me: () => request(API.me, { silent: true }),   // -> {admin}
  // 首页聚合 / 筛选项（C 端，供后台预览联调用）
  home:        () => request(API.home, { silent: true }),
  bikeFilters: () => request(API.bikeFilters, { silent: true }),
  banners: {
    list:   q => request(API.banners, { query: q, silent: true }),
    create: b => request(API.banners, { method: 'POST', body: b }),
    update: (id, b) => request(API.banners + '/' + id, { method: 'PUT', body: b }),
    remove: id => request(API.banners + '/' + id, { method: 'DELETE' })
  },
  news: {
    list:   q => request(API.news, { query: q, silent: true }),
    create: b => request(API.news, { method: 'POST', body: b }),
    update: (id, b) => request(API.news + '/' + id, { method: 'PUT', body: b }),
    remove: id => request(API.news + '/' + id, { method: 'DELETE' })
  },
  bikes: {
    // 查询参数 minPrice/maxPrice 单位为元；响应 price 为分，展示时套 Adapt.bike / Adapt.price
    list:    q => request(API.bikes, { query: q, silent: true }),
    detail:  id => request('/api/bikes/' + id, { silent: true }),
    create:  b => request(API.bikes, { method: 'POST', body: b }),
    update:  (id, b) => request(API.bikes + '/' + id, { method: 'PUT', body: b }),
    remove:  id => request(API.bikes + '/' + id, { method: 'DELETE' })
  },
  upload: async file => {
    const fd = new FormData();
    fd.append('file', file);
    return await request(API.upload, { method: 'POST', body: fd });   // -> { url }
  },

  activities: {
    list:    q => request(API.activities, { query: q, silent: true }),
    // 新增（返回 201，data 直接是活动对象）；字段名驼峰，别传 start_at
    create:  b => request(API.activities, { method: 'POST', body: b }),
    detail:  id => request(API.activity(id), { silent: true }),
    // 编辑：把读到的 version 原样回传，不一致会返回 1012 防并发覆盖
    update:  (id, b) => request(API.activity(id), { method: 'PUT', body: b }),
    // 发布 / 下架：v1.6 专用路由，POST 无 body；后台没有删除路由
    publish: id => request(API.publish(id), { method: 'POST' }),
    offline: id => request(API.offline(id), { method: 'POST' }),
    stats:   id => request(API.activityStats(id), { silent: true }),
    signups: (id, q) => request(API.signups(id), { query: q, silent: true })
  },
  signups: {
    /**
     * 名单导出：CSV 是信封例外，带 Authorization: Bearer 请求后下载 Blob。
     * token 不再拼进 URL（避免出现在日志/历史里）。
     */
    async exportCsv(id, q) {
      const blob = await request(API.exportUrl(id), { query: q, responseType: 'blob', silent: true });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = '报名名单_' + id + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      return blob;
    }
  },

  users: {
    list:   q => request(API.users, { query: q, silent: true }),
    detail: id => request(API.user(id), { silent: true }),                 // -> {user, signups}
    signups:(id, q) => request(API.userSignups(id), { query: q, silent: true }),
    // 状态为字符串枚举 active / disabled；禁用时必传 reason
    toggle: (id, status, reason) => {
      const body = { status };
      if (status === 'disabled') body.reason = reason;
      return request(API.userStatus(id), { method: 'PATCH', body });
    },
    admins: q => request(API.admins, { query: q, silent: true }),
    addAdmin: a => request(API.admins, { method: 'POST', body: a }),
    updateAdmin: (id, a) => request(API.admin(id), { method: 'PUT', body: a }),
    resetAdminPwd: (id, password) => request(API.resetAdminPwd(id), { method: 'POST', body: { password } })
  },

  analytics: {
    // 日期区间统一用 { from, to }（YYYY-MM-DD）；不传则服务端默认近 14 天
    overview: q => request(API.overview, { query: q, silent: true }),
    moduleHot: q => request(API.moduleHot, { query: q, silent: true }),
    trend:     q => request(API.trend, { query: q, silent: true }),       // list[].day
    funnel:    q => request(API.funnel, { query: q, silent: true }),       // steps[].sessions
    channels:  q => request(API.channels, { query: q, silent: true }),
    summary:   q => request(API.summary, { query: q, silent: true }),
    // 返回 {insight}；无记录时 insight 为 null（且无 range）
    insightsLatest: () => request(API.insightsLatest, { silent: true }),
    // AI 解读：from/to/question 放 POST body（不是 query）；读 data.insight
    interpret: async q => {
      const data = await request(API.interpret, { method: 'POST', body: q || {} });
      return data && data.insight;
    }
  }
};

/* ---------- 权限判断（v1.6：后端按权限点鉴权，前端优先读 permissions） ----------
 * 登录时把 data.admin.permissions 一并存入会话。判断时先看权限点数组是否非空：
 *   - 有权限点：按权限点判断（与后端一致，最准）
 *   - 无权限点（兼容旧后端/演示数据）：回退到角色判断
 * 权限点对应关系（D auth.js）：
 *   super_admin: activity:export / analytics:interpret / admin:* / 全部
 *   operator:    activity:export_masked / analytics:read / user:* / activity:*
 * 必须先要求存在有效会话，避免未登录或清空会话后误判为有权限。
 */
const Perm = {
  hasSession: () => Boolean(Token.get()),
  role:   () => Token.getRole() || 'operator',
  perms:  () => Token.getPermissions(),
  setRole: r => Token.setRole(r),
  // 有权限点按权限点判，否则回退角色
  allows(point) {
    const list = Perm.perms();
    if (list.length) return list.indexOf(point) !== -1;
    return Perm.role() === 'super_admin';
  },
  canExportPhone:  () => Perm.hasSession() && Perm.allows('activity:export'),
  canExportMasked: () => Perm.hasSession() && (Perm.allows('activity:export') || Perm.allows('activity:export_masked')),
  canManageAdmins: () => Perm.hasSession() && Perm.allows('admin:write'),
  // AI 解读仅 super_admin / 有 analytics:interpret 权限点者可用（operator 调接口会 403）
  canInterpret: () => Perm.hasSession() && Perm.allows('analytics:interpret')
};

/* ---------- 图片 URL：后端存相对地址，展示时拼 baseURL ---------- */
function imgUrl(path) {
  if (!path) return '';
  return /^(https?:\/\/|data:image\/)/i.test(path) ? path : API_CONFIG.baseURL + path;
}
