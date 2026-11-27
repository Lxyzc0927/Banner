const api = require('../../api/index')
const auth = require('../../utils/auth')
const session = require('../../utils/session')
const format = require('../../utils/format')
const track = require('../../utils/track')

function paramsOf(b) {
  return [
    { label: '排量', value: `${b.cc}cc` },
    { label: '最大功率', value: `${b.power}kW` },
    { label: '峰值扭矩', value: `${b.torque}N·m` },
    { label: '整备质量', value: `${b.weight}kg` },
    { label: '座高', value: `${b.seatHeight}mm` },
    { label: '油箱容积', value: `${b.tank}L` }
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
      wx.setNavigationBarTitle({ title: bike.name })
      this.setData({ bike, priceText: format.price(bike.price), params: paramsOf(bike), error: '' })
    }, err => {
      this.setData({ error: err.msg || '加载失败' })
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

  onShareAppMessage() {
    const b = this.data.bike
    return { title: b ? `${b.name} · ¥${this.data.priceText}` : 'XX 摩托', path: `/pages/bike/detail?id=${this.id}` }
  }
})
