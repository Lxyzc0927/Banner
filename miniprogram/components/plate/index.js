const format = require('../../utils/format')

// 号码牌：排量数字 + 按档位着色。size: s 列表行 / m 筛选与推荐 / l 详情页头
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    cc: { type: Number, value: 0 },
    size: { type: String, value: 's' },
    unit: { type: Boolean, value: false }
  },
  data: { color: 'white' },
  observers: {
    cc(v) { this.setData({ color: format.tier(v).color }) }
  }
})
