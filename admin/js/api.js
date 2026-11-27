/* ============================================================
 * api.js · 管理后台统一接口层（组员 B / 杨乐曈）
 * 依据：D 服务端 51bc0d3 实现为准 + 组长 11.27 联调修改意见（第 2 条），2026-11-27
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
 * ============================================================ */

/* ---------- 全局配置：联调时只改这里 ---------- */
const API_CONFIG = {
  USE_MOCK: true,                                  // 联调时改为 false
  baseURL: 'http://127.0.0.1:3000',                // C 发局域网 IP 后替换；末尾不要带 /
  tokenKey: 'admin_token',                         // localStorage 中 token 的键名
  roleKey: 'admin_role',                           // localStorage 中角色的键名（登录时保存）
  sessionVersionKey: 'admin_session_version',      // 会话版本号：区分同秒重登签发的相同 JWT
  successCode: 0,                                  // code === 0 视为成功
  timeout: 10000
};

/* ---------- 路径常量：与 API.md v1.2 一一对应 ---------- */
const API = {
  // 登录
  login:        '/api/auth/admin/login',
  // 首页内容（C）
  banners:      '/api/admin/banners',              // GET/POST/PUT/DELETE
  news:         '/api/admin/news',                 // GET/POST/PUT/DELETE
  hotBikes:     '/api/bikes/hot',                  // GET?limit=
  // 车型（C）
  bikes:        '/api/admin/bikes',                // GET/POST/PUT/DELETE
  upload:       '/api/upload',                     // POST form-data:file -> {url}
  // 活动与报名（D）
  activities:   '/api/admin/activities',           // GET/POST/PUT/DELETE
  signups:      id => `/api/admin/activities/${id}/signups`,
  exportUrl:    id => `/api/admin/activities/${id}/signups/export`,   // CSV 流，信封例外
  // 用户与管理员（D）
  users:        '/api/admin/users',
  userStatus:   id => `/api/admin/users/${id}/status`,
  admins:       '/api/admin/admins',
  // 数据分析（D）—— 以服务端 51bc0d3 实际路由为准
  moduleHot:    '/api/admin/analytics/modules',     // 原 module-hot → modules
  trend:        '/api/admin/analytics/trend',
  funnel:       '/api/admin/analytics/funnel',
  interpret:    '/api/admin/analytics/interpret',   // 原 interpretation → interpret
  // 小程序端（A）参考：手机号授权 / 我的报名
  wxPhone:      '/api/auth/wechat/phone',          // POST { code } -> 绑定手机号
  mySignups:    '/api/users/me/signups'            // GET 我的报名
};

/* ---------- 会话存取：token、角色、会话版本一体管理 ----------
 * 会话版本（session version）用来区分「同秒重新登录」：D 给同一账号同一秒会签发
 * 完全相同的 JWT，仅比较 token 无法识别这是两次不同的登录。每次成功登录 / 退出
 * 都会递增版本；请求发出时记录当时的版本，401 时只有版本仍匹配才清理会话，
 * 这样迟到的旧请求 401 就不会误清新会话。
 */
const Token = {
  get()      { return localStorage.getItem(API_CONFIG.tokenKey) || ''; },
  set(t)     { localStorage.setItem(API_CONFIG.tokenKey, t); },
  clear()    { localStorage.removeItem(API_CONFIG.tokenKey); },
  getRole()  { return localStorage.getItem(API_CONFIG.roleKey) || ''; },
  setRole(r) { if (r) localStorage.setItem(API_CONFIG.roleKey, r); },
  // 会话版本：localStorage 存字符串，读取时转数字
  version()  { return Number(localStorage.getItem(API_CONFIG.sessionVersionKey) || 0); },
  bump()     { const v = this.version() + 1; localStorage.setItem(API_CONFIG.sessionVersionKey, String(v)); return v; },
  // 会话失效时 token 与角色一起清理，避免界面残留旧权限（不改变版本，版本由调用方按语义递增）
  clearAll() { localStorage.removeItem(API_CONFIG.tokenKey); localStorage.removeItem(API_CONFIG.roleKey); }
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
  // 才清理 token/角色；否则是旧会话请求的延迟 401，不能清掉用户后来重新登录的会话。
  if (res.status === 401) {
    if (sessionVersion === Token.version()) Token.clearAll();
    if (!silent) toast('登录已过期，请重新登录');
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
const Adapt = {
  banner:  b => ({ id: b.id, title: b.title, image: b.image || '', link: b.link || '', sort: b.sort, status: b.status === 1 ? '上架' : '下架' }),
  bike:    b => ({ id: b.id, name: b.name, price: b.price / 100, cc: b.cc, status: b.status === 1 ? '上架' : '下架' }),
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
    signupOpen: !!a.signupOpen
  }),
  // 状态为字符串枚举：active / disabled
  user: u => ({ id: u.id, name: u.nickname || u.name, phone: u.phone, status: u.status === 'active' ? '正常' : '禁用', rawStatus: u.status, disabledReason: u.disabledReason || '' }),
  admin: a => ({ id: a.id, name: a.username || a.name, role: a.role === 'super_admin' ? '超级管理员' : '运营管理员', rawRole: a.role, status: a.status === 'active' ? '启用' : '禁用', rawStatus: a.status })
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
    const data = await request(API.login, { method: 'POST', body: { username, password } });
    // 先递增会话版本，再写入新 token/角色：让此前发出的旧请求 401 无法清理这次新登录
    Token.bump();
    Token.set(data.token);
    // 角色读 data.admin.role（服务端返回 { token, tokenType, expiresIn, admin: {...} }）
    const role = data && data.admin && data.admin.role;
    if (role) Token.setRole(role);
    return data;   // { token, admin: { id, username, role, ... } }
  },

  // 退出登录：递增版本使在途请求失效，再清理 token/角色
  async logout() {
    Token.bump();
    Token.clearAll();
  },

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
    list:   q => request(API.bikes, { query: q, silent: true }),
    create: b => request(API.bikes, { method: 'POST', body: b }),
    update: (id, b) => request(API.bikes + '/' + id, { method: 'PUT', body: b }),
    remove: id => request(API.bikes + '/' + id, { method: 'DELETE' })
  },
  upload: async file => {
    const fd = new FormData();
    fd.append('file', file);
    return await request(API.upload, { method: 'POST', body: fd });   // -> { url }
  },

  activities: {
    list:    q => request(API.activities, { query: q, silent: true }),
    publish: b => request(API.activities, { method: 'POST', body: b }),
    update:  (id, b) => request(API.activities + '/' + id, { method: 'PUT', body: b }),
    offline: id => request(API.activities + '/' + id, { method: 'PUT', body: { status: 'offline' } }),
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
    // 状态为字符串枚举 active / disabled；禁用时必传 reason
    toggle: (id, status, reason) => {
      const body = { status };
      if (status === 'disabled') body.reason = reason;
      return request(API.userStatus(id), { method: 'PATCH', body });
    },
    admins: q => request(API.admins, { query: q, silent: true }),
    addAdmin: a => request(API.admins, { method: 'POST', body: a })
  },

  analytics: {
    // 日期区间统一用 { from, to }；不传则服务端默认近 14 天
    moduleHot: q => request(API.moduleHot, { query: q, silent: true }),
    trend:     q => request(API.trend, { query: q, silent: true }),
    funnel:    q => request(API.funnel, { query: q, silent: true }),
    // AI 解读返回 { insight }，这里读 data.insight
    interpret: async q => {
      const data = await request(API.interpret, { method: 'POST', body: q || {} });
      return data && data.insight;
    }
  }
};

/* ---------- 权限判断（角色来自登录时保存的 data.admin.role） ----------
 * 以 D 服务端 264b515 auth.js 为准：
 *   super_admin: 含 activity:export / analytics:read / analytics:interpret / admin:*
 *   operator:    仅 activity:export_masked / analytics:read / user:* / activity:*
 * 即含手机号 CSV 导出与 AI 解读均仅 super_admin 可用；operator 调解读接口返回 403。
 * 前端权限必须先要求存在有效会话，再判角色，避免未登录或清空会话后误判为有权限。
 */
const Perm = {
  hasSession: () => Boolean(Token.get()),
  role:   () => Token.getRole() || 'operator',
  setRole: r => Token.setRole(r),
  canExportPhone:  () => Perm.hasSession() && Perm.role() === 'super_admin',
  canManageAdmins: () => Perm.hasSession() && Perm.role() === 'super_admin',
  // AI 解读仅 super_admin 可用（operator 调接口会 403）
  canInterpret: () => Perm.hasSession() && Perm.role() === 'super_admin'
};

/* ---------- 图片 URL：后端存相对地址，展示时拼 baseURL ---------- */
function imgUrl(path) {
  if (!path) return '';
  return /^https?:\/\//.test(path) ? path : API_CONFIG.baseURL + path;
}
