const api = require('../../api/index')
const format = require('../../utils/format')
const track = require('../../utils/track')

const HISTORY_LIMIT = 20
const DEFAULT_QUICK = ['预算 2 万，推荐一款车', '新手适合什么车？', '通勤用的踏板车推荐', '近期有什么活动？']

let uid = 0
function msg(role, content, extra) {
  uid += 1
  return Object.assign({ id: uid, role, content }, extra)
}

Page({
  data: {
    messages: [],
    input: '',
    sending: false,
    quick: DEFAULT_QUICK,
    intoView: ''
  },

  onLoad(query) {
    track('view', { module: 'chat' })
    this.sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const bike = query.bike ? decodeURIComponent(query.bike) : ''
    const welcome = bike
      ? `您好，看到您在关注「${bike}」，想了解价格、参数，还是是否适合新手？`
      : '您好，我是 XX 摩托智能客服，可以帮您按预算、排量和用途推荐车型，也可以查询活动信息。'
    const quick = bike ? [`${bike} 多少钱`, `${bike} 适合新手吗`, `${bike} 的参数`].concat(DEFAULT_QUICK.slice(0, 1)) : DEFAULT_QUICK
    this.setData({ messages: [msg('assistant', welcome, { local: true })], quick })
  },

  onInput(e) { this.setData({ input: e.detail.value }) },
  onQuick(e) { this.send(e.currentTarget.dataset.text) },
  onSend() { this.send(this.data.input) },

  send(text) {
    const content = String(text || '').trim()
    if (!content || this.data.sending) return

    const userMsg = msg('user', content)
    const pending = msg('assistant', '正在思考…', { pending: true })
    const messages = this.data.messages.concat(userMsg, pending)
    this.setData({ messages, input: '', sending: true, intoView: `m${pending.id}` })

    // 多轮上下文：只带真实对话，不带欢迎语和占位
    const history = messages
      .filter(m => !m.pending && !m.local && !m.failed)
      .slice(-HISTORY_LIMIT)
      .map(m => ({ role: m.role, content: m.content }))

    api.chat({ sessionId: this.sessionId, messages: history }).then(res => {
      const bikes = (res.bikes || []).map(b => Object.assign({}, b, {
        priceText: format.priceFromFen(b.price),
        cc: format.displacement(b.cc) || format.ccOfName(b.name)
      }))
      this.replacePending(pending.id, msg('assistant', res.reply, { bikes }))
    }, () => {
      this.replacePending(pending.id, msg('assistant', '网络开小差了，请稍后重试。', { failed: true, retry: content }))
    })
  },

  // 换成新 id，保证 scroll-into-view 值变化，滚动到最新消息
  replacePending(pendingId, next) {
    const messages = this.data.messages.map(m => (m.id === pendingId ? next : m))
    this.setData({ messages, sending: false, intoView: `m${next.id}` })
  },

  onRetry(e) {
    const { id, text } = e.currentTarget.dataset
    // 去掉失败提示和对应的那条用户消息后重发
    const i = this.data.messages.findIndex(m => m.id === id)
    if (i < 1) return
    this.setData({ messages: this.data.messages.slice(0, i - 1).concat(this.data.messages.slice(i + 1)) })
    this.send(text)
  },

  openBike(e) { wx.navigateTo({ url: `/pages/bike/detail?id=${e.currentTarget.dataset.id}` }) }
})
