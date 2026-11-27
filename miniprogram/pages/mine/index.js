const api = require('../../api/index')
const auth = require('../../utils/auth')
const session = require('../../utils/session')
const track = require('../../utils/track')

Page({
  data: { user: null },

  onShow() {
    track('view', { module: 'mine' })
    this.setData({ user: session.getUser() })
    if (!session.isLoggedIn()) return
    // 刷新用户信息；token 失效时 request 会静默清掉登录态
    api.getMe().then(user => {
      session.setUser(user)
      this.setData({ user })
    }, () => this.setData({ user: session.getUser() }))
  },

  onLogin() {
    auth.requireLogin().then(user => this.setData({ user })).catch(() => {})
  },

  onPhone(e) {
    auth.bindPhone(e.detail).then(user => {
      this.setData({ user })
      wx.showToast({ title: '绑定成功', icon: 'success' })
    }).catch(() => {})
  },

  onMenu(e) {
    const { url, auth: needLogin } = e.currentTarget.dataset
    const go = () => wx.navigateTo({ url })
    if (needLogin) auth.requireLogin().then(go).catch(() => {})
    else go()
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后将无法查看收藏和报名记录，确定退出吗？',
      confirmColor: '#e8541e',
      success: res => {
        if (!res.confirm) return
        auth.logout()
        this.setData({ user: null })
      }
    })
  }
})
