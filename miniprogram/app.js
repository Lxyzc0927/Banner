const config = require('./config')

App({
  onLaunch() {
    if (config.USE_MOCK) console.info('[app] 当前使用本地 mock 数据，见 config.js')
  },
  globalData: {}
})
