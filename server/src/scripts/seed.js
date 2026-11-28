'use strict';

/**
 * 初始化演示数据：后台账号、C 端用户、活动。
 * 用法：
 *   npm run seed             # 幂等补齐，不删除已有数据
 *   npm run db:reset         # 删除 server/data/app.db 后重建
 */
const { config } = require('../config');
const { openDatabase, resetDatabase } = require('../db');
const { hashPassword } = require('../auth');
const { nowIso, localDay, addDays } = require('../time');

function cnIso(day, time) {
  return new Date(`${day}T${time}+08:00`).toISOString();
}

function ensureAdmin(db, { username, password, displayName, role }) {
  const existing = db.prepare('SELECT id FROM admin_user WHERE username = ?').get(username);
  if (existing) return existing.id;
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO admin_user(username, password_hash, display_name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(username, hashPassword(password), displayName, role, now, now);
  return Number(info.lastInsertRowid);
}

function ensureUser(db, user) {
  const existing = db.prepare('SELECT id FROM c_user WHERE openid = ?').get(user.openid);
  if (existing) return existing.id;
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO c_user(openid, nickname, phone, status, disabled_reason, disabled_at, last_login_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      user.openid,
      user.nickname,
      user.phone || null,
      user.status || 'active',
      user.status === 'disabled' ? user.reason || '演示：违规刷单' : null,
      user.status === 'disabled' ? now : null,
      now,
      user.createdAt || now,
      now,
    );
  return Number(info.lastInsertRowid);
}

function ensureActivity(db, adminId, activity) {
  const existing = db.prepare('SELECT id FROM activity WHERE title = ?').get(activity.title);
  if (existing) return existing.id;
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO activity(title, subtitle, cover, description, location,
                            start_at, end_at, signup_start_at, signup_end_at,
                            quota, status, version, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(
      activity.title,
      activity.subtitle,
      activity.cover,
      activity.description,
      activity.location,
      activity.startAt,
      activity.endAt,
      activity.signupStartAt,
      activity.signupEndAt,
      activity.quota,
      activity.status,
      adminId,
      now,
      now,
    );
  return Number(info.lastInsertRowid);
}

function seed() {
  const reset = process.argv.includes('--reset');
  const db = reset ? resetDatabase() : openDatabase();

  const superId = ensureAdmin(db, {
    username: config.seed.adminUsername,
    password: config.seed.adminPassword,
    displayName: '超级管理员',
    role: 'super_admin',
  });
  const operatorId = ensureAdmin(db, {
    username: config.seed.operatorUsername,
    password: config.seed.operatorPassword,
    displayName: '运营小王',
    role: 'operator',
  });

  const today = localDay();
  const users = [
    ['u01', '阿远', '13800000001', 'active'],
    ['u02', '滨海骑士', '13800000002', 'active'],
    ['u03', '小满', '13800000003', 'active'],
    ['u04', '老周爱骑车', '13800000004', 'active'],
    ['u05', 'Luna', '13800000005', 'active'],
    ['u06', '海风', '13800000006', 'active'],
    ['u07', '阿凯', '13800000007', 'active'],
    ['u08', 'Nina', '13800000008', 'active'],
    ['u09', '山道弯弯', '13800000009', 'active'],
    ['u10', '小赵', '13800000010', 'active'],
    ['u11', '测试禁用用户', '13800000011', 'disabled'],
    ['u12', '未授权手机号', null, 'active'],
  ];
  for (let i = 0; i < users.length; i += 1) {
    const [suffix, nickname, phone, status] = users[i];
    ensureUser(db, {
      openid: `mock_seed_${suffix}`,
      nickname,
      phone,
      status,
      createdAt: cnIso(addDays(today, -20 + i), '10:00:00'),
    });
  }

  const activities = [
    {
      title: 'GS 探秘之旅 · 大连站',
      subtitle: '和 GS 一起，去看海与山',
      cover: '/admin/assets/cover-gs.svg',
      description: '两天一夜的摩旅体验，含车辆租赁、保险与领队服务。报名成功后请保持手机畅通，工作人员会在活动前三天联系确认。',
      location: '大连 · 东港机车营地',
      startAt: cnIso(addDays(today, 2), '09:00:00'),
      endAt: cnIso(addDays(today, 4), '18:00:00'),
      signupStartAt: cnIso(addDays(today, -3), '09:00:00'),
      signupEndAt: cnIso(addDays(today, 1), '18:00:00'),
      quota: 120,
      status: 'published',
    },
    {
      title: 'R 1250 GS 试驾日',
      subtitle: '一次把公路与烂路都试个够',
      cover: '/admin/assets/cover-testride.svg',
      description: '专业教练带队，提供全套护具。需持有效摩托车驾驶证，试驾当天请提前 15 分钟到场签到。',
      location: '大连 · 金石滩试驾场',
      startAt: cnIso(addDays(today, 7), '09:30:00'),
      endAt: cnIso(addDays(today, 7), '17:00:00'),
      signupStartAt: cnIso(addDays(today, -1), '09:00:00'),
      signupEndAt: cnIso(addDays(today, 5), '18:00:00'),
      quota: 60,
      status: 'published',
    },
    {
      title: '骑士安全训练营',
      subtitle: '把每一次刹车，都练成肌肉记忆',
      cover: '/admin/assets/cover-safety.svg',
      description: '城市道路风险预判、紧急制动、低速控车三个模块，完成训练颁发结业证书。',
      location: '大连 · 星海机车公园',
      startAt: cnIso(today, '13:00:00'),
      endAt: cnIso(addDays(today, 1), '17:30:00'),
      signupStartAt: cnIso(addDays(today, -10), '09:00:00'),
      signupEndAt: cnIso(today, '11:00:00'),
      quota: 40,
      status: 'published',
    },
    {
      title: '秋季骑行装备特惠',
      subtitle: '头盔、骑行服、手套一站配齐',
      cover: '/admin/assets/cover-gear.svg',
      description: '到店出示报名成功页面，即可领取装备礼包与 200 元保养券。数量有限，先到先得。',
      location: '大连 · 高新店',
      startAt: cnIso(addDays(today, -2), '10:00:00'),
      endAt: cnIso(addDays(today, 1), '20:00:00'),
      signupStartAt: cnIso(addDays(today, -7), '10:00:00'),
      signupEndAt: cnIso(addDays(today, 1), '18:00:00'),
      quota: 200,
      status: 'published',
    },
    {
      title: '新年首骑 · 滨海公路',
      subtitle: '用第一箱油，迎接新的一年',
      cover: '/admin/assets/cover-coast.svg',
      description: '全程约 120 公里，编队骑行，中途设置两个补给点。活动免费，保险与午餐自理。',
      location: '大连 · 滨海公路东段',
      startAt: cnIso(addDays(today, 14), '08:00:00'),
      endAt: cnIso(addDays(today, 14), '16:00:00'),
      signupStartAt: cnIso(addDays(today, 1), '09:00:00'),
      signupEndAt: cnIso(addDays(today, 10), '18:00:00'),
      quota: 100,
      status: 'published',
    },
    {
      title: '门店咖啡品鉴会',
      subtitle: '聊聊车，也聊聊路上的故事',
      cover: '/admin/assets/cover-coffee.svg',
      description: '小规模车友聚会，限 30 人。草稿状态，用于演示“发布 / 下架”流程。',
      location: '大连 · 中山店',
      startAt: cnIso(addDays(today, 10), '14:00:00'),
      endAt: cnIso(addDays(today, 10), '17:00:00'),
      signupStartAt: cnIso(addDays(today, -1), '09:00:00'),
      signupEndAt: cnIso(addDays(today, 8), '18:00:00'),
      quota: 30,
      status: 'draft',
    },
    {
      title: '旧车置换专场',
      subtitle: '让旧车，成为下一段旅程的起点',
      cover: '/admin/assets/cover-trade.svg',
      description: '已下架活动，用于演示下架后 C 端不可见、不可报名。',
      location: '大连 · 甘井子店',
      startAt: cnIso(addDays(today, -5), '09:00:00'),
      endAt: cnIso(addDays(today, 3), '18:00:00'),
      signupStartAt: cnIso(addDays(today, -15), '09:00:00'),
      signupEndAt: cnIso(addDays(today, 1), '18:00:00'),
      quota: 50,
      status: 'offline',
    },
    {
      title: '往期 · 海岸线骑行日',
      subtitle: '已结束活动，用于分析历史趋势',
      cover: '/admin/assets/cover-coast.svg',
      description: '往期活动数据，报名已结束，C 端默认列表不可见。',
      location: '大连 · 旅顺南路',
      startAt: cnIso(addDays(today, -22), '08:00:00'),
      endAt: cnIso(addDays(today, -21), '16:00:00'),
      signupStartAt: cnIso(addDays(today, -35), '09:00:00'),
      signupEndAt: cnIso(addDays(today, -23), '18:00:00'),
      quota: 300,
      status: 'published',
    },
    {
      title: '往期 · 城市通勤训练营',
      subtitle: '已结束活动，用于分析历史趋势',
      cover: '/admin/assets/cover-safety.svg',
      description: '往期活动数据，报名已结束，C 端默认列表不可见。',
      location: '大连 · 梭鱼湾',
      startAt: cnIso(addDays(today, -15), '09:00:00'),
      endAt: cnIso(addDays(today, -14), '17:00:00'),
      signupStartAt: cnIso(addDays(today, -28), '09:00:00'),
      signupEndAt: cnIso(addDays(today, -16), '18:00:00'),
      quota: 240,
      status: 'published',
    },
    {
      title: '往期 · 夏季装备内购会',
      subtitle: '已结束活动，用于分析历史趋势',
      cover: '/admin/assets/cover-gear.svg',
      description: '往期活动数据，报名已结束，C 端默认列表不可见。',
      location: '大连 · 高新店',
      startAt: cnIso(addDays(today, -8), '10:00:00'),
      endAt: cnIso(addDays(today, -7), '20:00:00'),
      signupStartAt: cnIso(addDays(today, -20), '09:00:00'),
      signupEndAt: cnIso(addDays(today, -9), '18:00:00'),
      quota: 200,
      status: 'published',
    },
  ];
  for (const activity of activities) ensureActivity(db, superId, activity);

  const counts = {
    admins: db.prepare('SELECT COUNT(*) AS c FROM admin_user').get().c,
    users: db.prepare('SELECT COUNT(*) AS c FROM c_user').get().c,
    activities: db.prepare('SELECT COUNT(*) AS c FROM activity').get().c,
    signups: db.prepare('SELECT COUNT(*) AS c FROM signup').get().c,
    events: db.prepare('SELECT COUNT(*) AS c FROM visit_event').get().c,
  };

  console.log('✔ 初始化完成');
  console.log(`  数据库: ${config.dbPath}`);
  console.log(`  后台账号: ${config.seed.adminUsername}（超级管理员）、${config.seed.operatorUsername}（运营管理员）`);
  console.log(`  数据量: 管理员 ${counts.admins} · C 端用户 ${counts.users} · 活动 ${counts.activities} · 报名 ${counts.signups} · 行为事件 ${counts.events}`);
  if (counts.events === 0) console.log('  下一步: npm run mock -- --clear  生成模拟访问数据');
  db.close();
}

try {
  seed();
} catch (error) {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
}
