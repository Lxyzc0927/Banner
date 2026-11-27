const format = require('../../utils/format')

// 车型行：左侧号码牌，中间名称与类别，右侧价格
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    bike: { type: Object, value: {} }
  },
  data: { priceText: '', tierLabel: '' },
  observers: {
    bike(b) {
      this.setData({ priceText: format.price(b && b.price), tierLabel: format.tier(b && b.cc).label })
    }
  },
  methods: {
    onTap() {
      wx.navigateTo({ url: `/pages/bike/detail?id=${this.data.bike.id}` })
    }
  }
})
