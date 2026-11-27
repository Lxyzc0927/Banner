/* 把后台配置的跳转链接（如 /bike/1、/activity/2）转换成小程序页面 */
const TAB_PAGES = ['/pages/home/index', '/pages/bike/list', '/pages/activity/list', '/pages/mine/index']

function toPage(link) {
  if (!link) return ''
  let m = link.match(/^\/bike\/(\d+)$/)
  if (m) return `/pages/bike/detail?id=${m[1]}`
  m = link.match(/^\/activity\/(\d+)$/)
  if (m) return `/pages/activity/detail?id=${m[1]}`
  if (link === '/bike') return '/pages/bike/list'
  if (link === '/activity') return '/pages/activity/list'
  if (link.indexOf('/pages/') === 0) return link
  return ''
}

function open(link) {
  const url = toPage(link)
  if (!url) return false
  if (TAB_PAGES.indexOf(url.split('?')[0]) > -1) wx.switchTab({ url })
  else wx.navigateTo({ url })
  return true
}

module.exports = { toPage, open }
