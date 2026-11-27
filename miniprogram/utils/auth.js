/* 登录、登录拦截、手机号授权 */
const api = require('../api/index')
const session = require('./session')
const config = require('../config')

function toast(msg) { wx.showToast({ title: msg, icon: 'none' }) }

function getLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: res => (res.code ? resolve(res.code) : reject({ msg: '微信登录失败' })),
      fail: () => reject({ msg: '微信登录失败' })
    })
  })
}

// wx.login 取 code → 后端换 token
function login() {
  return getLoginCode()
    .catch(err => { toast(err.msg); throw err })
    .then(code => api.wxLogin(code))
    .then(res => {
      session.save(res.token, res.user)
      return res.user
    })
}

// 登录拦截：已登录直接继续，未登录先跳登录页，登录成功后 resolve，用户返回则 reject
function requireLogin() {
  if (session.isLoggedIn()) return Promise.resolve(session.getUser())
  return session.goLogin().then(() => session.getUser())
}

// 处理 <button open-type="getPhoneNumber"> 的回调，detail.code 交给后端换手机号
function bindPhone(detail) {
  let code = detail && detail.code
  const errMsg = (detail && detail.errMsg) || ''
  if (!code) {
    if (/deny|cancel/.test(errMsg)) {
      toast('已取消手机号授权')
      return Promise.reject({ code: 'DENY' })
    }
    // 游客 AppID / 个人主体无法获取手机号，mock 模式下模拟成功便于联调界面
    if (!config.USE_MOCK) {
      toast('获取手机号失败')
      return Promise.reject({ code: 'FAIL', errMsg })
    }
    code = 'mock-phone-code'
  }
  return api.bindPhone(code).then(res => {
    const user = Object.assign({}, session.getUser(), { phone: res.phone })
    session.setUser(user)
    return user
  })
}

function logout() { session.clear() }

module.exports = { login, requireLogin, bindPhone, logout }
