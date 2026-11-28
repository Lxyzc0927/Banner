/* ============================================================
 * bridge.js · 演示 / 真实接口双模式桥接（组员 B / 杨乐曈）
 * ------------------------------------------------------------
 * 目的：让同一份后台页面，既不改代码就能本地演示，也能在联调当天
 *       只靠 URL 参数切到真实后端，不必临时改 api.js 的常量。
 *
 * 用法（联调当天）：
 *   浏览器打开  admin/index.html?base=http://<C的IP>:3000
 *   - 带 base 参数即自动进入真实模式，并把地址记到 localStorage，
 *     之后不带参数打开也沿用；演示模式用 ?real=0 关闭。
 *   - 真实模式首次打开会弹登录框，输入 D 的演示账号即可。
 *
 * 演示模式：所有 mutate() 直接返回 true，写操作仍走 app.js 的本地 DB，
 *           原有校验/分页/空状态/竞态防护逻辑不变。
 * 真实模式：加载时把后端数据适配后写回 DB（app.js 渲染逻辑不用改），
 *           写操作先调 Api，成功后才让 app.js 改本地状态。
 *
 * 设计取舍：C 的模块（Banner/车型/上传）若后端未就绪会加载失败，
 *           这里逐个 try/catch 兜底、保留演示数据，绝不阻塞 D 的模块联调。
 * ============================================================ */
const Bridge = (function () {
  const REAL_KEY = 'admin_real_mode';
  const BASE_KEY = 'admin_base_url';

  function tip(msg) {
    if (typeof toast === 'function') toast(msg);
    else console.log('[Bridge]', msg);
  }

  function isReal() {
    try {
      const p = new URLSearchParams(location.search);
      if (p.has('real')) return p.get('real') !== '0';
      return localStorage.getItem(REAL_KEY) === '1';
    } catch (e) { return false; }
  }

  // 把 URL / localStorage 里的开关与地址应用到 api.js 的配置（API_CONFIG 是对象，属性可改）
  function applyConfig() {
    try {
      const p = new URLSearchParams(location.search);
      const base = p.get('base') || localStorage.getItem(BASE_KEY);
      if (base) {
        API_CONFIG.baseURL = String(base).replace(/\/+$/, '');
        localStorage.setItem(BASE_KEY, API_CONFIG.baseURL);
      }
      // 传了 base 就视为要联调，自动打开真实模式（省得再记一个参数）
      if (p.has('base')) localStorage.setItem(REAL_KEY, '1');
      if (p.has('real')) localStorage.setItem(REAL_KEY, p.get('real') === '0' ? '0' : '1');
    } catch (e) { /* 非浏览器环境忽略 */ }
    API_CONFIG.USE_MOCK = !isReal();
  }

  function setReal(on, base) {
    try {
      localStorage.setItem(REAL_KEY, on ? '1' : '0');
      if (base) {
        API_CONFIG.baseURL = String(base).replace(/\/+$/, '');
        localStorage.setItem(BASE_KEY, API_CONFIG.baseURL);
      }
    } catch (e) {}
    API_CONFIG.USE_MOCK = !on;
  }

  /* ---------- 把后端列表适配成 app.js 既有的 demo 行结构，写回 DB ---------- */
  async function load(page) {
    if (!isReal()) return;
    const jobs = [];
    if (page === 'home') {
      jobs.push(
        Api.banners.list({ page: 1, pageSize: 200 }).then(d => {
          DB.banners = (d.list || []).map(Adapt.banner);
        }),
        Api.news.list({ page: 1, pageSize: 200 }).then(d => {
          DB.news = (d.list || []).map(n => ({
            id: n.id, title: n.title, status: n.status === 1 ? '上架' : '下架', date: n.date || ''
          }));
        }).catch(() => {})   // 资讯非主链路，失败不影响
      );
    } else if (page === 'bike') {
      jobs.push(Api.bikes.list({ page: 1, pageSize: 500 }).then(d => {
        DB.bikes = (d.list || []).map(Adapt.bike);
      }));
    } else if (page === 'activity') {
      jobs.push(Api.activities.list({ page: 1, pageSize: 200 }).then(d => {
        DB.activities = (d.list || []).map(Adapt.activity);
      }));
    } else if (page === 'user') {
      jobs.push(
        Api.users.list({ page: 1, pageSize: 500 }).then(d => {
          DB.users = (d.list || []).map(Adapt.user);
        }),
        Api.users.admins({ page: 1, pageSize: 200 }).then(d => {
          DB.admins = (d.list || []).map(Adapt.admin);
        }).catch(() => {})   // 管理员列表失败保留演示值
      );
    } else if (page === 'analysis') {
      jobs.push(
        Api.analytics.moduleHot({}).then(d => {
          DB.analysis.heat = (d.list || []).map(x => ({ name: x.moduleLabel || x.module, value: x.pv || 0 }));
        }),
        Api.analytics.trend({}).then(d => {
          DB.analysis.trend = (d.list || []).map(x => x.pv);
        }),
        Api.analytics.funnel({}).then(d => {
          DB.analysis.funnel = (d.steps || []).map(x => ({ name: x.label, value: x.sessions }));
        })
      );
    }
    // 每页独立兜底：某个模块失败只提示一次，其他模块照常加载
    const results = await Promise.allSettled(jobs);
    if (results.some(r => r.status === 'rejected')) {
      tip('部分数据加载失败，仍显示演示数据；请确认后端地址与登录态');
    }
  }

  async function loadAll() {
    for (const p of ['home', 'bike', 'activity', 'user', 'analysis']) {
      await load(p);
    }
  }

  /* ---------- 写操作：真实模式调 Api，演示模式直接放行 ----------
   * 返回 true 表示 app.js 可以继续改本地 DB；false 表示失败、调用方应中止。
   */
  async function mutate(action, payload) {
    if (!isReal()) return true;
    try {
      switch (action) {
        case 'banner.toggle':
          await Api.banners.update(payload.id, { status: payload.status === '上架' ? 1 : 0 });
          break;
        case 'banner.save': {
          const body = { title: payload.title, sort: payload.sort };
          const m = /^\/(bike|activity)\/(\d+)$/.exec(payload.link || '');
          body.linkType = m ? m[1] : '';
          body.linkUrl = m ? m[2] : '';
          // 图片：演示态的 dataURL 不回传；联调期如需上传，后续接 Api.upload
          if (payload.editId) await Api.banners.update(payload.editId, body);
          else await Api.banners.create(body);
          break;
        }
        case 'banner.delete':
          await Api.banners.remove(payload.id);
          break;
        case 'bike.save': {
          const body = {
            name: payload.name, cc: payload.cc,
            price: Adapt.yuanToFen(payload.price)   // 表单元 -> 接口分
          };
          if (payload.editId) await Api.bikes.update(payload.editId, body);
          else await Api.bikes.create(body);
          break;
        }
        case 'bike.delete':
          await Api.bikes.remove(payload.id);
          break;
        case 'activity.toggle':
          if (payload.op === 'publish') await Api.activities.publish(payload.id);
          else await Api.activities.offline(payload.id);
          break;
        case 'user.toggle':
          await Api.users.toggle(payload.id, payload.status, payload.reason);
          break;
        case 'export':
          await Api.signups.exportCsv(payload.id, payload.query);
          return false;   // 导出已由 Api 触发下载，app.js 不要再走演示 toast
        default:
          return true;
      }
      return true;
    } catch (e) {
      tip('操作失败：' + (e && e.message ? e.message : '请稍后重试'));
      return false;
    }
  }

  /* ---------- 登录弹窗：真实模式首次打开时使用 ---------- */
  function showLogin() {
    return new Promise(resolve => {
      const root = document.getElementById('modal-root');
      if (!root) { resolve(false); return; }
      root.innerHTML = '<div class="mask"><div class="modal"><h3>后台登录（联调）</h3>' +
        '<div class="form-row"><label>账号</label><input id="login-user" placeholder="superadmin"></div>' +
        '<div class="form-row"><label>密码</label><input id="login-pass" type="password" placeholder="Admin@123456"></div>' +
        '<div class="modal-actions"><button onclick="Bridge.closeLogin(false)">取消</button>' +
        '<button class="primary" onclick="Bridge.doLogin()">登录</button></div></div></div>';
      Bridge._resolveLogin = resolve;
    });
  }
  function closeLogin(ok) {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
    const r = Bridge._resolveLogin;
    Bridge._resolveLogin = null;
    if (r) r(!!ok);
  }
  async function doLogin() {
    const u = document.getElementById('login-user');
    const p = document.getElementById('login-pass');
    if (!u || !p || !u.value.trim() || !p.value) { tip('请输入账号和密码'); return; }
    try {
      await Api.login(u.value.trim(), p.value);
      closeLogin(true);
    } catch (e) {
      tip('登录失败：' + (e && e.message ? e.message : '账号或密码错误'));
    }
  }
  async function logout() {
    await Api.logout();
    tip('已退出登录');
  }

  return {
    isReal, applyConfig, setReal, load, loadAll, mutate,
    showLogin, closeLogin, doLogin, logout,
    get baseURL() { return API_CONFIG.baseURL; }
  };
})();
