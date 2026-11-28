const format = require('../../utils/format')
const api = require('../../api/index')
const auth = require('../../utils/auth')
const session = require('../../utils/session')
const list = require('../../utils/list')

// 后端返回 { id, signupNo, status: confirmed | cancelled, phone, remark, createdAt, activity: { id, title, location, startAt, endAt, status } }
function decorate(s) {
  const a = s.activity || {}
  const cancelled = s.status === 'cancelled'
  const endTime = Date.parse(a.endAt)
  const ended = !cancelled && Date.now() > endTime
  return Object.assign({}, s, format.dateParts(a.startAt), {
    title: a.title,
    location: a.location,
    activityId: a.id,
    activityUnavailable: a.status === 'offline' || a.status === 'draft',
    canCancel: s.status === 'confirmed' && Boolean(a.id) && Number.isFinite(endTime) && !ended,
    createdText: format.dateTime(s.createdAt),
    // 已取消、已结束都灰掉；待参加为黄牌
    dim: cancelled || ended,
    stateText: cancelled ? '已取消' : ended ? '已结束' : '待参加',
    stateClass: cancelled || ended ? 'state-ended' : 'state-signed'
  })
}

Page({
  data: Object.assign(list.initialState(), { loggedIn: true, cancellingId: null }),

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
  async cancelSignup(e) {
    const id = Number(e.currentTarget.dataset.id)
    const signup = this.data.list.find(item => item.id === id)
    if (this.data.cancellingId !== null || !signup || !decorate(signup).canCancel) return

    this.setData({ cancellingId: id })
    try {
      const confirmed = await new Promise(resolve => wx.showModal({
        title: '取消报名',
        content: '确定取消本次活动报名吗？取消后将释放名额。',
        confirmText: '取消报名',
        cancelText: '保留报名',
        success: result => resolve(result.confirm),
        fail: () => resolve(false)
      }))
      if (!confirmed) return
      await api.cancelSignup(signup.activityId)
      wx.showToast({ title: '报名已取消', icon: 'success' })
      await this.refresh()
    } catch (error) {
      if (error.code === 404 || error.code === 1002) await this.refresh()
    } finally {
      this.setData({ cancellingId: null })
    }
  },
  onLogin() { auth.requireLogin().catch(() => {}) },
  open(e) {
    const signup = this.data.list.find(item => item.id === Number(e.currentTarget.dataset.id))
    if (!signup?.activityId || signup.activityUnavailable) return
    wx.navigateTo({ url: `/pages/activity/detail?id=${signup.activityId}` })
  },
  goActivities() { wx.switchTab({ url: '/pages/activity/list' }) }
})
