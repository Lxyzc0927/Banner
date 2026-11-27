const api = require('../../api/index')
const list = require('../../utils/list')
const track = require('../../utils/track')

const CC_OPTIONS = [{ label: '全部', value: 0 }].concat([150, 250, 300, 400, 500].map(v => ({ label: `${v}cc`, value: v })))

Page({
  data: Object.assign(list.initialState(), {
    keyword: '',
    cc: 0,
    ccOptions: CC_OPTIONS
  }),

  onLoad() { this.refresh() },
  onShow() { track('view', { module: 'bike' }) },
  onPullDownRefresh() { this.refresh().then(() => wx.stopPullDownRefresh()) },
  onReachBottom() { this.loadMore() },
  onUnload() { clearTimeout(this._timer) },

  fetch(page) {
    return api.getBikes(Object.assign({ keyword: this.data.keyword.trim(), cc: this.data.cc || '' }, page))
  },
  refresh() { return list.load(this, p => this.fetch(p), { reset: true }) },
  loadMore() { return list.load(this, p => this.fetch(p)) },

  // 输入防抖，避免每个字都请求
  onInput(e) {
    this.setData({ keyword: e.detail.value })
    clearTimeout(this._timer)
    this._timer = setTimeout(() => this.refresh(), 400)
  },
  onSearch() {
    clearTimeout(this._timer)
    this.refresh()
  },
  onClear() {
    clearTimeout(this._timer)
    this.setData({ keyword: '' })
    this.refresh()
  },
  onCc(e) {
    const cc = e.currentTarget.dataset.value
    if (cc === this.data.cc) return
    this.setData({ cc })
    this.refresh()
  },
  onClearFilter() {
    this.setData({ keyword: '', cc: 0 })
    this.refresh()
  },
  onRetry() {
    if (this.data.list.length) this.loadMore()
    else this.refresh()
  }
})
