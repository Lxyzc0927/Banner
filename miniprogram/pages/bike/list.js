const format = require('../../utils/format')
const api = require('../../api/index')
const list = require('../../utils/list')
const track = require('../../utils/track')
const bikeFilter = require('../../utils/bike-filter')

const CC_OPTIONS = [{ label: '全部', value: 0 }].concat([150, 250, 300, 400, 500].map(v => ({ label: String(v), value: v, color: format.tier(v).color })))

const SORT_OPTIONS = [
  { label: '综合', value: '' },
  { label: '低价优先', value: 'price_asc' },
  { label: '高价优先', value: 'price_desc' }
]

// 预设价格区间（元，含边界）；max 为空表示不设上限
const PRICE_PRESETS = [
  { key: 'all', label: '不限', min: '', max: '' },
  { key: 'lt2', label: '2 万以下', min: '', max: 20000 },
  { key: '2to3', label: '2–3 万', min: 20000, max: 30000 },
  { key: '3to4', label: '3–4 万', min: 30000, max: 40000 },
  { key: 'gt4', label: '4 万以上', min: 40000, max: '' }
]

function priceLabel(min, max) {
  if (min === '' && max === '') return ''
  const preset = PRICE_PRESETS.find(p => p.min === min && p.max === max)
  if (preset) return preset.label
  if (min === '') return `${format.price(max)} 以下`
  if (max === '') return `${format.price(min)} 以上`
  return `${format.price(min)}–${format.price(max)}`
}

// 自定义输入：空串表示不限，否则必须是非负整数
function parsePrice(text) {
  const t = String(text == null ? '' : text).trim()
  if (!t) return ''
  return /^\d{1,7}$/.test(t) ? Number(t) : NaN
}

// 标签面板里的选项，带上是否选中，供 WXML 直接渲染
function optionsView(opts, draft) {
  return {
    categories: opts.categories.map(v => ({ value: v, on: draft.category === v })),
    tiers: format.TIERS.map(t => ({ value: t.key, label: t.label, on: draft.tier === t.key })),
    tags: opts.tags.map(v => ({ value: v, on: draft.tags.indexOf(v) > -1 }))
  }
}

Page({
  data: Object.assign(list.initialState(), {
    keyword: '',
    cc: 0,
    ccOptions: CC_OPTIONS,
    sort: '',
    sortOptions: SORT_OPTIONS,
    minPrice: '',
    maxPrice: '',
    priceText: '',
    pricePresets: PRICE_PRESETS,
    priceSheet: false,
    draft: { min: '', max: '', error: '' },
    // 标签筛选：类别、档位各选一个，特点标签可多选（须同时满足）
    category: '',
    tier: '',
    tags: [],
    tagCount: 0,
    pills: [],
    tagSheet: false,
    tagDraft: { category: '', tier: '', tags: [] },
    tagView: { categories: [], tiers: [], tags: [] },
    previewTotal: -1
  }),

  onLoad() {
    this._options = { categories: [], tags: [] }
    api.getBikeFilters().then(o => { this._options = o }, () => {})
  },
  onShow() {
    track('view', { module: 'bike' })
    // 从车型详情点标签跳来：只按这个标签筛选
    const f = bikeFilter.take()
    if (f) {
      this.setData(Object.assign(this.emptyFilters(), {
        category: f.category || '',
        tier: f.tier || '',
        tags: f.tags || []
      }))
      this.updatePills()
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
      track('bike_tag_filter', Object.assign({ source: 'detail' }, f))
      this.refresh()
    } else if (!this._loaded) {
      this.refresh()
    }
    this._loaded = true
  },
  onPullDownRefresh() { this.refresh().then(() => wx.stopPullDownRefresh()) },
  onReachBottom() { this.loadMore() },
  onUnload() { clearTimeout(this._timer); clearTimeout(this._previewTimer) },

  fetch(page) {
    const d = this.data
    return api.getBikes(Object.assign({
      keyword: d.keyword.trim(),
      cc: d.cc || '',
      minPrice: d.minPrice,
      maxPrice: d.maxPrice,
      sort: d.sort,
      category: d.category,
      tier: d.tier,
      tags: d.tags.join(',')
    }, page))
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

  onSort(e) {
    const sort = e.currentTarget.dataset.value
    if (sort === this.data.sort) return
    this.setData({ sort })
    track('bike_sort', { sort: sort || 'default' })
    this.refresh()
  },

  // ---------- 价格区间面板 ----------
  openPrice() {
    const { minPrice, maxPrice } = this.data
    this.setData({ priceSheet: true, draft: { min: String(minPrice), max: String(maxPrice), error: '' } })
  },
  closePrice() { this.setData({ priceSheet: false }) },
  noop() {},
  onPreset(e) {
    const p = PRICE_PRESETS.find(x => x.key === e.currentTarget.dataset.key)
    this.applyPrice(p.min, p.max)
  },
  onDraftMin(e) { this.setData({ 'draft.min': e.detail.value, 'draft.error': '' }) },
  onDraftMax(e) { this.setData({ 'draft.max': e.detail.value, 'draft.error': '' }) },
  onPriceConfirm() {
    const min = parsePrice(this.data.draft.min)
    const max = parsePrice(this.data.draft.max)
    let error = ''
    if (Number.isNaN(min) || Number.isNaN(max)) error = '价格只能填整数，单位是元'
    else if (min !== '' && max !== '' && min > max) error = '最低价不能高于最高价'
    if (error) return this.setData({ 'draft.error': error })
    this.applyPrice(min, max)
  },
  applyPrice(min, max) {
    const changed = min !== this.data.minPrice || max !== this.data.maxPrice
    this.setData({ priceSheet: false, minPrice: min, maxPrice: max, priceText: priceLabel(min, max) })
    this.updatePills()
    if (changed) {
      track('bike_price_filter', { min, max })
      this.refresh()
    }
  },

  // ---------- 标签面板 ----------
  openTags() {
    const draft = { category: this.data.category, tier: this.data.tier, tags: this.data.tags.slice() }
    this.setData({ tagSheet: true, tagDraft: draft, tagView: optionsView(this._options, draft) })
    this.preview()
  },
  closeTags() { this.setData({ tagSheet: false }) },
  onDraftTag(e) {
    const { type, value } = e.currentTarget.dataset
    const d = this.data.tagDraft
    const draft = { category: d.category, tier: d.tier, tags: d.tags.slice() }
    if (type === 'tags') {
      const i = draft.tags.indexOf(value)
      if (i > -1) draft.tags.splice(i, 1); else draft.tags.push(value)
    } else {
      draft[type] = draft[type] === value ? '' : value
    }
    this.setData({ tagDraft: draft, tagView: optionsView(this._options, draft) })
    this.preview()
  },
  resetTags() {
    const draft = { category: '', tier: '', tags: [] }
    this.setData({ tagDraft: draft, tagView: optionsView(this._options, draft) })
    this.preview()
  },
  // 面板里实时显示"查看 N 款"，只取总数
  preview() {
    clearTimeout(this._previewTimer)
    const seq = (this._previewSeq || 0) + 1
    this._previewSeq = seq
    this._previewTimer = setTimeout(() => {
      const d = this.data
      const t = d.tagDraft
      api.getBikes({
        keyword: d.keyword.trim(), cc: d.cc || '', minPrice: d.minPrice, maxPrice: d.maxPrice,
        category: t.category, tier: t.tier, tags: t.tags.join(','), page: 1, pageSize: 1
      }, { silent: true }).then(res => {
        if (seq === this._previewSeq) this.setData({ previewTotal: res.total })
      }, () => { if (seq === this._previewSeq) this.setData({ previewTotal: -1 }) })
    }, 200)
  },
  applyTags() {
    const t = this.data.tagDraft
    this.setData({ tagSheet: false, category: t.category, tier: t.tier, tags: t.tags })
    this.updatePills()
    track('bike_tag_filter', { source: 'list', category: t.category, tier: t.tier, tags: t.tags })
    this.refresh()
  },

  // ---------- 已选条件 ----------
  updatePills() {
    const d = this.data
    const pills = []
    if (d.priceText) pills.push({ key: 'price', label: d.priceText })
    if (d.category) pills.push({ key: 'category', label: d.category })
    if (d.tier) pills.push({ key: 'tier', label: format.tierByKey(d.tier).label })
    d.tags.forEach(t => pills.push({ key: 'tag', value: t, label: t }))
    this.setData({ pills, tagCount: (d.category ? 1 : 0) + (d.tier ? 1 : 0) + d.tags.length })
  },
  onRemovePill(e) {
    const { key, value } = e.currentTarget.dataset
    if (key === 'price') this.setData({ minPrice: '', maxPrice: '', priceText: '' })
    else if (key === 'tag') this.setData({ tags: this.data.tags.filter(t => t !== value) })
    else this.setData({ [key]: '' })
    this.updatePills()
    this.refresh()
  },

  emptyFilters() {
    return { keyword: '', cc: 0, sort: '', minPrice: '', maxPrice: '', priceText: '', category: '', tier: '', tags: [] }
  },
  onClearFilter() {
    this.setData(this.emptyFilters())
    this.updatePills()
    this.refresh()
  },
  onRetry() {
    if (this.data.list.length) this.loadMore()
    else this.refresh()
  }
})
