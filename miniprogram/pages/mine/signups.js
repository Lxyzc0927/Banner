const format = require('../../utils/format')
const api = require('../../api/index')
const auth = require('../../utils/auth')
const session = require('../../utils/session')
const list = require('../../utils/list')

// 后端返回 { id, signupNo, status: confirmed | cancelled, phone, remark, createdAt, activity: { id, title, location, startAt, endAt } }
function decorate(s) {
  const a = s.activity || {}
  const cancelled = s.status === 'cancelled'
  const ended = !cancelled && a.endAt && Date.now() > Date.parse(a.endAt)
  return Object.assign({}, s, format.dateParts(a.startAt), {
    title: a.title,
    location: a.location,
    activityId: a.id,
    createdText: format.dateTime(s.createdAt),
    // 已取消、已结束都灰掉；待参加为黄牌
    dim: cancelled || ended,
    stateText: cancelled ? '已取消' : ended ? '已结束' : '待参加',
    stateClass: cancelled || ended ? 'state-ended' : 'state-signed'
  })
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
  // 首屏失败时 list.load 会自动从第一页重来

  refresh() { return list.load(this, p => api.getMySignups(p), { reset: true, map: decorate }) },
  onRetry() { this.onReachBottom() },
  onLogin() { auth.requireLogin().catch(() => {}) },
  open(e) { wx.navigateTo({ url: `/pages/activity/detail?id=${e.currentTarget.dataset.id}` }) },
  goActivities() { wx.switchTab({ url: '/pages/activity/list' }) }
})
