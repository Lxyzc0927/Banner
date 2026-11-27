/* ============================================================
 * api.js · 管理后台统一接口层（组员 B / 杨乐曈）
 * 依据：C 的 API.md v1.2 定稿版（以 D 的实现为基线），2026-11-27
 *
 * 用法：
 *   1) 所有接口路径集中在 API 常量里，最终定值时只改这一处。
 *   2) request() 自动处理：拼 baseURL、带 token、拆信封、非 0 弹 toast、401 跳登录。
 *   3) 现在 USE_MOCK = true，页面继续用 data.js 的假数据演示；
 *      联调当天把 USE_MOCK 改成 false、填好 baseURL，再按速查把各页面 fetch 接上即可。
 * ============================================================ */

/* ---------- 全局配置：联调时只改这里 ---------- */
const API_CONFIG = {
  USE_MOCK: true,                                  // 联调时改为 false
  baseURL: 'http://127.0.0.1:3000',                // C 发局域网 IP 后替换；末尾不要带 /
  tokenKey: 'admin_token',                         // localStorage 中 token 的键名
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
  // 数据分析（D）
  moduleHot:    '/api/admin/analytics/module-hot',
  trend:        '/api/admin/analytics/trend',
  funnel:       '/api/admin/analytics/funnel',
  interpret:    '/api/admin/analytics/interpretation'
};

/* ---------- token 存取 ---------- */
const Token = {
  get()      { return localStorage.getItem(API_CONFIG.tokenKey) || ''; },
  set(t)     { localStorage.setItem(API_CONFIG.tokenKey, t); },
  clear()    { localStorage.removeItem(API_CONFIG.tokenKey); }
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

  // 名单导出是 CSV 文件流，不走信封
  if (responseType === 'blob') {
    if (!res.ok) { if (!silent) toast('导出失败：HTTP ' + res.status); throw new Error('HTTP ' + res.status); }
    return await res.blob();
  }

  let payload;
  try { payload = await res.json(); }
  catch (e) { if (!silent) toast('返回不是合法 JSON'); throw e; }

  if (res.status === 401) {
    Token.clear();
    if (!silent) toast('登录已过期，请重新登录');
    throw new Error('UNAUTHORIZED');
  }
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
 * 骨架字段 -> 定稿字段：name→title, date→start_at/end_at, admin/viewer→super_admin/operator
 */
const Adapt = {
  banner:  b => ({ id: b.id, title: b.title, image: b.image || '', link: b.link || '', sort: b.sort, status: b.status === 1 ? '上架' : '下架' }),
  bike:    b => ({ id: b.id, name: b.name, price: b.price / 100, cc: b.cc, status: b.status === 1 ? '上架' : '下架' }),
  price:   fen => fen / 100,
  yuanToFen: yuan => Math.round(Number(yuan) * 100),
  activity: a => ({
    id: a.id, name: a.title,
    date: a.start_at ? String(a.start_at).slice(0, 10) : '',
    signup: a.signup_count != null ? a.signup_count : (a.signups || 0),
    quota: a.quota,
    status: a.status === 'published' ? '进行中' : a.status === 'offline' ? '已下架' : '未开始',
    rawStatus: a.status,
    signupOpen: !!a.signupOpen
  }),
  user: u => ({ id: u.id, name: u.nickname || u.name, phone: u.phone, status: u.status === 1 ? '正常' : '禁用' }),
  admin: a => ({ id: a.id, name: a.username, role: a.role === 'super_admin' ? '超级管理员' : '运营', status: a.status === 1 ? '启用' : '禁用' })
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
    Token.set(data.token);
    return data;   // { token, role }
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
    exportCsv(id) {
      // CSV 是信封例外，直接用带 token 的地址触发下载
      const url = API_CONFIG.baseURL + API.exportUrl(id) + '?token=' + encodeURIComponent(Token.get());
      const a = document.createElement('a');
      a.href = url; a.download = '报名名单_' + id + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
    }
  },

  users: {
    list:   q => request(API.users, { query: q, silent: true }),
    toggle: (id, status) => request(API.userStatus(id), { method: 'PUT', body: { status } }),
    admins: q => request(API.admins, { query: q, silent: true }),
    addAdmin: a => request(API.admins, { method: 'POST', body: a })
  },

  analytics: {
    moduleHot: q => request(API.moduleHot, { query: q, silent: true }),
    trend:     q => request(API.trend, { query: q, silent: true }),
    funnel:    () => request(API.funnel, { silent: true }),
    interpret: q => request(API.interpret, { method: 'POST', body: q || {} })
  }
};

/* ---------- 权限判断（按 v1.2 权限矩阵） ---------- */
const Perm = {
  role: () => localStorage.getItem('admin_role') || 'operator',
  canExportPhone: () => Perm.role() === 'super_admin',
  canManageAdmins: () => Perm.role() === 'super_admin',
  canInterpret: () => Perm.role() === 'super_admin'   // 待 D 确认是否放开给 operator
};

/* ---------- 图片 URL：后端存相对地址，展示时拼 baseURL ---------- */
function imgUrl(path) {
  if (!path) return '';
  return /^https?:\/\//.test(path) ? path : API_CONFIG.baseURL + path;
}
