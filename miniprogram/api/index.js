/* 接口清单：路径与参数见 miniprogram/README.md，需与后端接口文档保持一致 */
const request = require('../utils/request')

module.exports = {
  // 登录与用户
  wxLogin: code => request({ url: '/api/auth/wx-login', method: 'POST', data: { code }, loading: '登录中' }),
  bindPhone: code => request({ url: '/api/auth/phone', method: 'POST', data: { code }, loading: true }),
  getMe: () => request({ url: '/api/user/me', silent: true }),

  // 首页
  getHome: () => request({ url: '/api/home' }),

  // 车型与收藏
  // opts 可传 { silent: true }，用于首页补充信息等失败也不打扰用户的场景
  getBikes: (params, opts) => request(Object.assign({ url: '/api/bikes', data: params }, opts)),
  getBike: (id, opts) => request(Object.assign({ url: `/api/bikes/${id}` }, opts)),
  // 标签筛选的可选项：{ categories: [], tags: [] }
  getBikeFilters: () => request({ url: '/api/bikes/filters', silent: true }),
  setFavorite: (id, on) => request({ url: `/api/bikes/${id}/favorite`, method: on ? 'POST' : 'DELETE' }),
  getFavorites: params => request({ url: '/api/favorites', data: params }),

  // 活动与报名
  getActivities: params => request({ url: '/api/activities', data: params }),
  getActivity: (id, opts) => request(Object.assign({ url: `/api/activities/${id}` }, opts)),
  signup: (id, data) => request({ url: `/api/activities/${id}/signup`, method: 'POST', data, loading: '提交中' }),
  getMySignups: params => request({ url: '/api/signups/mine', data: params }),

  // 智能客服（大模型响应慢，单独放宽超时）
  chat: data => request({ url: '/api/chat', method: 'POST', data, timeout: 60000 }),

  // 行为埋点，供数据分析模块统计热度、趋势、漏斗
  track: data => request({ url: '/api/track', method: 'POST', data, silent: true })
}
