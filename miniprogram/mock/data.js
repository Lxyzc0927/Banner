/* 模拟数据：字段与管理后台 admin/js/data.js 保持一致（状态值、跳转链接格式等） */
const CATEGORIES = ['街车', '跑车', '踏板', '巡航', '越野', 'ADV 探险']
const SERIES = ['风行', '疾影', '悦途', '雷霆', '远征', '星辰']
const CC_LIST = [150, 250, 300, 400, 500]

const CATEGORY_DESC = {
  '街车': '直立坐姿、操控灵活，通勤和周末短途都很合适。',
  '跑车': '前倾坐姿、全包围空气动力学套件，追求速度与弯道表现。',
  '踏板': '无需换挡、带储物空间，城市代步省心省力。',
  '巡航': '低座高、长轴距，适合长途巡航与双人出行。',
  '越野': '长行程悬挂、高离地间隙，能应对碎石与泥地。',
  'ADV 探险': '兼顾铺装与非铺装路面，适合长途摩旅。'
}

const bikes = Array.from({ length: 24 }, (_, i) => {
  const cc = CC_LIST[i % 5]
  const category = CATEGORIES[i % 6]
  const series = SERIES[i % 6]
  return {
    id: i + 1,
    name: `XX ${series} ${cc}`,
    category,
    cc,
    price: Math.round((9800 + cc * 60 + (i % 6) * 2000) / 100) * 100,
    power: Math.round(cc * 0.085 * 10) / 10,
    torque: Math.round(cc * 0.09),
    weight: 120 + Math.round(cc / 5) + (category === '越野' ? -15 : category === '巡航' ? 30 : 0),
    seatHeight: category === '巡航' ? 700 : 780 + (i % 4) * 15,
    tank: 10 + (i % 5) * 2,
    tags: [cc <= 250 ? '新手友好' : '动力充沛', category === '踏板' ? '通勤代步' : '支持试驾'],
    cover: '',
    images: [],
    desc: `XX ${series} ${cc} 是一款${cc}cc ${category}。${CATEGORY_DESC[category]}配备 ABS 防抱死与 LED 全光源，支持手机互联仪表。`,
    hot: i % 4 === 1,
    status: i === 23 ? '下架' : '上架'
  }
})

const banners = [
  { id: 1, title: '春季新款上市', image: '', link: '/bike/1', status: '上架', sort: 1 },
  { id: 2, title: '骑行季活动来袭', image: '', link: '/activity/1', status: '上架', sort: 2 },
  { id: 3, title: '会员专属优惠', image: '', link: '', status: '下架', sort: 3 }
]

const news = [
  { id: 1, title: '新车资讯：XX 风行 300 正式发布', summary: '全新风行 300 搭载水冷单缸发动机，售价 29,800 元起，即日起可到店试驾。', status: '上架', date: '2026-11-20' },
  { id: 2, title: '保养小贴士：冬季骑行注意', summary: '气温低于 5℃ 时注意胎压与电瓶状态，长时间停放建议断开电瓶负极。', status: '上架', date: '2026-11-18' },
  { id: 3, title: '门店公告：周末延长营业', summary: '12 月起周末营业时间调整为 9:00–20:00。', status: '下架', date: '2026-11-10' }
]

// 状态值与后台一致："未开始" 为未发布，小程序不展示
const activities = [
  { id: 1, title: '秋季骑行拉力赛', date: '2026-11-28 08:30', place: '城西郊野公园东门集合', quota: 50, signup: 42, status: '进行中', desc: '全程约 80 公里，含山路与乡道，需自备车辆与全盔。完赛赠送纪念徽章。' },
  { id: 2, title: '新手安全驾驶培训', date: '2026-12-02 14:00', place: 'XX 摩托旗舰店培训场', quota: 30, signup: 18, status: '进行中', desc: '持证教练讲解基础操控、紧急制动与过弯技巧，现场提供培训车辆与护具。' },
  { id: 3, title: '摩托车文化节', date: '2026-12-10 10:00', place: '市会展中心 3 号馆', quota: 100, signup: 0, status: '未开始', desc: '新车展示、改装车评比与骑行装备市集。' },
  { id: 4, title: '冬季保养讲座', date: '2026-11-15 19:00', place: 'XX 摩托旗舰店二楼', quota: 25, signup: 25, status: '已结束', desc: '讲解冬季机油选择、电瓶养护与防冻要点。' },
  { id: 5, title: '城市巡游活动', date: '2026-12-20 09:00', place: '市民广场南侧', quota: 60, signup: 8, status: '进行中', desc: '车友集体巡游城市主干道，全程交警协同，结束后合影留念。' },
  { id: 6, title: '新车品鉴会', date: '2026-12-06 15:00', place: 'XX 摩托旗舰店', quota: 20, signup: 20, status: '进行中', desc: '风行 300 静态品鉴与产品经理答疑，到场即送骑行手套。' }
]

module.exports = { CATEGORIES, CC_LIST, bikes, banners, news, activities }
