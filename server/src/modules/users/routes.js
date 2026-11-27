'use strict';

const { errors } = require('../../errors');
const { requireAdmin, requireUser, publicUser } = require('../../middleware');
const { hasPermission } = require('../../auth');
const { pagination, string, enumValue, integer, asObject } = require('../../validate');
const { nowIso } = require('../../time');
const { audit } = require('../../audit');

function phoneView(ctx, phone) {
  if (!phone) return phone;
  if (hasPermission(ctx.admin?.role, 'activity:export')) return phone;
  return String(phone).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

function adminUserView(row) {
  return {
    id: row.id,
    openid: row.openid,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    status: row.status,
    disabledReason: row.disabled_reason,
    disabledAt: row.disabled_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    signupCount: row.signup_count ?? 0,
  };
}

function register(router) {
  router.get('/api/admin/users', requireAdmin('user:read'), (ctx) => {
    const { page, pageSize, offset } = pagination(ctx.query);
    const keyword = string(ctx.query.keyword, 'keyword', { max: 50 });
    const status = enumValue(ctx.query.status, 'status', ['active', 'disabled'], { defaultValue: null });

    const where = [];
    const params = [];
    if (keyword) {
      where.push('(u.nickname LIKE ? OR u.phone LIKE ? OR u.openid LIKE ?)');
      const like = `%${keyword}%`;
      params.push(like, like, like);
    }
    if (status) {
      where.push('u.status = ?');
      params.push(status);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = ctx.db
      .prepare(`SELECT COUNT(*) AS count FROM c_user u ${whereSql}`)
      .get(...params).count;
    const rows = ctx.db
      .prepare(
        `SELECT u.*,
                (SELECT COUNT(*) FROM signup s WHERE s.user_id = u.id AND s.status = 'confirmed') AS signup_count
         FROM c_user u
         ${whereSql}
         ORDER BY u.created_at DESC, u.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset);

    ctx.ok({
      list: rows.map(adminUserView),
      total,
      page,
      pageSize,
      summary: {
        active: ctx.db.prepare("SELECT COUNT(*) AS c FROM c_user WHERE status = 'active'").get().c,
        disabled: ctx.db.prepare("SELECT COUNT(*) AS c FROM c_user WHERE status = 'disabled'").get().c,
      },
    });
  });

  router.get('/api/admin/users/:id', requireAdmin('user:read'), (ctx) => {
    const id = integer(ctx.params.id, '用户 id', { required: true, min: 1 });
    const row = ctx.db
      .prepare(
        `SELECT u.*,
                (SELECT COUNT(*) FROM signup s WHERE s.user_id = u.id AND s.status = 'confirmed') AS signup_count
         FROM c_user u WHERE u.id = ?`,
      )
      .get(id);
    if (!row) throw errors.notFound('用户不存在');

    const signups = ctx.db
      .prepare(
        `SELECT s.id, s.signup_no, s.status, s.created_at, s.cancelled_at,
                a.id AS activity_id, a.title AS activity_title, a.start_at, a.end_at, a.status AS activity_status
         FROM signup s JOIN activity a ON a.id = s.activity_id
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC
         LIMIT 10`,
      )
      .all(id);

    ctx.ok({
      user: adminUserView(row),
      signups: signups.map((s) => ({
        id: s.id,
        signupNo: s.signup_no,
        status: s.status,
        createdAt: s.created_at,
        cancelledAt: s.cancelled_at,
        activity: {
          id: s.activity_id,
          title: s.activity_title,
          startAt: s.start_at,
          endAt: s.end_at,
          status: s.activity_status,
        },
      })),
    });
  });

  router.patch('/api/admin/users/:id/status', requireAdmin('user:write'), (ctx) => {
    const id = integer(ctx.params.id, '用户 id', { required: true, min: 1 });
    const body = asObject(ctx.body || {});
    const status = enumValue(body.status, 'status', ['active', 'disabled'], { required: true });
    const reason = string(body.reason, 'reason', { max: 200 });

    const user = ctx.db.prepare('SELECT * FROM c_user WHERE id = ?').get(id);
    if (!user) throw errors.notFound('用户不存在');
    if (status === 'disabled' && !reason) throw errors.badRequest('禁用用户时必须填写原因');

    if (status === 'disabled' && user.status === 'disabled') {
      const fresh = ctx.db
        .prepare(
          `SELECT u.*,
                  (SELECT COUNT(*) FROM signup s WHERE s.user_id = u.id AND s.status = 'confirmed') AS signup_count
           FROM c_user u WHERE u.id = ?`,
        )
        .get(id);
      ctx.ok({ user: adminUserView(fresh), changed: false });
      return;
    }
    if (status === 'active' && user.status === 'active') {
      const fresh = ctx.db
        .prepare(
          `SELECT u.*,
                  (SELECT COUNT(*) FROM signup s WHERE s.user_id = u.id AND s.status = 'confirmed') AS signup_count
           FROM c_user u WHERE u.id = ?`,
        )
        .get(id);
      ctx.ok({ user: adminUserView(fresh), changed: false });
      return;
    }

    const now = nowIso();
    ctx.db
      .prepare(
        `UPDATE c_user SET status = ?, disabled_reason = ?, disabled_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(status, status === 'disabled' ? reason : null, status === 'disabled' ? now : null, now, id);

    audit(ctx, status === 'disabled' ? 'user.disable' : 'user.enable', {
      targetType: 'c_user',
      targetId: id,
      detail: { reason: reason || null },
    });

    const fresh = ctx.db
      .prepare(
        `SELECT u.*,
                (SELECT COUNT(*) FROM signup s WHERE s.user_id = u.id AND s.status = 'confirmed') AS signup_count
         FROM c_user u WHERE u.id = ?`,
      )
      .get(id);
    ctx.ok({ user: adminUserView(fresh), changed: true });
  });

  router.get('/api/admin/users/:id/signups', requireAdmin('user:read'), (ctx) => {
    const id = integer(ctx.params.id, '用户 id', { required: true, min: 1 });
    const { page, pageSize, offset } = pagination(ctx.query);
    const user = ctx.db.prepare('SELECT id FROM c_user WHERE id = ?').get(id);
    if (!user) throw errors.notFound('用户不存在');
    const total = ctx.db.prepare('SELECT COUNT(*) AS count FROM signup WHERE user_id = ?').get(id).count;
    const rows = ctx.db
      .prepare(
        `SELECT s.*, a.title AS activity_title, a.start_at, a.end_at
         FROM signup s JOIN activity a ON a.id = s.activity_id
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(id, pageSize, offset);
    ctx.ok({
      list: rows.map((s) => ({
        id: s.id,
        signupNo: s.signup_no,
        status: s.status,
        // operator 只看脱敏手机号；完整号码仅 super_admin（activity:export）
        phone: phoneView(ctx, s.phone),
        remark: s.remark,
        createdAt: s.created_at,
        cancelledAt: s.cancelled_at,
        activity: { id: s.activity_id, title: s.activity_title, startAt: s.start_at, endAt: s.end_at },
      })),
      total,
      page,
      pageSize,
    });
  });

  // C 端：我的报名；同时兼容小程序现有的 /api/signups/mine
  const mySignupsHandler = (ctx) => {
    const { page, pageSize, offset } = pagination(ctx.query);
    const total = ctx.db.prepare('SELECT COUNT(*) AS count FROM signup WHERE user_id = ?').get(ctx.user.id).count;
    const rows = ctx.db
      .prepare(
        `SELECT s.*, a.title AS activity_title, a.cover, a.location, a.start_at, a.end_at
         FROM signup s JOIN activity a ON a.id = s.activity_id
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(ctx.user.id, pageSize, offset);
    ctx.ok({
      list: rows.map((s) => ({
        id: s.id,
        signupNo: s.signup_no,
        status: s.status,
        phone: s.phone,
        remark: s.remark,
        createdAt: s.created_at,
        cancelledAt: s.cancelled_at,
        activity: {
          id: s.activity_id,
          title: s.activity_title,
          cover: s.cover,
          location: s.location,
          startAt: s.start_at,
          endAt: s.end_at,
        },
      })),
      total,
      page,
      pageSize,
    });
  };

  router.get('/api/users/me/signups', requireUser, mySignupsHandler);
  router.get('/api/signups/mine', requireUser, mySignupsHandler);

  router.get('/api/users/me', requireUser, (ctx) => {
    ctx.ok({ user: publicUser(ctx.user) });
  });
}

module.exports = { register };
