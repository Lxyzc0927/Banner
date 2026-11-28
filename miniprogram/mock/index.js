/*
 * 本地 mock 后端：按 method + path 路由，返回 { statusCode, data: { code, message, data } }，
 * 与真实 wx.request 结果同构，utils/request.js 无需区分。收藏、报名、手机号存在本地缓存里。
 * 登录、用户、活动、报名的路径、字段和错误码按 D 模块（origin/feature/lumenh26）实现；
 * 车型、首页、收藏、客服、埋点是前端自拟的 mock，等后端定稿后再对齐。
 */
const db = require('./data')
const chat = require('./chat')

// 字段结构改过，换新 key，避免读到旧版本缓存
const STORE_KEY = 'mock_store_v2'
const MOCK_TOKEN = 'mock-token'
const DELAY = 250

function loadStore() {
  const s = wx.getStorageSync(STORE_KEY)
  return s || { user: null, favorites: [], signups: [], seq: 1 }
}
function saveStore(s) { wx.setStorageSync(STORE_KEY, s) }

function ok(data, statusCode = 200, message = 'ok') { return { statusCode, data: { code: 0, message, data } } }
// 与后端一致：业务错误（1xxx）HTTP 200，参数 / 认证 / 不存在用对应 HTTP 状态码
function fail(code, message, statusCode, details) {
  const body = { code, message, data: null }
  if (details) body.details = details
  return { statusCode: statusCode || (code >= 1000 ? 200 : code), data: body }
}

// 分页参数与后端一致：page / pageSize
function paginate(list, q) {
  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 10))
  return { list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize }
}

// 价格参数：未传 / 空串表示不限；数字 0 是有效值，不能当成不限
function priceParam(v) {
  if (v === undefined || v === null || v === '') return null
  return Number(v) * 100
}

function onlineBikes() { return db.bikes.filter(b => b.status === '上架') }
function publishedActivities() { return db.activities.filter(a => a.status === 'published') }
function bikeBrief(b) { return { id: b.id, name: b.name, category: b.category, cc: b.cc, price: b.price, cover: b.cover, tags: b.tags } }

function publicUser(u) {
  return u && { id: u.id, nickname: u.nickname, avatarUrl: u.avatarUrl, phone: u.phone, status: 'active', createdAt: u.createdAt }
}

// 与后端 phaseOf / signupOpen 一致
function phaseOf(a, now) {
  if (now < Date.parse(a.startAt)) return 'upcoming'
  if (now <= Date.parse(a.endAt)) return 'ongoing'
  return 'ended'
}
function isSignupOpen(a, now) {
  return a.status === 'published' && now >= Date.parse(a.signupStartAt) &&
    now <= Date.parse(a.signupEndAt) && now <= Date.parse(a.endAt)
}
function mySignupOf(a, store) {
  return store.signups.find(s => s.activityId === a.id && s.status === 'confirmed') || null
}
function activityView(a, store, authed) {
  const now = Date.now()
  const confirmed = store.signups.filter(s => s.activityId === a.id && s.status === 'confirmed').length
  const signupCount = a.signupCount + confirmed
  return {
    id: a.id, title: a.title, subtitle: a.subtitle || null, cover: a.cover || null,
    description: a.description, location: a.location,
    startAt: a.startAt, endAt: a.endAt, signupStartAt: a.signupStartAt, signupEndAt: a.signupEndAt,
    quota: a.quota, status: a.status, phase: phaseOf(a, now), signupOpen: isSignupOpen(a, now),
    signupCount, remaining: Math.max(0, a.quota - signupCount),
    signedUp: !!(authed && mySignupOf(a, store))
  }
}
function signupView(s) {
  return { id: s.id, signupNo: s.signupNo, status: s.status, phone: s.phone, remark: s.remark, createdAt: s.createdAt }
}

const routes = [
  // 后端同时兼容旧路径 /api/auth/wx-login、/api/auth/phone、/api/signups/mine
  ['POST', /^\/api\/auth\/(wechat\/login|wx-login)$/, false, (q, p, s) => {
    if (!q.code) return fail(400, 'code 不能为空')
    const isNew = !s.user
    if (isNew) s.user = { id: 1, nickname: '骑士' + String(Date.now()).slice(-4), avatarUrl: null, phone: null, createdAt: new Date().toISOString() }
    return ok({ token: MOCK_TOKEN, tokenType: 'Bearer', isNew, phoneBound: !!s.user.phone, user: publicUser(s.user), mock: true })
  }],
  ['POST', /^\/api\/auth\/(wechat\/phone|phone)$/, true, (q, p, s) => {
    if (!q.code && !q.phone) return fail(400, '缺少手机号授权 code')
    const phone = '13800138000'
    const changed = s.user.phone !== phone
    s.user.phone = phone
    return ok({ user: publicUser(s.user), changed })
  }],
  ['GET', /^\/api\/users\/me$/, true, (q, p, s) => ok({ user: publicUser(s.user) })],

  ['GET', /^\/api\/home$/, false, () => ok({
    banners: db.banners.filter(b => b.status === '上架').sort((a, b) => a.sort - b.sort),
    news: db.news.filter(n => n.status === '上架'),
    hotBikes: onlineBikes().filter(b => b.hot).slice(0, 4).map(bikeBrief)
  })],

  ['GET', /^\/api\/bikes$/, false, q => {
    const kw = String(q.keyword || '').trim().toLowerCase()
    const min = priceParam(q.minPrice)
    const max = priceParam(q.maxPrice)
    if ((min != null && (!Number.isFinite(min) || min < 0)) || (max != null && (!Number.isFinite(max) || max < 0)) || (min != null && max != null && min > max)) {
      return fail(400, '价格区间不正确')
    }
    // tags 逗号分隔，车型须包含全部标签
    const tags = String(q.tags || '').split(',').map(t => t.trim()).filter(Boolean)
    const tierOk = b => !q.tier || (q.tier === 'entry' ? b.cc <= 250 : q.tier === 'mid' ? b.cc >= 300 && b.cc < 500 : q.tier === 'big' ? b.cc >= 500 : false)
    const list = onlineBikes().filter(b =>
      (!kw || b.name.toLowerCase().indexOf(kw) > -1 || b.category.toLowerCase().indexOf(kw) > -1) &&
      (!Number(q.cc) || b.cc === Number(q.cc)) &&
      (!q.category || b.category === q.category) &&
      tierOk(b) &&
      tags.every(t => b.tags.indexOf(t) > -1) &&
      (min == null || b.price >= min) &&
      (max == null || b.price <= max))
    // 价格相同时按 id，保证分页顺序稳定
    if (q.sort === 'price_asc') list.sort((a, b) => a.price - b.price || a.id - b.id)
    else if (q.sort === 'price_desc') list.sort((a, b) => b.price - a.price || a.id - b.id)
    return ok(paginate(list.map(bikeBrief), q))
  }],
  // 必须放在 /api/bikes/:id 之前
  ['GET', /^\/api\/bikes\/filters$/, false, () => {
    const bikes = onlineBikes()
    const uniq = arr => arr.filter((v, i) => arr.indexOf(v) === i)
    return ok({ categories: uniq(bikes.map(b => b.category)), tags: uniq([].concat.apply([], bikes.map(b => b.tags))) })
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

  // 与后端一致：默认不含已结束活动，includeEnded=true 时包含；进行中的排前面，其余按开始时间
  ['GET', /^\/api\/activities$/, false, (q, p, s, authed) => {
    const now = Date.now()
    const kw = String(q.keyword || '').trim()
    const includeEnded = q.includeEnded === true || q.includeEnded === 'true' || q.includeEnded === '1'
    const rank = a => (phaseOf(a, now) === 'ongoing' ? 0 : 1)
    const list = publishedActivities()
      .filter(a => includeEnded || now <= Date.parse(a.endAt))
      .filter(a => !kw || a.title.indexOf(kw) > -1 || a.location.indexOf(kw) > -1)
      .sort((a, b) => rank(a) - rank(b) || Date.parse(a.startAt) - Date.parse(b.startAt) || b.id - a.id)
      .map(a => activityView(a, s, authed))
    return ok(paginate(list, q))
  }],
  ['GET', /^\/api\/activities\/(\d+)$/, false, (q, p, s, authed) => {
    const a = publishedActivities().find(x => x.id === Number(p[1]))
    if (!a) return fail(404, '活动不存在或已下架')
    const mine = authed ? mySignupOf(a, s) : null
    return ok(Object.assign(activityView(a, s, authed), { mySignup: mine && signupView(mine) }))
  }],
  // 报名校验顺序与后端一致：存在 → 已发布 → 手机号 → 报名时间 → 防重 → 名额；成功返回 HTTP 201
  ['POST', /^\/api\/activities\/(\d+)\/signup$/, true, (q, p, s) => {
    const a = db.activities.find(x => x.id === Number(p[1]))
    if (!a) return fail(404, '活动不存在')
    if (a.status === 'draft') return fail(1005, '活动尚未发布')
    if (a.status !== 'published') return fail(1005, '活动已下架')
    if (!s.user.phone) return fail(1010, '请先授权手机号后再报名')
    const now = Date.now()
    if (now < Date.parse(a.signupStartAt)) return fail(1002, '报名尚未开始')
    if (now > Date.parse(a.signupEndAt)) return fail(1002, '报名已结束')
    if (now > Date.parse(a.endAt)) return fail(1002, '活动已结束')
    const existing = mySignupOf(a, s)
    if (existing) return fail(1004, '你已经报名过该活动', 200, { signupNo: existing.signupNo, createdAt: existing.createdAt })
    if (activityView(a, s, true).remaining <= 0) return fail(1003, '该活动名额已满')
    const remark = String(q.remark || '').trim()
    if (remark.length > 200) return fail(400, '备注不能超过 200 个字')
    const signup = {
      id: s.seq++, signupNo: `S${a.id}-${Date.now().toString(36).toUpperCase()}`, activityId: a.id,
      phone: s.user.phone, remark: remark || null, status: 'confirmed', createdAt: new Date().toISOString(), cancelledAt: null
    }
    s.signups.unshift(signup)
    const fresh = activityView(a, s, true)
    return ok({
      signup: signupView(signup),
      activity: { id: a.id, title: a.title, startAt: a.startAt, endAt: a.endAt, quota: a.quota, signedUp: fresh.signupCount, remaining: fresh.remaining }
    }, 201, '报名成功')
  }],
  ['DELETE', /^\/api\/activities\/(\d+)\/signup$/, true, (q, p, s) => {
    const activity = db.activities.find(item => item.id === Number(p[1]))
    if (!activity) return fail(404, '活动不存在')
    if (Date.now() > Date.parse(activity.endAt)) return fail(1002, '活动已结束，无法取消报名')
    const signup = mySignupOf(activity, s)
    if (!signup) return fail(404, '未找到有效报名记录')
    signup.status = 'cancelled'
    signup.cancelledAt = new Date().toISOString()
    const fresh = activityView(activity, s, true)
    return ok({
      signup: { id: signup.id, signupNo: signup.signupNo, status: signup.status, cancelledAt: signup.cancelledAt },
      activity: { id: activity.id, quota: activity.quota, signedUp: fresh.signupCount, remaining: fresh.remaining }
    })
  }],
  ['GET', /^\/api\/(users\/me\/signups|signups\/mine)$/, true, (q, p, s) => {
    const list = s.signups.map(x => {
      const a = db.activities.find(act => act.id === x.activityId)
      return Object.assign(signupView(x), {
        cancelledAt: x.cancelledAt || null,
        activity: { id: a.id, title: a.title, cover: a.cover || null, location: a.location, startAt: a.startAt, endAt: a.endAt, status: a.status }
      })
    })
    return ok(paginate(list, q))
  }],

  ['POST', /^\/api\/chat$/, false, (q, p, s) => {
    const messages = Array.isArray(q.messages) ? q.messages : []
    if (!messages.length) return fail(400, '消息不能为空')
    return ok(chat.reply(messages, onlineBikes(), publishedActivities().map(a => activityView(a, s, false))))
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
      if (!route) res = fail(404, `接口不存在: ${method} ${path}`)
      else if (route[2] && (!authed || !store.user)) res = fail(401, '请先登录')
      else res = route[3](data || {}, path.match(route[1]), store, authed)
      if (method !== 'GET') saveStore(store)
      // 深拷贝，避免页面修改返回值时污染 mock 数据
      resolve(JSON.parse(JSON.stringify(res)))
    }, DELAY)
  })
}

module.exports = { handle }
