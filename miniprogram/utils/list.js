/*
 * 分页列表通用逻辑。页面 data 需展开 initialState()，然后：
 *   load(this, fetcher, { reset: true })   首次加载 / 下拉刷新 / 切换筛选
 *   load(this, fetcher)                    触底加载下一页
 * fetcher({ pageNo, pageSize }) 需返回 Promise<{ list, total }>；map 用于加工每条数据。
 */
const PAGE_SIZE = 10

function initialState() {
  return { list: [], pageNo: 0, total: 0, loading: false, finished: false, empty: false, error: false }
}

function load(page, fetcher, opts) {
  const { reset = false, map } = opts || {}
  if (!reset && (page.data.loading || page.data.finished)) return Promise.resolve()

  // 切换筛选时旧请求可能晚到，用序号丢弃过期结果
  const seq = (page._listSeq || 0) + 1
  page._listSeq = seq
  const pageNo = reset ? 1 : page.data.pageNo + 1
  page.setData(reset ? { loading: true, error: false, finished: false } : { loading: true, error: false })

  return fetcher({ pageNo, pageSize: PAGE_SIZE }).then(res => {
    if (seq !== page._listSeq) return
    const items = map ? res.list.map(map) : res.list
    const list = reset ? items : page.data.list.concat(items)
    page.setData({
      list,
      pageNo,
      total: res.total,
      loading: false,
      finished: list.length >= res.total || items.length === 0,
      empty: list.length === 0
    })
  }, () => {
    if (seq !== page._listSeq) return
    page.setData({ loading: false, error: true })
  })
}

module.exports = { PAGE_SIZE, initialState, load }
