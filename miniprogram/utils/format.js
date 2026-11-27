function price(n) {
  return String(n == null ? '' : n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
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

// 「2026-11-28 08:30」→ { month: 11, day: '28', time: '08:30' }
function dateParts(text) {
  const m = String(text || '').match(/^\d{4}-(\d{2})-(\d{2})(?:\s+(\d{2}:\d{2}))?/)
  if (!m) return { month: '', day: '', time: '' }
  return { month: Number(m[1]), day: m[2], time: m[3] || '' }
}

module.exports = { price, percent, tier, tierByKey, TIERS, ccOfName, dateParts }
