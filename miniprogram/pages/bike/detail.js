const api = require('../../api/index')
const auth = require('../../utils/auth')
const session = require('../../utils/session')
const format = require('../../utils/format')
const track = require('../../utils/track')
const bikeFilter = require('../../utils/bike-filter')

// 数值和单位分开，表格里数值右对齐、等宽，便于竖着比较
function paramsOf(b) {
  return [
    { label: '排量', value: b.cc, unit: 'cc' },
    { label: '最大功率', value: b.power, unit: 'kW' },
    { label: '峰值扭矩', value: b.torque, unit: 'N·m' },
    { label: '整备质量', value: b.weight, unit: 'kg' },
    { label: '座高', value: b.seatHeight, unit: 'mm' },
    { label: '油箱容积', value: b.tank, unit: 'L' }
  ]
}

Page({
  data: {
    bike: null,
    priceText: '',
    params: [],
    error: ''
  },

  onLoad(query) {
    this.id = Number(query.id)
    this.load()
    track('view', { module: 'bike_detail', bikeId: this.id })
  },

  load() {
    return api.getBike(this.id).then(bike => {
      if (!bike.images.length && bike.cover) bike = Object.assign({}, bike, { images: [bike.cover] })
      wx.setNavigationBarTitle({ title: bike.name })
      this.setData({ bike, priceText: format.priceFromFen(bike.price), params: paramsOf(bike), tierLabel: format.tier(bike.cc).label, tierKey: format.tier(bike.cc).key, tierColor: format.tier(bike.cc).color, error: '' })
    }, err => {
      this.setData({ error: err.message || '加载失败' })
    })
  },

  onFavorite() {
    if (this._busy) return
    const wasLoggedIn = session.isLoggedIn()
    this._busy = true
    auth.requireLogin()
      // 刚登录时详情是未登录状态拉的，先刷新拿到真实收藏状态
      .then(() => (wasLoggedIn ? null : this.load()))
      .then(() => {
        const on = !this.data.bike.favorited
        return api.setFavorite(this.id, on).then(res => {
          this.setData({ 'bike.favorited': res.favorited })
          wx.showToast({ title: res.favorited ? '已收藏' : '已取消收藏', icon: 'none' })
        })
      })
      .catch(() => {})
      .then(() => { this._busy = false })
  },

  onChat() {
    wx.navigateTo({ url: `/pages/chat/index?bike=${encodeURIComponent(this.data.bike.name)}` })
  },

  goActivities() { wx.switchTab({ url: '/pages/activity/list' }) },
  goBikes() { wx.switchTab({ url: '/pages/bike/list' }) },

  // 标签直达筛选：车型列表是 tab 页，switchTab 不能带参数，经 bike-filter 中转
  onLabel(e) {
    const { type, value } = e.currentTarget.dataset
    bikeFilter.set(type === 'tags' ? { tags: [value] } : { [type]: value })
    wx.switchTab({ url: '/pages/bike/list' })
  },

  onShareAppMessage() {
    const b = this.data.bike
    return { title: b ? `${b.name} · ¥${this.data.priceText}` : 'XX 摩托', path: `/pages/bike/detail?id=${this.id}` }
  }
})
