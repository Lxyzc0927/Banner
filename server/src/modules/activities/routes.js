'use strict';

const crypto = require('node:crypto');
const { CODES, errors } = require('../../errors');
const { requireAdmin, requireUser, optionalUser } = require('../../middleware');
const { hasPermission } = require('../../auth');
const {
  asObject,
  string,
  integer,
  enumValue,
  isoDateTime,
  pagination,
} = require('../../validate');
const {
  nowIso,
  localDay,
  addDays,
  eachDay,
  formatLocalDateTime,
  timeModifier,
  localDayStartIso,
} = require('../../time');
const { transaction } = require('../../db');
const { audit } = require('../../audit');
const { toCsv } = require('../../csv');

const STATUSES = ['draft', 'published', 'offline'];
const STATUS_LABELS = { draft: '草稿', published: '已发布', offline: '已下架' };
const SIGNUP_STATUS_LABELS = { confirmed: '已报名', cancelled: '已取消' };

function phaseOf(activity, now = Date.now()) {
  if (activity.status === 'draft') return 'draft';
  if (activity.status === 'offline') return 'offline';
  if (now < Date.parse(activity.start_at)) return 'upcoming';
  if (now <= Date.parse(activity.end_at)) return 'ongoing';
  return 'ended';
}

function signupOpen(activity, now = Date.now()) {
  return (
    activity.status === 'published' &&
    now >= Date.parse(activity.signup_start_at) &&
    now <= Date.parse(activity.signup_end_at) &&
    now <= Date.parse(activity.end_at)
  );
}

function activityView(row, { signedUp = false, includeAdmin = false } = {}) {
  const now = Date.now();
  const signupCount = row.signup_count ?? 0;
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    cover: row.cover,
    description: row.description,
    location: row.location,
    startAt: row.start_at,
    endAt: row.end_at,
    signupStartAt: row.signup_start_at,
    signupEndAt: row.signup_end_at,
    quota: row.quota,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    phase: phaseOf(row, now),
    signupOpen: signupOpen(row, now),
    signupCount,
    remaining: Math.max(0, row.quota - signupCount),
    signedUp: Boolean(signedUp),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(includeAdmin
      ? {
          createdBy: row.created_by,
          createdByName: row.created_by_name || null,
          cancelledCount: row.cancelled_count ?? 0,
        }
      : {}),
  };
}

function readActivityInput(body, base = null) {
  const source = base
    ? {
        title: base.title,
        subtitle: base.subtitle,
        cover: base.cover,
        description: base.description,
        location: base.location,
        startAt: base.start_at,
        endAt: base.end_at,
        signupStartAt: base.signup_start_at,
        signupEndAt: base.signup_end_at,
        quota: base.quota,
        status: base.status,
      }
    : {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  const title = has('title') ? string(body.title, '活动标题', { required: true, min: 2, max: 80 }) : source.title;
  const subtitle = has('subtitle') ? string(body.subtitle, '副标题', { max: 120 }) : source.subtitle ?? null;
  const cover = has('cover') ? string(body.cover, '封面地址', { max: 500 }) : source.cover ?? null;
  const description = has('description')
    ? string(body.description, '活动详情', { max: 5000, trim: false })
    : source.description ?? null;
  const location = has('location') ? string(body.location, '活动地点', { max: 120 }) : source.location ?? null;
  const startAt = has('startAt')
    ? isoDateTime(body.startAt, '活动开始时间', { required: true })
    : source.startAt;
  const endAt = has('endAt') ? isoDateTime(body.endAt, '活动结束时间', { required: true }) : source.endAt;
  const signupStartAt = has('signupStartAt')
    ? isoDateTime(body.signupStartAt, '报名开始时间', { required: true })
    : source.signupStartAt;
  const signupEndAt = has('signupEndAt')
    ? isoDateTime(body.signupEndAt, '报名截止时间', { required: true })
    : source.signupEndAt;
  const quota = has('quota') ? integer(body.quota, '名额', { required: true, min: 1, max: 100000 }) : source.quota;
  const status = has('status') ? enumValue(body.status, 'status', STATUSES, { required: true }) : source.status || 'draft';

  if (!title) throw errors.badRequest('活动标题不能为空');
  if (!startAt || !endAt || !signupStartAt || !signupEndAt) throw errors.badRequest('活动时间与报名时间不能为空');
  if (!Number.isInteger(quota) || quota < 1) throw errors.badRequest('名额必须是大于 0 的整数');
  if (Date.parse(endAt) <= Date.parse(startAt)) throw errors.badRequest('活动结束时间必须晚于开始时间');
  if (Date.parse(signupEndAt) <= Date.parse(signupStartAt)) throw errors.badRequest('报名截止时间必须晚于报名开始时间');
  if (Date.parse(signupEndAt) > Date.parse(endAt)) throw errors.badRequest('报名截止时间不能晚于活动结束时间');
  if (status === 'published' && Date.parse(endAt) <= Date.now() && (!base || base.status !== 'published')) {
    throw errors.business(CODES.ACTIVITY_NOT_OPEN, '活动已结束，不能发布');
  }
  return { title, subtitle, cover, description, location, startAt, endAt, signupStartAt, signupEndAt, quota, status };
}

function getActivityOrThrow(db, id) {
  const row = db.prepare('SELECT * FROM activity WHERE id = ?').get(id);
  if (!row) throw errors.notFound('活动不存在');
  return row;
}

function signupNumber(activityId) {
  return `S${activityId}-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

/** 运营管理员只能看脱敏手机号；只有超级管理员可看完整手机号。 */
function phoneView(ctx, phone) {
  if (!phone) return phone;
  if (hasPermission(ctx.admin?.role, 'activity:export')) return phone;
  return String(phone).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

function register(router) {
  // ---------------- 后台：活动管理 ----------------
  router.get('/api/admin/activities', requireAdmin('activity:read'), (ctx) => {
    const { page, pageSize, offset } = pagination(ctx.query);
    const keyword = string(ctx.query.keyword, 'keyword', { max: 50 });
    const status = enumValue(ctx.query.status, 'status', STATUSES, { defaultValue: null });
    const phase = enumValue(ctx.query.phase, 'phase', ['upcoming', 'ongoing', 'ended'], { defaultValue: null });

    const where = [];
    const params = [];
    const now = nowIso();
    if (keyword) {
      where.push('(a.title LIKE ? OR a.location LIKE ?)');
      const like = `%${keyword}%`;
      params.push(like, like);
    }
    if (status) {
      where.push('a.status = ?');
      params.push(status);
    }
    if (phase === 'upcoming') {
      where.push("a.status = 'published' AND a.start_at > ?");
      params.push(now);
    } else if (phase === 'ongoing') {
      where.push("a.status = 'published' AND a.start_at <= ? AND a.end_at >= ?");
      params.push(now, now);
    } else if (phase === 'ended') {
      where.push('a.end_at < ?');
      params.push(now);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = ctx.db.prepare(`SELECT COUNT(*) AS count FROM activity a ${whereSql}`).get(...params).count;
    const rows = ctx.db
      .prepare(
        `SELECT a.*, u.display_name AS created_by_name,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'confirmed') AS signup_count,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'cancelled') AS cancelled_count
         FROM activity a
         LEFT JOIN admin_user u ON u.id = a.created_by
         ${whereSql}
         ORDER BY a.start_at DESC, a.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset);

    ctx.ok({
      list: rows.map((row) => activityView(row, { includeAdmin: true })),
      total,
      page,
      pageSize,
      summary: {
        draft: ctx.db.prepare("SELECT COUNT(*) AS c FROM activity WHERE status = 'draft'").get().c,
        published: ctx.db.prepare("SELECT COUNT(*) AS c FROM activity WHERE status = 'published'").get().c,
        offline: ctx.db.prepare("SELECT COUNT(*) AS c FROM activity WHERE status = 'offline'").get().c,
      },
    });
  });

  router.post('/api/admin/activities', requireAdmin('activity:write'), (ctx) => {
    const body = asObject(ctx.body || {});
    const input = readActivityInput(body);
    const now = nowIso();
    const info = ctx.db
      .prepare(
        `INSERT INTO activity(title, subtitle, cover, description, location,
                              start_at, end_at, signup_start_at, signup_end_at,
                              quota, status, version, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .run(
        input.title,
        input.subtitle,
        input.cover,
        input.description,
        input.location,
        input.startAt,
        input.endAt,
        input.signupStartAt,
        input.signupEndAt,
        input.quota,
        input.status,
        ctx.admin.id,
        now,
        now,
      );
    const row = ctx.db
      .prepare(
        `SELECT a.*, u.display_name AS created_by_name,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'confirmed') AS signup_count
         FROM activity a LEFT JOIN admin_user u ON u.id = a.created_by WHERE a.id = ?`,
      )
      .get(Number(info.lastInsertRowid));
    audit(ctx, 'activity.create', {
      targetType: 'activity',
      targetId: row.id,
      detail: { title: row.title, status: row.status },
    });
    ctx.json({ code: 0, message: '活动已创建', data: activityView(row, { includeAdmin: true }) }, 201);
  });

  router.get('/api/admin/activities/:id', requireAdmin('activity:read'), (ctx) => {
    const id = integer(ctx.params.id, '活动 id', { required: true, min: 1 });
    const row = ctx.db
      .prepare(
        `SELECT a.*, u.display_name AS created_by_name,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'confirmed') AS signup_count,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'cancelled') AS cancelled_count
         FROM activity a LEFT JOIN admin_user u ON u.id = a.created_by
         WHERE a.id = ?`,
      )
      .get(id);
    if (!row) throw errors.notFound('活动不存在');
    ctx.ok(activityView(row, { includeAdmin: true }));
  });

  router.put('/api/admin/activities/:id', requireAdmin('activity:write'), (ctx) => {
    const id = integer(ctx.params.id, '活动 id', { required: true, min: 1 });
    const body = asObject(ctx.body || {});
    const current = getActivityOrThrow(ctx.db, id);
    const expectedVersion = integer(body.version, 'version', { min: 1, defaultValue: null });
    if (expectedVersion !== null && expectedVersion !== current.version) {
      throw errors.business(CODES.CONCURRENT_UPDATE, '活动已被其他人修改，请刷新后重试');
    }
    const input = readActivityInput(body, current);
    const signedUp = ctx.db
      .prepare("SELECT COUNT(*) AS c FROM signup WHERE activity_id = ? AND status = 'confirmed'")
      .get(id).c;
    if (input.quota < signedUp) {
      throw errors.business(CODES.INVALID_STATE, `名额不能小于已报名人数（当前 ${signedUp} 人）`);
    }
    const now = nowIso();
    ctx.db
      .prepare(
        `UPDATE activity SET title = ?, subtitle = ?, cover = ?, description = ?, location = ?,
                start_at = ?, end_at = ?, signup_start_at = ?, signup_end_at = ?,
                quota = ?, status = ?, version = version + 1, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.title,
        input.subtitle,
        input.cover,
        input.description,
        input.location,
        input.startAt,
        input.endAt,
        input.signupStartAt,
        input.signupEndAt,
        input.quota,
        input.status,
        now,
        id,
      );
    const row = ctx.db
      .prepare(
        `SELECT a.*, u.display_name AS created_by_name,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'confirmed') AS signup_count,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'cancelled') AS cancelled_count
         FROM activity a LEFT JOIN admin_user u ON u.id = a.created_by WHERE a.id = ?`,
      )
      .get(id);
    audit(ctx, 'activity.update', {
      targetType: 'activity',
      targetId: id,
      detail: { status: row.status, quota: row.quota },
    });
    ctx.ok(activityView(row, { includeAdmin: true }));
  });

  router.post('/api/admin/activities/:id/publish', requireAdmin('activity:publish'), (ctx) => {
    const id = integer(ctx.params.id, '活动 id', { required: true, min: 1 });
    const row = getActivityOrThrow(ctx.db, id);
    if (row.status === 'published') throw errors.business(CODES.INVALID_STATE, '活动已经是发布状态');
    if (Date.parse(row.end_at) <= Date.now()) {
      throw errors.business(CODES.ACTIVITY_NOT_OPEN, '活动已结束，不能发布');
    }
    const now = nowIso();
    ctx.db
      .prepare("UPDATE activity SET status = 'published', version = version + 1, updated_at = ? WHERE id = ?")
      .run(now, id);
    audit(ctx, 'activity.publish', { targetType: 'activity', targetId: id });
    const fresh = ctx.db
      .prepare(
        `SELECT a.*, u.display_name AS created_by_name,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'confirmed') AS signup_count,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'cancelled') AS cancelled_count
         FROM activity a LEFT JOIN admin_user u ON u.id = a.created_by WHERE a.id = ?`,
      )
      .get(id);
    ctx.ok(activityView(fresh, { includeAdmin: true }));
  });

  router.post('/api/admin/activities/:id/offline', requireAdmin('activity:publish'), (ctx) => {
    const id = integer(ctx.params.id, '活动 id', { required: true, min: 1 });
    const row = getActivityOrThrow(ctx.db, id);
    if (row.status === 'offline') throw errors.business(CODES.INVALID_STATE, '活动已经下架');
    const now = nowIso();
    ctx.db
      .prepare("UPDATE activity SET status = 'offline', version = version + 1, updated_at = ? WHERE id = ?")
      .run(now, id);
    audit(ctx, 'activity.offline', { targetType: 'activity', targetId: id });
    const fresh = ctx.db
      .prepare(
        `SELECT a.*, u.display_name AS created_by_name,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'confirmed') AS signup_count,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'cancelled') AS cancelled_count
         FROM activity a LEFT JOIN admin_user u ON u.id = a.created_by WHERE a.id = ?`,
      )
      .get(id);
    ctx.ok(activityView(fresh, { includeAdmin: true }));
  });

  // ---------------- 后台：报名统计 / 名单 ----------------
  router.get('/api/admin/activities/:id/stats', requireAdmin('activity:read'), (ctx) => {
    const id = integer(ctx.params.id, '活动 id', { required: true, min: 1 });
    const activity = getActivityOrThrow(ctx.db, id);
    const counts = ctx.db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
           SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
           COUNT(*) AS total
         FROM signup WHERE activity_id = ?`,
      )
      .get(id);
    const confirmed = counts.confirmed || 0;
    const cancelled = counts.cancelled || 0;
    const days = eachDay(addDays(localDay(), -13), localDay());
    const dailyRows = ctx.db
      .prepare(
        `SELECT strftime('%Y-%m-%d', created_at, ?) AS day, COUNT(*) AS count
         FROM signup WHERE activity_id = ? AND status = 'confirmed' AND created_at >= ?
         GROUP BY day`,
      )
      .all(timeModifier(), id, localDayStartIso(days[0]));
    const dailyMap = new Map(dailyRows.map((row) => [row.day, row.count]));
    const recent = ctx.db
      .prepare(
        `SELECT s.signup_no, s.phone, s.created_at, u.nickname
         FROM signup s JOIN c_user u ON u.id = s.user_id
         WHERE s.activity_id = ? AND s.status = 'confirmed'
         ORDER BY s.created_at DESC LIMIT 8`,
      )
      .all(id);

    ctx.ok({
      activity: activityView({ ...activity, signup_count: confirmed }, { includeAdmin: true }),
      quota: activity.quota,
      signedUp: confirmed,
      cancelled,
      remaining: Math.max(0, activity.quota - confirmed),
      signupRate: activity.quota > 0 ? Number(((confirmed / activity.quota) * 100).toFixed(2)) : 0,
      cancellationRate: counts.total > 0 ? Number(((cancelled / counts.total) * 100).toFixed(2)) : 0,
      daily: days.map((day) => ({ day, count: dailyMap.get(day) || 0 })),
      recent: recent.map((row) => ({
        signupNo: row.signup_no,
        nickname: row.nickname,
        phone: phoneView(ctx, row.phone),
        createdAt: row.created_at,
      })),
    });
  });

  router.get('/api/admin/activities/:id/signups', requireAdmin('activity:read'), (ctx) => {
    const id = integer(ctx.params.id, '活动 id', { required: true, min: 1 });
    getActivityOrThrow(ctx.db, id);
    const { page, pageSize, offset } = pagination(ctx.query);
    const status = enumValue(ctx.query.status, 'status', ['confirmed', 'cancelled'], { defaultValue: null });
    const keyword = string(ctx.query.keyword, 'keyword', { max: 50 });

    const where = ['s.activity_id = ?'];
    const params = [id];
    if (status) {
      where.push('s.status = ?');
      params.push(status);
    }
    if (keyword) {
      where.push('(s.phone LIKE ? OR s.signup_no LIKE ? OR u.nickname LIKE ?)');
      const like = `%${keyword}%`;
      params.push(like, like, like);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = ctx.db
      .prepare(`SELECT COUNT(*) AS count FROM signup s JOIN c_user u ON u.id = s.user_id ${whereSql}`)
      .get(...params).count;
    const rows = ctx.db
      .prepare(
        `SELECT s.*, u.nickname, u.avatar_url, u.status AS user_status
         FROM signup s JOIN c_user u ON u.id = s.user_id
         ${whereSql}
         ORDER BY s.created_at DESC, s.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset);

    const summary = ctx.db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
           SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
         FROM signup WHERE activity_id = ?`,
      )
      .get(id);

    ctx.ok({
      list: rows.map((s) => ({
        id: s.id,
        signupNo: s.signup_no,
        userId: s.user_id,
        nickname: s.nickname,
        avatarUrl: s.avatar_url,
        userStatus: s.user_status,
        phone: phoneView(ctx, s.phone),
        remark: s.remark,
        status: s.status,
        statusLabel: SIGNUP_STATUS_LABELS[s.status] || s.status,
        createdAt: s.created_at,
        cancelledAt: s.cancelled_at,
      })),
      total,
      page,
      pageSize,
      summary: { confirmed: summary.confirmed || 0, cancelled: summary.cancelled || 0 },
    });
  });

  router.get('/api/admin/activities/:id/signups/export', requireAdmin('activity:read'), (ctx) => {
    const fullPhone = hasPermission(ctx.admin.role, 'activity:export');
    const canMasked = hasPermission(ctx.admin.role, 'activity:export_masked');
    if (!fullPhone && !canMasked) throw errors.forbidden('当前角色没有名单导出权限');
    const id = integer(ctx.params.id, '活动 id', { required: true, min: 1 });
    const activity = getActivityOrThrow(ctx.db, id);
    const status = enumValue(ctx.query.status, 'status', ['confirmed', 'cancelled'], { defaultValue: null });
    const keyword = string(ctx.query.keyword, 'keyword', { max: 50 });
    const where = ['s.activity_id = ?'];
    const params = [id];
    if (status) {
      where.push('s.status = ?');
      params.push(status);
    }
    if (keyword) {
      where.push('(s.phone LIKE ? OR s.signup_no LIKE ? OR u.nickname LIKE ?)');
      const like = `%${keyword}%`;
      params.push(like, like, like);
    }
    const rows = ctx.db
      .prepare(
        `SELECT s.*, u.nickname FROM signup s JOIN c_user u ON u.id = s.user_id
         WHERE ${where.join(' AND ')}
         ORDER BY s.created_at ASC, s.id ASC
         LIMIT 10000`,
      )
      .all(...params);
    const csv = toCsv(
      ['报名编号', '活动名称', '用户ID', '昵称', '手机号', '报名状态', '报名时间', '取消时间', '备注'],
      rows.map((s) => [
        s.signup_no,
        activity.title,
        s.user_id,
        s.nickname,
        fullPhone ? s.phone : phoneView(ctx, s.phone),
        SIGNUP_STATUS_LABELS[s.status] || s.status,
        formatLocalDateTime(s.created_at),
        formatLocalDateTime(s.cancelled_at),
        s.remark,
      ]),
    );
    audit(ctx, 'activity.export_signups', {
      targetType: 'activity',
      targetId: id,
      detail: { count: rows.length, status: status || 'all', phone: fullPhone ? 'full' : 'masked' },
    });
    const filename = `activity-${id}-signups-${localDay()}.csv`;
    ctx.buffer(Buffer.from(csv, 'utf8'), 'text/csv; charset=utf-8', filename);
  });

  // ---------------- C 端：活动列表 / 详情 / 报名 ----------------
  router.get('/api/activities', optionalUser, (ctx) => {
    const { page, pageSize, offset } = pagination(ctx.query);
    const keyword = string(ctx.query.keyword, 'keyword', { max: 50 });
    const includeEnded = ctx.query.includeEnded === 'true' || ctx.query.includeEnded === '1';
    const now = nowIso();
    const where = ["a.status = 'published'"];
    const params = [];
    if (!includeEnded) {
      where.push('a.end_at >= ?');
      params.push(now);
    }
    if (keyword) {
      where.push('(a.title LIKE ? OR a.location LIKE ?)');
      const like = `%${keyword}%`;
      params.push(like, like);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = ctx.db.prepare(`SELECT COUNT(*) AS count FROM activity a ${whereSql}`).get(...params).count;
    const userId = ctx.user?.id || 0;
    const rows = ctx.db
      .prepare(
        `SELECT a.*,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'confirmed') AS signup_count,
                EXISTS(SELECT 1 FROM signup s WHERE s.activity_id = a.id AND s.user_id = ? AND s.status = 'confirmed') AS signed_up
         FROM activity a
         ${whereSql}
         ORDER BY CASE WHEN a.start_at <= ? AND a.end_at >= ? THEN 0 ELSE 1 END,
                  a.start_at ASC, a.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(userId, ...params, now, now, pageSize, offset);

    ctx.ok({
      list: rows.map((row) => activityView(row, { signedUp: row.signed_up })),
      total,
      page,
      pageSize,
    });
  });

  router.get('/api/activities/:id', optionalUser, (ctx) => {
    const id = integer(ctx.params.id, '活动 id', { required: true, min: 1 });
    const userId = ctx.user?.id || 0;
    const row = ctx.db
      .prepare(
        `SELECT a.*,
                (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'confirmed') AS signup_count,
                EXISTS(SELECT 1 FROM signup s WHERE s.activity_id = a.id AND s.user_id = ? AND s.status = 'confirmed') AS signed_up
         FROM activity a WHERE a.id = ? AND a.status = 'published'`,
      )
      .get(userId, id);
    if (!row) throw errors.notFound('活动不存在或已下架');
    let mySignup = null;
    if (ctx.user) {
      mySignup = ctx.db
        .prepare(
          `SELECT id, signup_no, status, phone, remark, created_at
           FROM signup WHERE activity_id = ? AND user_id = ? AND status = 'confirmed'`,
        )
        .get(id, ctx.user.id);
    }
    ctx.ok({
      ...activityView(row, { signedUp: row.signed_up }),
      mySignup: mySignup
        ? {
            id: mySignup.id,
            signupNo: mySignup.signup_no,
            status: mySignup.status,
            phone: mySignup.phone,
            remark: mySignup.remark,
            createdAt: mySignup.created_at,
          }
        : null,
    });
  });

  router.post('/api/activities/:id/signup', requireUser, (ctx) => {
    const id = integer(ctx.params.id, '活动 id', { required: true, min: 1 });
    const body = asObject(ctx.body || {});
    const remark = string(body.remark, '备注', { max: 200 });
    const userId = ctx.user.id;

    let result;
    try {
      result = transaction(ctx.db, () => {
        const activity = ctx.db.prepare('SELECT * FROM activity WHERE id = ?').get(id);
        if (!activity) throw errors.notFound('活动不存在');
        if (activity.status === 'draft') throw errors.business(CODES.ACTIVITY_OFFLINE, '活动尚未发布');
        if (activity.status === 'offline') throw errors.business(CODES.ACTIVITY_OFFLINE, '活动已下架');
        if (activity.status !== 'published') throw errors.business(CODES.ACTIVITY_OFFLINE, '活动不可报名');

        const user = ctx.db.prepare('SELECT * FROM c_user WHERE id = ?').get(userId);
        if (!user || user.status !== 'active') {
          throw errors.business(CODES.USER_DISABLED, '账号已被禁用，无法报名');
        }
        if (!user.phone) throw errors.business(CODES.PHONE_REQUIRED, '请先授权手机号后再报名');

        const now = Date.now();
        if (now < Date.parse(activity.signup_start_at)) {
          throw errors.business(CODES.ACTIVITY_NOT_OPEN, '报名尚未开始');
        }
        if (now > Date.parse(activity.signup_end_at)) {
          throw errors.business(CODES.ACTIVITY_NOT_OPEN, '报名已结束');
        }
        if (now > Date.parse(activity.end_at)) {
          throw errors.business(CODES.ACTIVITY_NOT_OPEN, '活动已结束');
        }

        const existing = ctx.db
          .prepare("SELECT * FROM signup WHERE activity_id = ? AND user_id = ? AND status = 'confirmed'")
          .get(id, userId);
        if (existing) {
          throw errors.business(CODES.ALREADY_SIGNED_UP, '你已经报名过该活动', {
            signupNo: existing.signup_no,
            createdAt: existing.created_at,
          });
        }

        const confirmed = ctx.db
          .prepare("SELECT COUNT(*) AS c FROM signup WHERE activity_id = ? AND status = 'confirmed'")
          .get(id).c;
        if (confirmed >= activity.quota) {
          throw errors.business(CODES.QUOTA_FULL, '该活动名额已满');
        }

        const nowIsoValue = nowIso();
        let signup;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const info = ctx.db
              .prepare(
                `INSERT INTO signup(signup_no, activity_id, user_id, phone, remark, status, created_at)
                 VALUES (?, ?, ?, ?, ?, 'confirmed', ?)`,
              )
              .run(signupNumber(id), id, userId, user.phone, remark, nowIsoValue);
            signup = ctx.db.prepare('SELECT * FROM signup WHERE id = ?').get(Number(info.lastInsertRowid));
            break;
          } catch (error) {
            if (!/UNIQUE constraint failed/i.test(error.message)) throw error;
            if (attempt === 2) {
              throw errors.business(CODES.ALREADY_SIGNED_UP, '报名记录冲突，请刷新后查看');
            }
          }
        }
        const fresh = ctx.db
          .prepare(
            `SELECT a.*,
                    (SELECT COUNT(*) FROM signup s WHERE s.activity_id = a.id AND s.status = 'confirmed') AS signup_count
             FROM activity a WHERE a.id = ?`,
          )
          .get(id);
        return { signup, activity: fresh };
      });
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
        throw errors.business(CODES.ALREADY_SIGNED_UP, '你已经报名过该活动');
      }
      throw error;
    }

    audit(ctx, 'activity.signup', {
      targetType: 'activity',
      targetId: id,
      detail: { signupNo: result.signup.signup_no },
    });
    ctx.json(
      {
        code: 0,
        message: '报名成功',
        data: {
          signup: {
            id: result.signup.id,
            signupNo: result.signup.signup_no,
            status: result.signup.status,
            phone: result.signup.phone,
            remark: result.signup.remark,
            createdAt: result.signup.created_at,
          },
          activity: {
            id: result.activity.id,
            title: result.activity.title,
            startAt: result.activity.start_at,
            endAt: result.activity.end_at,
            quota: result.activity.quota,
            signedUp: result.activity.signup_count,
            remaining: Math.max(0, result.activity.quota - result.activity.signup_count),
          },
        },
      },
      201,
    );
  });

  router.delete('/api/activities/:id/signup', requireUser, (ctx) => {
    const id = integer(ctx.params.id, '活动 id', { required: true, min: 1 });
    const result = transaction(ctx.db, () => {
      const activity = ctx.db.prepare('SELECT * FROM activity WHERE id = ?').get(id);
      if (!activity) throw errors.notFound('活动不存在');
      if (Date.now() > Date.parse(activity.end_at)) {
        throw errors.business(CODES.ACTIVITY_NOT_OPEN, '活动已结束，无法取消报名');
      }
      const signup = ctx.db
        .prepare("SELECT * FROM signup WHERE activity_id = ? AND user_id = ? AND status = 'confirmed'")
        .get(id, ctx.user.id);
      if (!signup) throw errors.notFound('未找到有效报名记录');
      const now = nowIso();
      ctx.db
        .prepare("UPDATE signup SET status = 'cancelled', cancelled_at = ? WHERE id = ?")
        .run(now, signup.id);
      const confirmed = ctx.db
        .prepare("SELECT COUNT(*) AS c FROM signup WHERE activity_id = ? AND status = 'confirmed'")
        .get(id).c;
      return { signup, now, confirmed, activity };
    });
    audit(ctx, 'activity.cancel_signup', {
      targetType: 'activity',
      targetId: id,
      detail: { signupNo: result.signup.signup_no },
    });
    ctx.ok({
      signup: {
        id: result.signup.id,
        signupNo: result.signup.signup_no,
        status: 'cancelled',
        cancelledAt: result.now,
      },
      activity: {
        id: result.activity.id,
        quota: result.activity.quota,
        signedUp: result.confirmed,
        remaining: Math.max(0, result.activity.quota - result.confirmed),
      },
    });
  });
}

module.exports = { register, phaseOf, activityView };
