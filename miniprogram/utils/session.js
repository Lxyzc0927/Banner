/* 登录态：token / 用户信息的读写，以及"跳登录页 → 登录完成后继续原操作"的等待队列 */
const TOKEN_KEY = 'token'
const USER_KEY = 'user'
const LOGIN_PAGE = 'pages/login/index'

let waiters = []
let revision = 0

function getToken() { return wx.getStorageSync(TOKEN_KEY) || '' }
function getUser() { return wx.getStorageSync(USER_KEY) || null }
function isLoggedIn() { return !!getToken() }
function getRevision() { return revision }

function save(token, user) {
  wx.setStorageSync(TOKEN_KEY, token)
  wx.setStorageSync(USER_KEY, user)
  revision += 1
}
function setUser(user) { wx.setStorageSync(USER_KEY, user) }
function clear() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(USER_KEY)
  revision += 1
}

// 登录页关闭时调用：登录成功则继续等待中的操作，否则全部取消
function settle(ok) {
  const list = waiters
  waiters = []
  list.forEach(w => (ok ? w.resolve() : w.reject({ code: 'LOGIN_CANCEL', msg: '未登录' })))
}

// 打开登录页并返回 Promise，多处同时触发只打开一次
function goLogin() {
  return new Promise((resolve, reject) => {
    waiters.push({ resolve, reject })
    if (waiters.length > 1) return
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    if (current && current.route === LOGIN_PAGE) return
    wx.navigateTo({ url: '/' + LOGIN_PAGE, fail: () => settle(false) })
  })
}

module.exports = { getToken, getUser, isLoggedIn, getRevision, save, setUser, clear, settle, goLogin }
