const auth = require('../../utils/auth')
const session = require('../../utils/session')

Page({
  data: {
    step: 'login', // login → phone
    agreed: false,
    busy: false
  },

  // 无论登录成功还是用户返回，都在页面关闭时通知等待中的操作
  onUnload() { session.settle(session.isLoggedIn()) },

  toggleAgree() { this.setData({ agreed: !this.data.agreed }) },

  showAgreement() {
    wx.showModal({
      title: '用户协议与隐私政策',
      content: '我们仅在您授权后获取微信登录凭证与手机号，用于账号登录、车型收藏和活动报名联系，不会向第三方提供。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  onLogin() {
    if (this.data.busy) return
    if (!this.data.agreed) return wx.showToast({ title: '请先阅读并同意用户协议', icon: 'none' })
    this.setData({ busy: true })
    auth.login().then(user => {
      if (user.phone) this.finish()
      else this.setData({ step: 'phone' })
    }).catch(() => {}).then(() => this.setData({ busy: false }))
  },

  onPhone(e) {
    auth.bindPhone(e.detail).then(() => this.finish()).catch(() => {})
  },

  finish() {
    wx.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(() => {
      // 直接打开登录页（如分享卡片进入）时没有上一页，回到"我的"
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/mine/index' }) })
    }, 600)
  }
})
