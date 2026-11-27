/*
 * 模拟智能客服：从多轮对话中累计预算 / 排量 / 车型类别等条件，在车型库里筛选作答。
 * 真实版本由后端调用大模型实现，返回结构保持一致：{ reply, bikes: [{ id, name, price }] }
 */
const { CATEGORIES } = require('./data')

const RESET_WORDS = /重新|重来|换个|清空/
const NEWBIE_WORDS = /新手|入门|第一台|女生|练手/
const GREETING = /^(你好|您好|在吗|hi|hello)[\s!！。？?]*$/i
const HELP = '您好，我是 XX 摩托智能客服。可以告诉我您的预算、想要的排量或车型类别（街车、跑车、踏板、巡航、越野、ADV），我来帮您推荐；也可以直接问某款车的价格和参数。'

function normalize(s) { return String(s).replace(/\s+/g, '').replace(/^XX/i, '').toLowerCase() }

function parseBudget(text) {
  let m = text.match(/(\d+(?:\.\d+)?)\s*[万w]/i)
  if (m) return Math.round(Number(m[1]) * 10000)
  m = text.match(/(\d{4,6})\s*(?:元|块)/) || text.match(/预算\D{0,4}(\d{4,6})/)
  return m ? Number(m[1]) : null
}

function parseCc(text) {
  const m = text.match(/(\d{3})\s*(?:cc|排量|毫升)/i) || text.match(/排量\D{0,3}(\d{3})/) ||
    text.match(/(?:^|\D)(125|150|250|300|400|500)(?!\d)/)
  return m ? Number(m[1]) : null
}

function findBike(text, bikes) {
  const t = normalize(text)
  return bikes.find(b => t.indexOf(normalize(b.name)) > -1)
}

function brief(b) { return { id: b.id, name: b.name, price: b.price } }
function priceText(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') }

function describe(b, question) {
  if (/多少钱|价格|售价|贵/.test(question)) return `${b.name} 厂商指导价 ${priceText(b.price)} 元，到店可咨询当期优惠。`
  if (/新手|适合/.test(question)) {
    return b.cc <= 250
      ? `${b.name} 是 ${b.cc}cc ${b.category}，座高 ${b.seatHeight}mm，动力线性，比较适合新手。`
      : `${b.name} 是 ${b.cc}cc ${b.category}，最大功率 ${b.power}kW，动力较强，建议有一定驾驶经验后再选择。`
  }
  return `${b.name}：${b.category}，${b.cc}cc，最大功率 ${b.power}kW，峰值扭矩 ${b.torque}N·m，整备质量 ${b.weight}kg，座高 ${b.seatHeight}mm，油箱 ${b.tank}L，指导价 ${priceText(b.price)} 元。`
}

function reply(messages, bikes, activities) {
  let userTexts = messages.filter(m => m.role === 'user').map(m => String(m.content || ''))
  const last = userTexts[userTexts.length - 1] || ''

  // "重新推荐" 之后只看新的条件
  const resetAt = userTexts.map(t => RESET_WORDS.test(t)).lastIndexOf(true)
  if (resetAt > -1) userTexts = userTexts.slice(resetAt)

  if (/活动|报名|试驾会/.test(last) && !findBike(last, bikes)) {
    const open = activities.filter(a => a.status === '进行中')
    if (!open.length) return { reply: '近期暂无可报名的活动，可以关注首页公告。', bikes: [] }
    return { reply: '近期可报名的活动：\n' + open.map(a => `· ${a.title}（${a.date}，${a.place}）`).join('\n') + '\n可在「活动」页报名。', bikes: [] }
  }

  // 问到具体车型：在当前句或上文里找车型
  const named = findBike(last, bikes) ||
    (/它|这款|这台|这辆/.test(last) ? userTexts.slice(0, -1).reverse().map(t => findBike(t, bikes)).find(Boolean) : null)
  if (named) return { reply: describe(named, last), bikes: [brief(named)] }

  if (GREETING.test(last.trim())) return { reply: HELP, bikes: [] }

  let budget = null
  let cc = null
  let category = null
  let newbie = false
  userTexts.forEach(t => {
    budget = parseBudget(t) || budget
    cc = parseCc(t) || cc
    category = CATEGORIES.find(c => t.toUpperCase().indexOf(c.replace(' 探险', '')) > -1) || category
    newbie = newbie || NEWBIE_WORDS.test(t)
  })

  if (!budget && !cc && !category && !newbie) return { reply: HELP, bikes: [] }

  let list = bikes.filter(b =>
    (!budget || b.price <= budget) &&
    (!cc || b.cc === cc) &&
    (!category || b.category === category) &&
    (!newbie || b.cc <= 250))
  const conds = [
    budget && `预算 ${priceText(budget)} 元以内`,
    cc && `${cc}cc`,
    category,
    newbie && '适合新手'
  ].filter(Boolean).join('、')

  if (!list.length) {
    list = bikes.filter(b => (!category || b.category === category)).sort((a, b) => a.price - b.price).slice(0, 3)
    return { reply: `暂时没有完全符合「${conds}」的车型，给您推荐几款接近的，可以放宽预算或排量再看看：`, bikes: list.map(brief) }
  }
  list = list.sort((a, b) => b.price - a.price).slice(0, 3)
  return { reply: `按「${conds}」为您找到以下车型，点击可查看详情。还可以继续补充条件，或说"重新推荐"。`, bikes: list.map(brief) }
}

module.exports = { reply, parseBudget, parseCc }
