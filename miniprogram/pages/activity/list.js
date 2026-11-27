const api = require('../../api/index')
const list = require('../../utils/list')
const format = require('../../utils/format')
const track = require('../../utils/track')

// 状态值与管理后台一致：进行中 / 已结束
const TABS = [
  { label: '全部', value: '' },
  { label: '报名中', value: '进行中' },
  { label: '已结束', value: '已结束' }
]

function decorate(a) {
  const ended = a.status === '已结束'
  return Object.assign({}, a, {
    percent: format.percent(a.signup, a.quota),
    stateText: ended ? '已结束' : a.full ? '名额已满' : a.signed ? '已报名' : '报名中',
    stateClass: ended ? 'state-ended' : a.full ? 'state-full' : a.signed ? 'state-signed' : 'state-open',
    open: !ended && !a.full,
    left: Math.max(0, a.quota - a.signup)
  }, format.dateParts(a.date))
}

Page({
  data: Object.assign(list.initialState(), { tabs: TABS, status: '' }),

  onLoad() { this.refresh() },
  onShow() {
    track('view', { module: 'activity' })
    // 从详情页报名回来后刷新人数与状态
    if (this._loaded) this.refresh()
    this._loaded = true
  },
  onPullDownRefresh() { this.refresh().then(() => wx.stopPullDownRefresh()) },
  onReachBottom() { list.load(this, p => this.fetch(p), { map: decorate }) },

  fetch(page) { return api.getActivities(Object.assign({ status: this.data.status }, page)) },
  refresh() { return list.load(this, p => this.fetch(p), { reset: true, map: decorate }) },

  onTab(e) {
    const status = e.currentTarget.dataset.value
    if (status === this.data.status) return
    this.setData({ status })
    this.refresh()
  },
  onRetry() {
    if (this.data.list.length) this.onReachBottom()
    else this.refresh()
  },
  open(e) { wx.navigateTo({ url: `/pages/activity/detail?id=${e.currentTarget.dataset.id}` }) }
})
