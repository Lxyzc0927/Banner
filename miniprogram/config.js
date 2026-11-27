/* 全局配置：后端接口就绪后把 USE_MOCK 改为 false，并填写 BASE_URL */
module.exports = {
  // true：使用 mock/ 下的本地模拟数据，不发网络请求
  USE_MOCK: true,
  // 真机调试需在微信公众平台配置 request 合法域名
  BASE_URL: 'http://localhost:8080',
  TIMEOUT: 10000,
  // 与后端约定的成功码：{ code: 0, msg: 'ok', data: ... }
  SUCCESS_CODE: 0
}
