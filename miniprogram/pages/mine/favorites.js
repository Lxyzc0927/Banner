const api = require('../../api/index')
const auth = require('../../utils/auth')
const session = require('../../utils/session')
const list = require('../../utils/list')

Page({
  data: Object.assign(list.initialState(), { loggedIn: true }),

  // 详情页里可能取消收藏，返回时重新拉取；未登录时不请求，避免反复弹登录页
  onShow() {
    const loggedIn = session.isLoggedIn()
    this.setData({ loggedIn })
    if (loggedIn) this.refresh()
  },
  onPullDownRefresh() { (this.data.loggedIn ? this.refresh() : Promise.resolve()).then(() => wx.stopPullDownRefresh()) },
  onReachBottom() { if (this.data.loggedIn) list.load(this, p => api.getFavorites(p)) },

  refresh() { return list.load(this, p => api.getFavorites(p), { reset: true }) },
  onRetry() { this.refresh() },
  onLogin() { auth.requireLogin().catch(() => {}) },
  goBikes() { wx.switchTab({ url: '/pages/bike/list' }) }
})
