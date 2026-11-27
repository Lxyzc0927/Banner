'use strict';

/**
 * 生成可复现的模拟访问行为与报名数据。
 *
 * 用法：
 *   npm run mock -- --clear --days 30 --sessions 1800 --seed 42
 *
 * 设计要点：
 * 1. 先有行为、后有报名：只有真正走到“报名成功”的会话才写入 signup 表；
 * 2. 漏斗严格按 session 内的时间顺序生成；
 * 3. 名额、时间窗、重复报名、未授权手机号都会真实拦截；
 * 4. 固定随机种子，任何同学拉下来都能得到同一份数据。
 */
const { config } = require('../config');
const { openDatabase } = require('../db');
const { nowIso, localDay, addDays, eachDay } = require('../time');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    if (index === -1) return fallback;
    const value = args[index + 1];
    return value && !value.startsWith('--') ? value : true;
  };
  return {
    clear: args.includes('--clear'),
    days: Math.min(90, Math.max(7, Number(get('days', 30)))),
    sessions: Math.min(20000, Math.max(50, Number(get('sessions', 1800)))),
    seed: Number(get('seed', 42)),
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRandom(seed) {
  const random = mulberry32(seed);
  return {
    next: random,
    int(min, max) {
      return Math.floor(random() * (max - min + 1)) + min;
    },
    pick(array) {
      if (!array.length) return null;
      return array[Math.floor(random() * array.length)];
    },
    weighted(items) {
      const total = items.reduce((sum, item) => sum + item.weight, 0);
      let cursor = random() * total;
      for (const item of items) {
        cursor -= item.weight;
        if (cursor <= 0) return item.value;
      }
      return items[items.length - 1].value;
    },
  };
}

function dayStartIso(day) {
  return new Date(`${day}T00:00:00+08:00`).toISOString();
}

function timeInDay(day, hourFloat) {
  return new Date(Date.parse(dayStartIso(day)) + hourFloat * 3600 * 1000).toISOString();
}

function ensureMockUsers(db, random) {
  const existing = db.prepare("SELECT COUNT(*) AS c FROM c_user WHERE openid LIKE 'mock_gen_%'").get().c;
  if (existing >= 120) return 0;
  const names = ['追风', '海盐', '老K', '小北', '阿泽', 'Mia', '山猫', '豆包', '大鹏', '七喜'];
  const now = nowIso();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO c_user(openid, nickname, phone, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
  );
  let created = 0;
  for (let i = existing; i < 120; i += 1) {
    const suffix = String(i + 1).padStart(3, '0');
    const openid = `mock_gen_${suffix}`;
    const nickname = `${names[i % names.length]}${random.int(10, 99)}`;
    const phone = i % 19 === 0 ? null : `1390000${String(i + 1).padStart(4, '0').slice(-4)}`;
    const createdDay = addDays(localDay(), -random.int(3, 45));
    const info = insert.run(openid, nickname, phone, timeInDay(createdDay, random.int(8, 21)), now);
    if (info.changes) created += 1;
  }
  return created;
}

function ensureHistoricalActivities(db, adminId, random) {
  const existing = db.prepare("SELECT COUNT(*) AS c FROM activity WHERE title LIKE '模拟 · 往期%'").get().c;
  if (existing >= 3) return 0;
  const today = localDay();
  const now = nowIso();
  const insert = db.prepare(
    `INSERT INTO activity(title, subtitle, cover, description, location,
                          start_at, end_at, signup_start_at, signup_end_at,
                          quota, status, version, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?, ?, ?)`,
  );
  const themes = [
    ['模拟 · 往期海岸线骑行', '历史活动（模拟数据）', '/admin/assets/cover-coast.svg', '大连 · 滨海路'],
    ['模拟 · 往期门店开放日', '历史活动（模拟数据）', '/admin/assets/cover-coffee.svg', '大连 · 中山店'],
    ['模拟 · 往期安驾公开课', '历史活动（模拟数据）', '/admin/assets/cover-safety.svg', '大连 · 星海广场'],
  ];
  let created = 0;
  for (let i = 0; i < themes.length; i += 1) {
    const [title, subtitle, cover, location] = themes[i];
    if (db.prepare('SELECT id FROM activity WHERE title = ?').get(title)) continue;
    const startOffset = -25 + i * 8;
    const info = insert.run(
      title,
      subtitle,
      cover,
      '由模拟数据脚本生成，用于补齐历史趋势，不参与 C 端默认列表。',
      location,
      timeInDay(addDays(today, startOffset), 9),
      timeInDay(addDays(today, startOffset + 1), 17),
      timeInDay(addDays(today, startOffset - 12), 9),
      timeInDay(addDays(today, startOffset - 1), 18),
      400,
      adminId,
      now,
      now,
    );
    if (info.changes) created += 1;
  }
  return created;
}

function generate() {
  const options = parseArgs();
  if (!Number.isFinite(options.seed)) options.seed = 42;
  const random = makeRandom(options.seed);
  const db = openDatabase();
  const today = localDay();
  const days = eachDay(addDays(today, -(options.days - 1)), today);

  const admin = db.prepare("SELECT id FROM admin_user WHERE role = 'super_admin' ORDER BY id LIMIT 1").get();
  if (!admin) throw new Error('请先执行 npm run seed');
  const createdUsers = ensureMockUsers(db, random);
  const createdActivities = ensureHistoricalActivities(db, admin.id, random);

  if (options.clear) {
    db.exec('DELETE FROM signup WHERE is_mock = 1;');
    db.exec('DELETE FROM visit_event;');
    db.exec('DELETE FROM ai_insight;');
  }

  const users = db.prepare("SELECT * FROM c_user WHERE status = 'active'").all();
  const activities = db.prepare("SELECT * FROM activity WHERE status = 'published'").all();
  if (users.length === 0) throw new Error('没有可用的 C 端用户，请先执行 npm run seed');
  if (activities.length === 0) throw new Error('没有已发布活动，请先执行 npm run seed');

  const devices = Array.from({ length: 260 }, (_, i) => `device_${String(i + 1).padStart(3, '0')}`);
  const channels = [
    { value: 'wechat_search', weight: 34 },
    { value: 'share', weight: 26 },
    { value: 'qr', weight: 18 },
    { value: 'ad', weight: 12 },
    { value: 'direct', weight: 10 },
  ];

  const insertEvent = db.prepare(
    `INSERT INTO visit_event(event_id, visitor_id, user_id, session_id, module, action, page, target_id, channel, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertSignup = db.prepare(
    `INSERT INTO signup(signup_no, activity_id, user_id, phone, remark, status, is_mock, created_at)
     VALUES (?, ?, ?, ?, ?, 'confirmed', 1, ?)`,
  );
  const countConfirmed = db.prepare(
    "SELECT COUNT(*) AS c FROM signup WHERE activity_id = ? AND status = 'confirmed'",
  );
  const findSignup = db.prepare(
    "SELECT id FROM signup WHERE activity_id = ? AND user_id = ? AND status = 'confirmed'",
  );

  let eventCount = 0;
  let signupCount = 0;
  let sessionCount = 0;

  // 让趋势有周末高峰、近期回暖和一次活动脉冲，而不是一条直线。
  const weights = days.map((day) => {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    let weight = weekday === 0 || weekday === 6 ? 1.28 : 1;
    const distance = days.length - 1 - days.indexOf(day);
    if (distance <= 2) weight *= 1.22;
    if (distance === 9) weight *= 1.75;
    return weight;
  });
  const weightSum = weights.reduce((sum, value) => sum + value, 0);

  db.exec('BEGIN;');
  try {
    for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
      const day = days[dayIndex];
      const daySessions = Math.max(1, Math.round((options.sessions * weights[dayIndex]) / weightSum));
      for (let s = 0; s < daySessions; s += 1) {
        sessionCount += 1;
        const loggedIn = random.next() < 0.72;
        const user = loggedIn ? random.pick(users) : null;
        const visitorId = user ? `device_u${user.id}` : random.pick(devices);
        const sessionId = `sess_${day}_${s + 1}_${Math.floor(random.next() * 1e6).toString(36)}`;
        const channel = random.weighted(channels);
        let time = Date.parse(timeInDay(day, random.int(8, 21) + random.next()));
        const sessionEvents = [];
        const addEvent = (module, action, page, durationMs = 0, targetId = null) => {
          time += random.int(5, 75) * 1000;
          sessionEvents.push({
            eventId: `evt_${sessionId}_${sessionEvents.length + 1}`,
            module,
            action,
            page,
            targetId,
            durationMs,
            createdAt: new Date(time).toISOString(),
          });
        };

        addEvent('home', 'view', 'home', random.int(8, 90) * 1000);

        // 车型浏览支线
        if (random.next() < 0.56) {
          addEvent('bike', 'view', 'bike_list', random.int(12, 120) * 1000);
          if (random.next() < 0.58) {
            const bikeId = random.int(1, 20);
            addEvent('bike', 'view', 'bike_detail', random.int(20, 200) * 1000, bikeId);
            if (random.next() < 0.13) addEvent('bike', 'favorite', 'bike_detail', 0, bikeId);
          }
        }

        // 活动浏览与报名主漏斗
        if (random.next() < 0.52) {
          addEvent('activity', 'view', 'activity_list', random.int(10, 100) * 1000);
          if (random.next() < 0.66) {
            const sessionIso = new Date(time).toISOString();
            const eligibleActivities = activities.filter(
              (item) =>
                item.signup_start_at <= sessionIso &&
                item.signup_end_at >= sessionIso &&
                item.end_at >= sessionIso,
            );
            const available = user
              ? eligibleActivities.filter((item) => !findSignup.get(item.id, user.id))
              : eligibleActivities;
            const pool = available.length ? available : eligibleActivities.length ? eligibleActivities : activities;
            const activity = random.weighted(
              pool.map((item) => ({
                value: item,
                weight: item.end_at < nowIso() ? 1 : 3,
              })),
            );
            addEvent('activity', 'view', 'activity_detail', random.int(25, 220) * 1000, activity.id);
            if (random.next() < 0.46) {
              addEvent('activity', 'signup_click', 'activity_detail', 0, activity.id);
              const eligible = db
                .prepare(
                  `SELECT * FROM activity
                   WHERE id = ? AND status = 'published'
                     AND signup_start_at <= ? AND signup_end_at >= ? AND end_at >= ?`,
                )
                .get(
                  activity.id,
                  sessionEvents[sessionEvents.length - 1].createdAt,
                  sessionEvents[sessionEvents.length - 1].createdAt,
                  sessionEvents[sessionEvents.length - 1].createdAt,
                );
              let failReason = null;
              if (!user) {
                failReason = 'login_required';
              } else if (!user.phone) {
                failReason = 'phone_required';
              } else if (!eligible) {
                failReason = 'not_in_signup_window';
              } else if (findSignup.get(activity.id, user.id)) {
                failReason = 'already_signed_up';
              } else if (countConfirmed.get(activity.id).c >= activity.quota) {
                failReason = 'quota_full';
              }

              if (!failReason && random.next() < 0.74) {
                const now = new Date(time).toISOString();
                try {
                  const info = insertSignup.run(
                    `M${activity.id}-${Date.now().toString(36)}${random.int(1000, 9999)}`,
                    activity.id,
                    user.id,
                    user.phone,
                    random.next() < 0.18 ? '希望安排试驾车' : null,
                    now,
                  );
                  if (info.changes) {
                    signupCount += 1;
                    addEvent('activity', 'signup_success', 'activity_detail', 0, activity.id);
                  }
                } catch (error) {
                  if (!/UNIQUE constraint failed/i.test(error.message)) throw error;
                  failReason = 'already_signed_up';
                }
              } else if (!failReason) {
                failReason = 'user_abandoned';
              }
              if (failReason) {
                addEvent('activity', 'signup_fail', 'activity_detail', 0, activity.id);
              }
            }
          }
        }

        if (random.next() < 0.20) addEvent('mine', 'view', 'mine', random.int(8, 60) * 1000);
        if (random.next() < 0.12) addEvent('chat', 'view', 'chat', random.int(20, 180) * 1000);

        for (const event of sessionEvents) {
          insertEvent.run(
            event.eventId,
            visitorId,
            user ? user.id : null,
            sessionId,
            event.module,
            event.action,
            event.page,
            event.targetId,
            channel,
            event.durationMs,
            event.createdAt,
          );
          eventCount += 1;
        }
      }
    }
    db.exec('COMMIT;');
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // ignore
    }
    throw error;
  }

  console.log('✔ 模拟数据生成完成');
  console.log(`  随机种子: ${options.seed}`);
  console.log(`  时间范围: ${days[0]} ~ ${days[days.length - 1]}（${options.days} 天）`);
  console.log(`  新增用户: ${createdUsers} · 新增历史活动: ${createdActivities}`);
  console.log(`  会话: ${sessionCount} · 行为事件: ${eventCount} · 报名: ${signupCount}`);
  console.log(`  数据库: ${config.dbPath}`);
  console.log('  下一步: npm run report  生成统计报告与 AI 解读样例');
  db.close();
}

generate();
