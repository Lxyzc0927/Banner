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
    const seq = (this._profileSeq || 0) + 1
    this._profileSeq = seq
    const revision = session.getRevision()
    // 刷新用户信息；token 失效时 request 会静默清掉登录态
    api.getMe().then(res => {
      if (seq !== this._profileSeq || revision !== session.getRevision()) return
      const user = res.user
      session.setUser(user)
      this.setData({ user })
    }, () => {
      if (seq === this._profileSeq) this.setData({ user: session.getUser() })
    })
  },

  onLogin() {
    auth.requireLogin().then(user => this.setData({ user })).catch(() => {})
  },

  onPhone(e) {
    auth.bindPhone(e.detail).then(user => {
      // 先前发出的资料请求可能还没有包含新绑定的手机号。
      this._profileSeq = (this._profileSeq || 0) + 1
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
