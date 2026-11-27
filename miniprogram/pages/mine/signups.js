const format = require('../../utils/format')
const api = require('../../api/index')
const auth = require('../../utils/auth')
const session = require('../../utils/session')
const list = require('../../utils/list')

function decorate(s) {
  return Object.assign({}, s, { createdText: s.createdAt.slice(0, 16).replace('T', ' ') }, format.dateParts(s.date))
}

Page({
  data: Object.assign(list.initialState(), { loggedIn: true }),

  onShow() {
    const loggedIn = session.isLoggedIn()
    this.setData({ loggedIn })
    if (loggedIn) this.refresh()
  },
  onPullDownRefresh() { (this.data.loggedIn ? this.refresh() : Promise.resolve()).then(() => wx.stopPullDownRefresh()) },
  onReachBottom() { if (this.data.loggedIn) list.load(this, p => api.getMySignups(p), { map: decorate }) },

  refresh() { return list.load(this, p => api.getMySignups(p), { reset: true, map: decorate }) },
  onRetry() { this.refresh() },
  onLogin() { auth.requireLogin().catch(() => {}) },
  open(e) { wx.navigateTo({ url: `/pages/activity/detail?id=${e.currentTarget.dataset.id}` }) },
  goActivities() { wx.switchTab({ url: '/pages/activity/list' }) }
})
