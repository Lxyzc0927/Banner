const format = require('../../utils/format')

Component({
  properties: {
    bike: { type: Object, value: {} }
  },
  data: { priceText: '' },
  observers: {
    bike(b) { this.setData({ priceText: format.price(b && b.price) }) }
  },
  methods: {
    onTap() {
      wx.navigateTo({ url: `/pages/bike/detail?id=${this.data.bike.id}` })
    }
  }
})
