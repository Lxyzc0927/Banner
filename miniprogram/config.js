/* 全局配置：联调真实后端时把 USE_MOCK 改为 false，BASE_URL 指向后端地址 */
module.exports = {
  // true：使用 mock/ 下的本地模拟数据，不发网络请求
  USE_MOCK: true,
  // 本地联调 D 模块后端（npm start 默认 3000 端口）；真机用电脑局域网 IP，上线换 HTTPS 合法域名
  BASE_URL: 'http://127.0.0.1:3000',
  TIMEOUT: 10000,
  // 与后端约定的成功码：{ code: 0, message: 'ok', data: ... }
  SUCCESS_CODE: 0
}
