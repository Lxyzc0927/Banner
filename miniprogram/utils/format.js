function price(n) {
  return String(n == null ? '' : n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// 接口金额以分保存，筛选面板的元值仍使用 price。
function priceFromFen(value) {
  if (value == null || value === '') return ''
  const fen = Number(value)
  if (!Number.isFinite(fen)) return ''
  const [yuan, fraction] = (fen / 100).toFixed(2).split('.')
  return price(yuan) + (fraction === '00' ? '' : '.' + fraction)
}

function percent(part, total) {
  if (!total) return 0
  return Math.min(100, Math.round(part / total * 100))
}

// 号码牌档位：150/250 白牌（入门），300/400 黄牌（中排），500 及以上红牌（大排）
// key 与接口参数 tier 一致：entry ≤250cc，mid 300–499cc，big ≥500cc
const TIERS = [
  { key: 'entry', label: '入门', color: 'white' },
  { key: 'mid', label: '中排', color: 'yellow' },
  { key: 'big', label: '大排', color: 'red' }
]
function tier(cc) {
  const n = Number(cc) || 0
  return TIERS[n >= 500 ? 2 : n >= 300 ? 1 : 0]
}
function tierByKey(key) { return TIERS.find(t => t.key === key) || null }

// 车名末尾的排量，如「XX 风行 150」→ 150
function ccOfName(name) {
  const m = String(name || '').match(/(\d{3})\s*$/)
  return m ? Number(m[1]) : 0
}

// 后端时间是 UTC ISO（如 2026-11-28T00:30:00.000Z），展示前转成本地「2026-11-28 08:30」
function dateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value)
  const p = n => (n < 10 ? '0' + n : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 「2026-11-28 08:30」或 UTC ISO → { month: 11, day: '28', time: '08:30' }（本地时间）
function dateParts(text) {
  if (/T/.test(String(text || ''))) text = dateTime(text)
  const m = String(text || '').match(/^\d{4}-(\d{2})-(\d{2})(?:\s+(\d{2}:\d{2}))?/)
  if (!m) return { month: '', day: '', time: '' }
  return { month: Number(m[1]), day: m[2], time: m[3] || '' }
}

module.exports = { price, priceFromFen, percent, tier, tierByKey, TIERS, ccOfName, dateTime, dateParts }
