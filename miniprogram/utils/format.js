function price(n) {
  return String(n == null ? '' : n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function percent(part, total) {
  if (!total) return 0
  return Math.min(100, Math.round(part / total * 100))
}

module.exports = { price, percent }
