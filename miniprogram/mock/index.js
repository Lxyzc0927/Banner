/*
 * 本地 mock 后端：按 method + path 路由，返回 { statusCode, data: { code, msg, data } }，
 * 与真实 wx.request 结果同构，utils/request.js 无需区分。收藏、报名、手机号存在本地缓存里。
 */
const db = require('./data')
const chat = require('./chat')

const STORE_KEY = 'mock_store'
const MOCK_TOKEN = 'mock-token'
const DELAY = 250

function loadStore() {
  const s = wx.getStorageSync(STORE_KEY)
  return s || { user: null, favorites: [], signups: [], seq: 1 }
}
function saveStore(s) { wx.setStorageSync(STORE_KEY, s) }

function ok(data) { return { statusCode: 200, data: { code: 0, msg: 'ok', data } } }
function fail(code, msg, statusCode = 200) { return { statusCode, data: { code, msg, data: null } } }

function paginate(list, q) {
  const pageNo = Math.max(1, Number(q.pageNo) || 1)
  const pageSize = Math.max(1, Number(q.pageSize) || 10)
  return { list: list.slice((pageNo - 1) * pageSize, pageNo * pageSize), total: list.length, pageNo, pageSize }
}

function onlineBikes() { return db.bikes.filter(b => b.status === '上架') }
function publishedActivities() { return db.activities.filter(a => a.status !== '未开始') }
function bikeBrief(b) { return { id: b.id, name: b.name, category: b.category, cc: b.cc, price: b.price, cover: b.cover, tags: b.tags } }

function activityView(a, store) {
  const mine = store.signups.filter(s => s.activityId === a.id)
  const signup = a.signup + mine.length
  return Object.assign({}, a, { signup, full: signup >= a.quota, signed: mine.length > 0 })
}

const routes = [
  ['POST', /^\/api\/auth\/wx-login$/, false, (q, p, s) => {
    if (!s.user) s.user = { id: 1, nickname: '骑士' + String(Date.now()).slice(-4), avatar: '', phone: '' }
    return ok({ token: MOCK_TOKEN, user: s.user })
  }],
  ['POST', /^\/api\/auth\/phone$/, true, (q, p, s) => {
    if (!q.code) return fail(400, '缺少授权 code')
    s.user.phone = '138****8888'
    return ok({ phone: s.user.phone })
  }],
  ['GET', /^\/api\/user\/me$/, true, (q, p, s) => ok(s.user)],

  ['GET', /^\/api\/home$/, false, () => ok({
    banners: db.banners.filter(b => b.status === '上架').sort((a, b) => a.sort - b.sort),
    news: db.news.filter(n => n.status === '上架'),
    hotBikes: onlineBikes().filter(b => b.hot).slice(0, 4).map(bikeBrief)
  })],

  ['GET', /^\/api\/bikes$/, false, q => {
    const kw = String(q.keyword || '').trim().toLowerCase()
    const list = onlineBikes().filter(b =>
      (!kw || b.name.toLowerCase().indexOf(kw) > -1 || b.category.toLowerCase().indexOf(kw) > -1) &&
      (!q.cc || b.cc === Number(q.cc)))
    return ok(paginate(list.map(bikeBrief), q))
  }],
  ['GET', /^\/api\/bikes\/(\d+)$/, false, (q, p, s, authed) => {
    const b = onlineBikes().find(x => x.id === Number(p[1]))
    if (!b) return fail(404, '车型不存在或已下架')
    return ok(Object.assign({}, b, { favorited: authed && s.favorites.indexOf(b.id) > -1 }))
  }],
  // 收藏接口幂等：重复收藏 / 重复取消都返回成功
  ['POST', /^\/api\/bikes\/(\d+)\/favorite$/, true, (q, p, s) => {
    const id = Number(p[1])
    if (!onlineBikes().some(b => b.id === id)) return fail(404, '车型不存在或已下架')
    if (s.favorites.indexOf(id) === -1) s.favorites.unshift(id)
    return ok({ favorited: true })
  }],
  ['DELETE', /^\/api\/bikes\/(\d+)\/favorite$/, true, (q, p, s) => {
    s.favorites = s.favorites.filter(id => id !== Number(p[1]))
    return ok({ favorited: false })
  }],
  ['GET', /^\/api\/favorites$/, true, (q, p, s) => {
    const list = s.favorites.map(id => onlineBikes().find(b => b.id === id)).filter(Boolean).map(bikeBrief)
    return ok(paginate(list, q))
  }],

  ['GET', /^\/api\/activities$/, false, (q, p, s) => {
    const list = publishedActivities()
      .filter(a => !q.status || a.status === q.status)
      .sort((a, b) => (a.status === b.status ? a.date.localeCompare(b.date) : a.status === '进行中' ? -1 : 1))
      .map(a => activityView(a, s))
    return ok(paginate(list, q))
  }],
  ['GET', /^\/api\/activities\/(\d+)$/, false, (q, p, s, authed) => {
    const a = publishedActivities().find(x => x.id === Number(p[1]))
    if (!a) return fail(404, '活动不存在或已下架')
    const view = activityView(a, s)
    if (!authed) view.signed = false
    return ok(view)
  }],
  // 报名校验顺序：活动存在 → 已结束 → 手机号 → 防重 → 名额
  ['POST', /^\/api\/activities\/(\d+)\/signup$/, true, (q, p, s) => {
    const a = publishedActivities().find(x => x.id === Number(p[1]))
    if (!a) return fail(404, '活动不存在或已下架')
    const view = activityView(a, s)
    if (a.status === '已结束') return fail(4003, '活动已结束')
    if (!s.user.phone) return fail(4004, '请先授权手机号')
    if (view.signed) return fail(4001, '您已报名该活动')
    if (view.full) return fail(4002, '名额已满')
    const name = String(q.name || '').trim()
    if (name.length < 2 || name.length > 20) return fail(400, '姓名需为 2–20 个字')
    s.signups.unshift({ id: s.seq++, activityId: a.id, name, phone: s.user.phone, createdAt: new Date().toISOString() })
    return ok({ signupId: s.seq - 1 })
  }],
  ['GET', /^\/api\/signups\/mine$/, true, (q, p, s) => {
    const list = s.signups.map(x => {
      const a = db.activities.find(act => act.id === x.activityId)
      return { id: x.id, activityId: x.activityId, name: x.name, phone: x.phone, createdAt: x.createdAt, title: a.title, date: a.date, place: a.place, status: a.status }
    })
    return ok(paginate(list, q))
  }],

  ['POST', /^\/api\/chat$/, false, q => {
    const messages = Array.isArray(q.messages) ? q.messages : []
    if (!messages.length) return fail(400, '消息不能为空')
    return ok(chat.reply(messages, onlineBikes(), publishedActivities()))
  }],
  ['POST', /^\/api\/track$/, false, () => ok(null)]
]

function handle(method, url, data, token) {
  const path = url.split('?')[0]
  const authed = token === MOCK_TOKEN
  return new Promise(resolve => {
    setTimeout(() => {
      const store = loadStore()
      const route = routes.find(r => r[0] === method && r[1].test(path))
      let res
      if (!route) res = fail(404, `接口不存在：${method} ${path}`, 404)
      else if (route[2] && (!authed || !store.user)) res = fail(401, '请先登录', 401)
      else res = route[3](data || {}, path.match(route[1]), store, authed)
      if (method !== 'GET') saveStore(store)
      // 深拷贝，避免页面修改返回值时污染 mock 数据
      resolve(JSON.parse(JSON.stringify(res)))
    }, DELAY)
  })
}

module.exports = { handle }
