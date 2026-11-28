'use strict';

const { randomId, sha256 } = require('../../auth');
const { nowIso, localDay } = require('../../time');
const { string, integer } = require('../../validate');

function recordEvent(ctx, event, { sessionId, channel, durationMs } = {}, eventId = randomId('evt_track_')) {
  // 默认会话沿用设备和当天的标识，登录前的浏览、点击和登录后的报名仍可关联。
  const deviceKey = sha256(`${ctx.ip}|${ctx.req.headers['user-agent'] || ''}|${localDay()}`).slice(0, 16);
  const actor = ctx.user ? `u${ctx.user.id}` : `v${deviceKey}`;
  const session = string(sessionId, 'sessionId', { max: 80 }) || `s_${deviceKey}`;
  ctx.db.prepare(
    `INSERT INTO visit_event(event_id, visitor_id, user_id, session_id, module, action, page, target_id, channel, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    eventId, actor, ctx.user?.id ?? null, session, event.module, event.action, event.page, event.targetId,
    string(channel, 'channel', { max: 30 }) || 'wechat',
    integer(durationMs, 'durationMs', { min: 0, max: 3600000, defaultValue: 0 }),
    nowIso(),
  );
  return eventId;
}

module.exports = { recordEvent };
