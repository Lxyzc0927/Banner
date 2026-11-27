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
    errors: { name: '', phone: '' },
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
      this.setData({
        activity,
        percent: format.percent(activity.signup, activity.quota),
        button: buttonOf(activity),
        // 号码牌在报名中、已报名时为黄色
        open: activity.status !== '已结束' && (!activity.full || activity.signed),
        parts: format.dateParts(activity.date),
        left: Math.max(0, activity.quota - activity.signup),
        error: ''
      })
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

  closeSheet() { this.setData({ sheet: false, errors: { name: '', phone: '' } }) },
  noop() {},
  onName(e) { this.setData({ 'form.name': e.detail.value, 'errors.name': '' }) },

  onPhone(e) {
    auth.bindPhone(e.detail).then(user => this.setData({ user, 'errors.phone': '' })).catch(() => {})
  },

  submit() {
    if (this.data.submitting) return
    const name = this.data.form.name.trim()
    // 错误写在对应字段下方，同时 toast 提示
    const errors = {
      name: name.length < 2 || name.length > 20 ? '请填写 2–20 个字的姓名' : '',
      phone: !this.data.user || !this.data.user.phone ? '点上面的按钮授权手机号' : ''
    }
    if (errors.name || errors.phone) {
      this.setData({ errors })
      return wx.showToast({ title: errors.name || '请先授权手机号', icon: 'none' })
    }

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
