/* 模拟数据：后端接口就绪后，把这里替换成 fetch 请求即可 */
const DB = {
  banners: [
    { id: 1, title: '春季新款上市', image: '', link: '/bike/1', status: '上架', sort: 1 },
    { id: 2, title: '骑行季活动来袭', image: '', link: '/activity/1', status: '上架', sort: 2 },
    { id: 3, title: '会员专属优惠', image: '', link: '', status: '下架', sort: 3 }
  ],
  news: [
    { id: 1, title: '新车资讯：XX300 正式发布', status: '上架', date: '2026-11-20' },
    { id: 2, title: '保养小贴士：冬季骑行注意', status: '下架', date: '2026-11-18' }
  ],
  bikes: Array.from({ length: 24 }, (_, i) => ({
    id: i + 1,
    name: `摩托车型 ${String(i + 1).padStart(2, '0')}`,
    price: 19800 + i * 1300,
    cc: [150, 250, 300, 400, 500][i % 5],
    status: i % 4 === 0 ? '下架' : '上架'
  })),
  activities: [
    { id: 1, name: '秋季骑行拉力赛', signup: 42, quota: 50, status: '进行中', date: '2026-11-28' },
    { id: 2, name: '新手安全驾驶培训', signup: 18, quota: 30, status: '进行中', date: '2026-12-02' },
    { id: 3, name: '摩托车文化节', signup: 0, quota: 100, status: '未开始', date: '2026-12-10' },
    { id: 4, name: '冬季保养讲座', signup: 25, quota: 25, status: '已结束', date: '2026-11-15' },
    { id: 5, name: '城市巡游活动', signup: 8, quota: 60, status: '未开始', date: '2026-12-20' }
  ],
  signups: [
    { id: 1, activity: '秋季骑行拉力赛', name: '张三', phone: '138****0001', status: '已报名' },
    { id: 2, activity: '秋季骑行拉力赛', name: '李四', phone: '138****0002', status: '已报名' }
  ],
  admins: [
    { id: 1, name: 'admin', role: '超级管理员', status: '启用' },
    { id: 2, name: 'editor01', role: '内容编辑', status: '启用' }
  ],
  users: Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    name: `用户${String(i + 1).padStart(2, '0')}`,
    phone: `138****${String(i + 1).padStart(4, '0')}`,
    status: i % 5 === 0 ? '禁用' : '正常'
  })),
  analysis: {
    heat: [{ name: '首页', value: 3200 }, { name: '车型', value: 5800 }, { name: '活动', value: 2100 }, { name: '我的', value: 1400 }],
    trend: [120, 180, 150, 260, 310, 280, 420, 390, 460, 510, 480, 560],
    funnel: [{ name: '访问首页', value: 10000 }, { name: '查看车型', value: 6200 }, { name: '发起报名', value: 1800 }, { name: '报名成功', value: 960 }]
  }
};
