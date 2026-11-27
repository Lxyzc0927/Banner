/*
 * 行为埋点（失败静默）。事件定义见 README「埋点约定」：
 *   view            页面访问，module = home | bike | bike_detail | activity | activity_detail | mine | chat
 *   signup_click    点击报名
 *   signup_success  报名成功
 */
const api = require('../api/index')

module.exports = function track(event, props) {
  api.track(Object.assign({ event, ts: Date.now() }, props)).catch(() => {})
}
