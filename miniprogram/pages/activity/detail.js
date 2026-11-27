const api = require('../../api/index')
const auth = require('../../utils/auth')
const session = require('../../utils/session')
const format = require('../../utils/format')
const track = require('../../utils/track')

// 报名接口业务错误码（与后端约定）：需要刷新详情以展示最新状态
const REFRESH_CODES = [4001, 4002, 4003]

function buttonOf(a) {
  if (a.status === '已结束') return { text: '活动已结束', disabled: true }
  if (a.signed) return { text: '已报名，期待您的到来', disabled: true }
  if (a.full) return { text: '名额已满', disabled: true }
  return { text: '立即报名', disabled: false }
}

Page({
  data: {
    activity: null,
    percent: 0,
    button: { text: '', disabled: true },
    error: '',
    sheet: false,
    form: { name: '' },
    user: null,
    submitting: false
  },

  onLoad(query) {
    this.id = Number(query.id)
    this.load().catch(() => {})
    track('view', { module: 'activity_detail', activityId: this.id })
  },

  load() {
    return api.getActivity(this.id).then(activity => {
      this.setData({ activity, percent: format.percent(activity.signup, activity.quota), button: buttonOf(activity), error: '' })
      return activity
    }, err => {
      this.setData({ error: err.msg || '加载失败' })
      throw err
    })
  },

  onSignup() {
    if (this.data.button.disabled) return
    track('signup_click', { activityId: this.id })
    const wasLoggedIn = session.isLoggedIn()
    auth.requireLogin()
      // 刚登录需要重新拉详情，判断是否已经报过名
      .then(() => (wasLoggedIn ? this.data.activity : this.load()))
      .then(activity => {
        if (buttonOf(activity).disabled) return
        const user = session.getUser()
        this.setData({ sheet: true, user, 'form.name': this.data.form.name || (wx.getStorageSync('signup_name') || '') })
      })
      .catch(() => {})
  },

  closeSheet() { this.setData({ sheet: false }) },
  noop() {},
  onName(e) { this.setData({ 'form.name': e.detail.value }) },

  onPhone(e) {
    auth.bindPhone(e.detail).then(user => this.setData({ user })).catch(() => {})
  },

  submit() {
    if (this.data.submitting) return
    const name = this.data.form.name.trim()
    if (name.length < 2 || name.length > 20) return wx.showToast({ title: '请填写 2–20 个字的姓名', icon: 'none' })
    if (!this.data.user || !this.data.user.phone) return wx.showToast({ title: '请先授权手机号', icon: 'none' })

    this.setData({ submitting: true })
    api.signup(this.id, { name }).then(() => {
      wx.setStorageSync('signup_name', name)
      track('signup_success', { activityId: this.id })
      this.setData({ sheet: false })
      wx.showToast({ title: '报名成功', icon: 'success' })
      return this.load()
    }, err => {
      if (REFRESH_CODES.indexOf(err.code) > -1) {
        this.setData({ sheet: false })
        return this.load()
      }
    }).catch(() => {}).then(() => this.setData({ submitting: false }))
  },

  goList() { wx.switchTab({ url: '/pages/activity/list' }) },

  onShareAppMessage() {
    const a = this.data.activity
    return { title: a ? a.title : 'XX 摩托活动', path: `/pages/activity/detail?id=${this.id}` }
  }
})
