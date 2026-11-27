const api = require('../../api/index')
const auth = require('../../utils/auth')
const nav = require('../../utils/nav')
const track = require('../../utils/track')
const format = require('../../utils/format')

// Banner 上的动作文字跟着跳转目标走
function goTextOf(link) {
  if (/^\/bike/.test(link || '')) return '查看车型'
  if (/^\/activity/.test(link || '')) return '查看活动'
  return '查看详情'
}

// 号码牌 Banner 的大数字：活动显示日期，车型显示排量；取不到就只显示标题
function plateOf(link) {
  const m = String(link || '').match(/^\/(bike|activity)\/(\d+)$/)
  if (!m) return Promise.resolve(null)
  const id = Number(m[2])
  if (m[1] === 'activity') {
    return api.getActivity(id, { silent: true }).then(a => {
      const d = format.dateParts(a.date)
      const left = Math.max(0, a.quota - a.signup)
      const note = a.status === '已结束' ? '活动已结束' : a.full ? '名额已满' : `还剩 ${left} 个名额`
      return { big: d.day, unit: `${d.month}月`, line: `${a.title}，${note}`, color: 'yellow' }
    }, () => null)
  }
  return api.getBike(id, { silent: true }).then(b => ({
    // 车型 Banner 跟排量档位走：150/250 白牌、300/400 黄牌、500 红牌
    big: String(b.cc), unit: 'cc', line: `${b.name}，¥${format.price(b.price)} 起`, color: format.tier(b.cc).color
  }), () => null)
}

Page({
  data: {
    banners: [],
    news: [],
    hotBikes: [],
    onSale: 0,
    autoplay: true,
    bannerCurrent: 0,
    loading: true,
    error: false
  },

  onLoad() { this.load() },
  onShow() { track('view', { module: 'home' }) },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()) },

  load() {
    return api.getHome().then(res => {
      const banners = res.banners.map(b => Object.assign({}, b, { goText: goTextOf(b.link) }))
      this.setData({ banners, news: res.news, hotBikes: res.hotBikes, loading: false, error: false })
      this.decorate(banners)
    }, () => {
      this.setData({ loading: false, error: true })
    })
  },

  // 补充信息都是静默请求，失败不影响首页主体
  decorate(banners) {
    banners.forEach((b, i) => {
      plateOf(b.link).then(plate => { if (plate) this.setData({ [`banners[${i}].plate`]: plate }) })
    })
    api.getBikes({ pageNo: 1, pageSize: 1 }, { silent: true })
      .then(res => this.setData({ onSale: res.total }), () => {})
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
