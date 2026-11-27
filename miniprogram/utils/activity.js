/*
 * 活动展示字段：把后端（D 模块）返回的活动整理成页面直接用的字段。
 * 后端字段：startAt / endAt / signupStartAt / signupEndAt（UTC ISO）、quota、signupCount、remaining、
 *          signedUp、signupOpen、phase（upcoming | ongoing | ended）、location、description。
 * 名额、能否报名以服务端返回为准，前端只负责展示。
 */
const format = require('./format')

// 不能报名时，区分「还没开始」和「已截止」
function closedText(a, now) {
  return a.signupStartAt && now < Date.parse(a.signupStartAt) ? '报名未开始' : '报名已截止'
}

function view(a, now) {
  now = now || Date.now()
  const ended = a.phase === 'ended'
  const signed = !!a.signedUp
  const full = Number(a.remaining) <= 0
  const open = !!a.signupOpen

  let stateText = '报名中'
  let stateClass = 'state-open'
  if (ended) { stateText = '已结束'; stateClass = 'state-ended' }
  else if (signed) { stateText = '已报名'; stateClass = 'state-signed' }
  else if (full) { stateText = '名额已满'; stateClass = 'state-full' }
  else if (!open) { stateText = closedText(a, now); stateClass = 'state-ended' }

  const timeText = format.dateTime(a.startAt)
  return Object.assign({}, a, format.dateParts(timeText), {
    timeText,
    ended,
    signed,
    full,
    canSignup: open && !ended && !signed && !full,
    stateText,
    stateClass,
    // 号码牌：可报名、已报名未结束时为黄牌，其余白牌
    yellow: !ended && (signed || (open && !full)),
    percent: format.percent(a.signupCount, a.quota),
    // 首页 Banner 等处的一句话状态
    note: ended ? '活动已结束' : signed ? '你已报名' : full ? '名额已满' : !open ? closedText(a, now) : `还剩 ${a.remaining} 个名额`
  })
}

// 报名按钮文案
function button(v) {
  if (v.ended) return { text: '活动已结束', disabled: true }
  if (v.signed) return { text: '已报名，期待你的到来', disabled: true }
  if (v.full) return { text: '名额已满', disabled: true }
  if (!v.signupOpen) return { text: v.stateText, disabled: true }
  return { text: '立即报名', disabled: false }
}

module.exports = { view, button }
