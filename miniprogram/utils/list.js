/*
 * 分页列表通用逻辑。页面 data 需展开 initialState()，然后：
 *   load(this, fetcher, { reset: true })   首次加载 / 下拉刷新 / 切换筛选
 *   load(this, fetcher)                    触底加载下一页；首屏失败后重试也走这里
 * fetcher({ page, pageSize }) 需返回 Promise<{ list, total }>；map 用于加工每条数据。
 * data.page 是已成功加载到的页码，0 表示还没有可用的第一页。
 */
const PAGE_SIZE = 10

function initialState() {
  return { list: [], page: 0, total: 0, loading: false, finished: false, empty: false, error: false }
}

function load(ctx, fetcher, opts) {
  const { reset = false, map } = opts || {}
  if (!reset && (ctx.data.loading || ctx.data.finished)) return Promise.resolve()

  // 切换筛选时旧请求可能晚到，用序号丢弃过期结果
  const seq = (ctx._listSeq || 0) + 1
  ctx._listSeq = seq
  // 第一页还没成功过（含切换筛选后首屏失败），重试必须从第一页开始并替换列表
  const fresh = reset || ctx.data.page === 0
  const page = fresh ? 1 : ctx.data.page + 1
  ctx.setData(fresh ? { loading: true, error: false, finished: false } : { loading: true, error: false })

  return fetcher({ page, pageSize: PAGE_SIZE }).then(res => {
    if (seq !== ctx._listSeq) return
    const items = map ? res.list.map(map) : res.list
    const list = fresh ? items : ctx.data.list.concat(items)
    ctx.setData({
      list,
      page,
      total: res.total,
      loading: false,
      finished: list.length >= res.total || items.length === 0,
      empty: list.length === 0
    })
  }, () => {
    if (seq !== ctx._listSeq) return
    // 首屏失败：旧列表对应的是旧筛选条件，清空并把页码归零，避免重试时把新结果拼到旧列表后面
    if (fresh) ctx.setData({ loading: false, error: true, list: [], page: 0, total: 0, finished: false, empty: false })
    else ctx.setData({ loading: false, error: true })
  })
}

module.exports = { PAGE_SIZE, initialState, load }
