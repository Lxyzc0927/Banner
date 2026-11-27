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
  getBikes: params => request({ url: '/api/bikes', data: params }),
  getBike: id => request({ url: `/api/bikes/${id}` }),
  setFavorite: (id, on) => request({ url: `/api/bikes/${id}/favorite`, method: on ? 'POST' : 'DELETE' }),
  getFavorites: params => request({ url: '/api/favorites', data: params }),

  // 活动与报名
  getActivities: params => request({ url: '/api/activities', data: params }),
  getActivity: id => request({ url: `/api/activities/${id}` }),
  signup: (id, data) => request({ url: `/api/activities/${id}/signup`, method: 'POST', data, loading: '提交中' }),
  getMySignups: params => request({ url: '/api/signups/mine', data: params }),

  // 智能客服（大模型响应慢，单独放宽超时）
  chat: data => request({ url: '/api/chat', method: 'POST', data, timeout: 60000 }),

  // 行为埋点，供数据分析模块统计热度、趋势、漏斗
  track: data => request({ url: '/api/track', method: 'POST', data, silent: true })
}
