const api = require('../../api/index')
const list = require('../../utils/list')
const activity = require('../../utils/activity')
const track = require('../../utils/track')

// 后端 C 端活动列表只支持 includeEnded（默认不含已结束），没有按状态筛选的参数
const TABS = [
  { label: '近期活动', value: '' },
  { label: '含已结束', value: 'true' }
]

function decorate(a) { return activity.view(a) }

Page({
  data: Object.assign(list.initialState(), { tabs: TABS, includeEnded: '' }),

  onLoad() { this.refresh() },
  onShow() {
    track('view', { module: 'activity' })
    // 从详情页报名回来后刷新人数与状态
    if (this._loaded) this.refresh()
    this._loaded = true
  },
  onPullDownRefresh() { this.refresh().then(() => wx.stopPullDownRefresh()) },
  onReachBottom() { this.loadMore() },

  fetch(page) { return api.getActivities(Object.assign({ includeEnded: this.data.includeEnded }, page)) },
  refresh() { return list.load(this, p => this.fetch(p), { reset: true, map: decorate }) },
  // 首屏失败后 list.load 会自动从第一页重来
  loadMore() { return list.load(this, p => this.fetch(p), { map: decorate }) },

  onTab(e) {
    const includeEnded = e.currentTarget.dataset.value
    if (includeEnded === this.data.includeEnded) return
    this.setData({ includeEnded })
    this.refresh()
  },
  onRetry() { this.loadMore() },
  open(e) { wx.navigateTo({ url: `/pages/activity/detail?id=${e.currentTarget.dataset.id}` }) }
})
