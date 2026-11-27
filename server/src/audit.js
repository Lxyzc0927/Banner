'use strict';

const { nowIso } = require('./time');

/** 记录后台关键操作；审计失败不影响主流程。 */
function audit(ctx, action, { targetType = null, targetId = null, detail = null } = {}) {
  try {
    const actorType = ctx.admin ? 'admin' : ctx.user ? 'user' : 'anonymous';
    const actorId = ctx.admin?.id ?? ctx.user?.id ?? null;
    ctx.db
      .prepare(
        `INSERT INTO audit_log(actor_type, actor_id, action, target_type, target_id, detail, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        actorType,
        actorId,
        action,
        targetType,
        targetId,
        detail === null ? null : JSON.stringify(detail),
        ctx.ip || null,
        nowIso(),
      );
  } catch (error) {
    console.warn('[audit] failed:', error.message);
  }
}

module.exports = { audit };
