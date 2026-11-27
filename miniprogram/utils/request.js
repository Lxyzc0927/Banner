/*
 * 统一请求：拼接 BASE_URL、携带 token、解析 { code, message, data }、统一错误提示、401 跳登录。
 * 约定：所有错误在这里 toast，页面只需 .catch(() => {}) 处理界面状态。
 *   loading: true | '提示文字'  显示加载遮罩
 *   silent:  true               不弹错误提示，401 时只清登录态不跳转
 * 失败时 reject { code, message, status, details }：
 *   code 保留后端业务码（如 1003 名额已满），没有业务码时才用 HTTP 状态码；网络失败为 -1。
 */
const config = require('../config')
const session = require('./session')
const mock = require('../mock/index')

// 账号被管理员禁用（后端 1008）：登录态作废
const USER_DISABLED = 1008

function cleanParams(data) {
  const out = {}
  Object.keys(data || {}).forEach(k => {
    const v = data[k]
    if (v !== undefined && v !== null && v !== '') out[k] = v
  })
  return out
}

function send({ url, method, data, timeout }) {
  const token = session.getToken()
  if (config.USE_MOCK) return mock.handle(method, url, data, token)
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.BASE_URL + url,
      method,
      data,
      timeout: timeout || config.TIMEOUT,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: res => resolve({ statusCode: res.statusCode, data: res.data }),
      fail: () => reject({ code: -1, message: '网络异常，请检查网络后重试' })
    })
  })
}

// 后端信封用 message；智能客服等接口尚未定稿，暂兼容 msg
function messageOf(body) { return body.message || body.msg || '' }

function fail(res, body, fallback) {
  return {
    code: typeof body.code === 'number' ? body.code : res.statusCode,
    message: messageOf(body) || fallback,
    status: res.statusCode,
    details: body.details || null
  }
}

function parse(res, opts, revision) {
  const body = (res.data && typeof res.data === 'object') ? res.data : {}
  // 旧会话的鉴权失败不能清除当前登录态。
  const currentSession = revision === session.getRevision()
  if (res.statusCode === 401 || body.code === 401) {
    if (currentSession) {
      session.clear()
      if (!opts.silent) session.goLogin().catch(() => {})
    }
    throw fail(res, body, '请先登录')
  }
  if (body.code === USER_DISABLED && currentSession) session.clear()
  if (res.statusCode < 200 || res.statusCode >= 300) throw fail(res, body, `服务异常（${res.statusCode}）`)
  if (body.code !== config.SUCCESS_CODE) throw fail(res, body, '操作失败')
  return body.data
}

function request(options) {
  const opts = Object.assign({ method: 'GET', data: {}, loading: false, silent: false }, options)
  if (opts.method === 'GET') opts.data = cleanParams(opts.data)
  if (opts.loading) wx.showLoading({ title: typeof opts.loading === 'string' ? opts.loading : '加载中', mask: true })

  const revision = session.getRevision()
  return send(opts)
    .then(res => parse(res, opts, revision))
    .then(data => {
      if (opts.loading) wx.hideLoading()
      return data
    }, err => {
      // 先关 loading 再 toast，二者共用同一个提示层
      if (opts.loading) wx.hideLoading()
      if (!opts.silent && err.code !== 401) wx.showToast({ title: err.message || '请求失败', icon: 'none' })
      throw err
    })
}

module.exports = request
