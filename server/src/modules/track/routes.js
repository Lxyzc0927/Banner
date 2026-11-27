'use strict';

const crypto = require('node:crypto');
const { optionalUser } = require('../../middleware');
const { asObject, string, integer } = require('../../validate');
const { nowIso, localDay } = require('../../time');
const { sha256 } = require('../../auth');

/**
 * 小程序行为埋点：POST /api/track
 * 前端只传 { event, ts, ...props }，不强制 sessionId。
 * 后端按“登录用户 + 当天”或“IP + UA + 当天”生成会话，保证同一用户当天的
 * view → signup_click → signup_success 落在同一个 session 里，能被漏斗统计。
 */
const EVENT_ACTIONS = new Set([
  'view',
  'signup_click',
  'signup_success',
  'bike_sort',
  'bike_price_filter',
  'bike_tag_filter',
]);

const VIEW_MODULES = {
  home: { module: 'home', page: 'home' },
  bike: { module: 'bike', page: 'bike_list' },
  bike_detail: { module: 'bike', page: 'bike_detail', target: 'bikeId' },
  activity: { module: 'activity', page: 'activity_list' },
  activity_detail: { module: 'activity', page: 'activity_detail', target: 'activityId' },
  mine: { module: 'mine', page: 'mine' },
  chat: { module: 'chat', page: 'chat' },
};

function mapEvent(body) {
  const event = string(body.event, 'event', { required: true, max: 40 });
  if (!EVENT_ACTIONS.has(event)) return null;

  if (event === 'view') {
    const view = VIEW_MODULES[body.module];
    if (!view) return null;
    return {
      action: 'view',
      module: view.module,
      page: view.page,
      targetId: view.target ? integer(body[view.target], view.target, { min: 1, defaultValue: null }) : null,
    };
  }

  if (event === 'signup_click' || event === 'signup_success') {
    return {
      action: event,
      module: 'activity',
      page: 'activity_detail',
      targetId: integer(body.activityId, 'activityId', { min: 1, defaultValue: null }),
    };
  }

  return {
    action: event,
    module: 'bike',
    page: 'bike_list',
    targetId: null,
  };
}

function register(router) {
  router.post('/api/track', optionalUser, (ctx) => {
    const body = asObject(ctx.body || {});
    const mapped = mapEvent(body);
    if (!mapped) return ctx.ok({ tracked: false });

    const deviceKey = sha256(`${ctx.ip}|${ctx.req.headers['user-agent'] || ''}|${localDay()}`).slice(0, 16);
    const actor = ctx.user ? `u${ctx.user.id}` : `v${deviceKey}`;
    // 会话按设备 + 当天生成，不随登录切换；否则“点击报名（未登录）→ 登录 → 报名成功”会被拆成两个 session。
    const sessionId = string(body.sessionId, 'sessionId', { max: 80 }) || `s_${deviceKey}`;
    const eventId = `evt_track_${crypto.randomBytes(10).toString('hex')}`;

    ctx.db
      .prepare(
        `INSERT INTO visit_event(event_id, visitor_id, user_id, session_id, module, action, page, target_id, channel, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        eventId,
        actor,
        ctx.user?.id ?? null,
        sessionId,
        mapped.module,
        mapped.action,
        mapped.page,
        mapped.targetId,
        string(body.channel, 'channel', { max: 30 }) || 'wechat',
        integer(body.durationMs, 'durationMs', { min: 0, max: 3600000, defaultValue: 0 }),
        nowIso(),
      );

    ctx.ok({ tracked: true, eventId });
  });
}

module.exports = { register, mapEvent };
