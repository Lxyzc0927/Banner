const api = require('../../api/index')
const auth = require('../../utils/auth')
const nav = require('../../utils/nav')
const track = require('../../utils/track')

Page({
  data: {
    banners: [],
    news: [],
    hotBikes: [],
    loading: true,
    error: false
  },

  onLoad() { this.load() },
  onShow() { track('view', { module: 'home' }) },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()) },

  load() {
    return api.getHome().then(res => {
      this.setData({ banners: res.banners, news: res.news, hotBikes: res.hotBikes, loading: false, error: false })
    }, () => {
      this.setData({ loading: false, error: true })
    })
  },

  onRetry() {
    this.setData({ error: false, loading: true })
    this.load()
  },

  onBanner(e) { nav.open(e.currentTarget.dataset.link) },

  onNews(e) {
    const item = this.data.news[e.currentTarget.dataset.index]
    wx.showModal({ title: item.title, content: item.summary, showCancel: false, confirmText: '知道了' })
  },

  goBikes() { wx.switchTab({ url: '/pages/bike/list' }) },
  goActivities() { wx.switchTab({ url: '/pages/activity/list' }) },
  goChat() { wx.navigateTo({ url: '/pages/chat/index' }) },
  goFavorites() {
    auth.requireLogin().then(() => wx.navigateTo({ url: '/pages/mine/favorites' })).catch(() => {})
  },

  onShareAppMessage() { return { title: 'XX 摩托 · 选车看活动', path: '/pages/home/index' } }
})
