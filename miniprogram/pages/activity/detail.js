const api = require('../../api/index')
const auth = require('../../utils/auth')
const session = require('../../utils/session')
const activityView = require('../../utils/activity')
const track = require('../../utils/track')

// 报名接口业务错误码（D 模块）：活动状态已变化，关掉表单并刷新详情
//   1002 不在报名时间 / 已结束  1003 名额已满  1004 已报名  1005 未发布 / 已下架  404 活动不存在
const REFRESH_CODES = [1002, 1003, 1004, 1005, 404]
const PHONE_REQUIRED = 1010
const USER_DISABLED = 1008

Page({
  data: {
    activity: null,
    button: { text: '', disabled: true },
    error: '',
    sheet: false,
    // 后端报名只收手机号（来自授权）和选填备注，不再收姓名
    form: { remark: '' },
    errors: { phone: '' },
    user: null,
    submitting: false
  },

  onLoad(query) {
    this.id = Number(query.id)
    this.load().catch(() => {})
    track('view', { module: 'activity_detail', activityId: this.id })
  },

  load() {
    const seq = (this._loadSeq || 0) + 1
    this._loadSeq = seq
    return api.getActivity(this.id).then(raw => {
      if (seq !== this._loadSeq) return this.data.activity
      const activity = activityView.view(raw)
      this.setData({
        activity,
        button: activityView.button(activity),
        error: ''
      })
      return activity
    }, err => {
      if (seq === this._loadSeq) this.setData({ error: err.message || '加载失败' })
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
        if (activityView.button(activity).disabled) return
        this.setData({ sheet: true, user: session.getUser(), errors: { phone: '' } })
      })
      .catch(() => {})
  },

  closeSheet() { this.setData({ sheet: false, errors: { phone: '' } }) },
  noop() {},
  onRemark(e) { this.setData({ 'form.remark': e.detail.value }) },

  onPhone(e) {
    auth.bindPhone(e.detail).then(user => this.setData({ user, 'errors.phone': '' })).catch(() => {})
  },

  submit() {
    if (this.data.submitting) return
    // 手机号以服务端为准；这里只拦明显没授权的情况，错误写在字段下方
    if (!this.data.user || !this.data.user.phone) {
      this.setData({ 'errors.phone': '点上面的按钮授权手机号' })
      return wx.showToast({ title: '请先授权手机号', icon: 'none' })
    }

    this.setData({ submitting: true })
    api.signup(this.id, { remark: this.data.form.remark.trim() }).then(res => {
      track('signup_success', { activityId: this.id })
      this.setData({ sheet: false, 'form.remark': '' })
      wx.showToast({ title: '报名成功', icon: 'success' })
      return this.load().then(() => res)
    }, err => {
      if (err.code === PHONE_REQUIRED) {
        // 服务端认为没有手机号：清掉本地缓存的手机号，让用户重新授权
        const user = Object.assign({}, session.getUser(), { phone: null })
        session.setUser(user)
        return this.setData({ user, 'errors.phone': '请先授权手机号' })
      }
      if (err.code === USER_DISABLED) return this.setData({ sheet: false, user: null })
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
