const format = require('../../utils/format')

// 车型行：左侧号码牌，中间名称与类别，右侧价格
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    bike: { type: Object, value: {} }
  },
  data: { priceText: '', tierLabel: '', plateCc: 0 },
  observers: {
    bike(b) {
      const plateCc = format.displacement(b && b.cc)
      this.setData({ priceText: format.priceFromFen(b && b.price), tierLabel: format.tier(plateCc).label, plateCc })
    }
  },
  methods: {
    onTap() {
      wx.navigateTo({ url: `/pages/bike/detail?id=${this.data.bike.id}` })
    }
  }
})
