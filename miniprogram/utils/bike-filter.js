// 从其他页面跳到「车型」tab 时携带的筛选条件。
// switchTab 不能带参数，所以先放在这里，车型列表 onShow 时取走。
let pending = null

module.exports = {
  // filter: { category } / { tier } / { tags: [..] }
  set(filter) { pending = filter },
  take() { const f = pending; pending = null; return f }
}
