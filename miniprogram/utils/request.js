/*
 * 统一请求：拼接 BASE_URL、携带 token、解析 { code, msg, data }、统一错误提示、401 跳登录。
 * 约定：所有错误在这里 toast，页面只需 .catch(() => {}) 处理界面状态。
 *   loading: true | '提示文字'  显示加载遮罩
 *   silent:  true               不弹错误提示，401 时只清登录态不跳转
 */
const config = require('../config')
const session = require('./session')
const mock = require('../mock/index')

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
      fail: () => reject({ code: -1, msg: '网络异常，请检查网络后重试' })
    })
  })
}

function parse(res, opts) {
  const body = res.data || {}
  if (res.statusCode === 401 || body.code === 401) {
    session.clear()
    if (!opts.silent) session.goLogin().catch(() => {})
    throw { code: 401, msg: body.msg || '请先登录' }
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw { code: res.statusCode, msg: body.msg || `服务异常（${res.statusCode}）` }
  }
  if (body.code !== config.SUCCESS_CODE) throw { code: body.code, msg: body.msg || '操作失败' }
  return body.data
}

function request(options) {
  const opts = Object.assign({ method: 'GET', data: {}, loading: false, silent: false }, options)
  if (opts.method === 'GET') opts.data = cleanParams(opts.data)
  if (opts.loading) wx.showLoading({ title: typeof opts.loading === 'string' ? opts.loading : '加载中', mask: true })

  return send(opts)
    .then(res => parse(res, opts))
    .then(data => {
      if (opts.loading) wx.hideLoading()
      return data
    }, err => {
      // 先关 loading 再 toast，二者共用同一个提示层
      if (opts.loading) wx.hideLoading()
      if (!opts.silent && err.code !== 401) wx.showToast({ title: err.msg || '请求失败', icon: 'none' })
      throw err
    })
}

module.exports = request
