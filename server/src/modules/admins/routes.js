'use strict';

const { CODES, errors } = require('../../errors');
const { requireAdmin } = require('../../middleware');
const { hashPassword, ROLE_LABELS } = require('../../auth');
const { asObject, string, integer, enumValue, pagination } = require('../../validate');
const { nowIso } = require('../../time');
const { audit } = require('../../audit');

function adminView(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] || row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function activeSuperAdmins(db, excludeId = 0) {
  return db
    .prepare("SELECT COUNT(*) AS c FROM admin_user WHERE role = 'super_admin' AND status = 'active' AND id <> ?")
    .get(excludeId).c;
}

function register(router) {
  router.get('/api/admin/admins', requireAdmin('admin:read'), (ctx) => {
    const { page, pageSize, offset } = pagination(ctx.query);
    const keyword = string(ctx.query.keyword, 'keyword', { max: 50 });
    const role = enumValue(ctx.query.role, 'role', ['super_admin', 'operator'], { defaultValue: null });
    const status = enumValue(ctx.query.status, 'status', ['active', 'disabled'], { defaultValue: null });
    const where = [];
    const params = [];
    if (keyword) {
      where.push('(username LIKE ? OR display_name LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (role) {
      where.push('role = ?');
      params.push(role);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = ctx.db.prepare(`SELECT COUNT(*) AS count FROM admin_user ${whereSql}`).get(...params).count;
    const rows = ctx.db
      .prepare(`SELECT * FROM admin_user ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset);
    ctx.ok({ list: rows.map(adminView), total, page, pageSize, roles: ROLE_LABELS });
  });

  router.post('/api/admin/admins', requireAdmin('admin:write'), (ctx) => {
    const body = asObject(ctx.body || {});
    const username = string(body.username, '用户名', { required: true, min: 3, max: 40, pattern: /^[a-zA-Z0-9_.-]+$/ });
    const password = string(body.password, '密码', { required: true, min: 8, max: 128, trim: false });
    const displayName = string(body.displayName, '显示名称', { required: true, min: 1, max: 40 });
    const role = enumValue(body.role, '角色', ['super_admin', 'operator'], { required: true });

    const exists = ctx.db.prepare('SELECT id FROM admin_user WHERE username = ?').get(username);
    if (exists) throw errors.business(CODES.DUPLICATE_ACCOUNT, '用户名已存在');

    const now = nowIso();
    const info = ctx.db
      .prepare(
        `INSERT INTO admin_user(username, password_hash, display_name, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(username, hashPassword(password), displayName, role, now, now);
    const row = ctx.db.prepare('SELECT * FROM admin_user WHERE id = ?').get(Number(info.lastInsertRowid));
    audit(ctx, 'admin.create', {
      targetType: 'admin_user',
      targetId: row.id,
      detail: { username, role },
    });
    ctx.json({ code: 0, message: '后台账号已创建', data: adminView(row) }, 201);
  });

  router.put('/api/admin/admins/:id', requireAdmin('admin:write'), (ctx) => {
    const id = integer(ctx.params.id, '账号 id', { required: true, min: 1 });
    const body = asObject(ctx.body || {});
    const row = ctx.db.prepare('SELECT * FROM admin_user WHERE id = ?').get(id);
    if (!row) throw errors.notFound('后台账号不存在');

    const displayName = body.displayName !== undefined
      ? string(body.displayName, '显示名称', { required: true, min: 1, max: 40 })
      : row.display_name;
    const role = body.role !== undefined
      ? enumValue(body.role, '角色', ['super_admin', 'operator'], { required: true })
      : row.role;
    const status = body.status !== undefined
      ? enumValue(body.status, '状态', ['active', 'disabled'], { required: true })
      : row.status;

    if (id === ctx.admin.id && status === 'disabled') throw errors.business(CODES.PROTECTED_ACCOUNT, '不能禁用当前登录账号');
    if (id === ctx.admin.id && role !== 'super_admin') throw errors.business(CODES.PROTECTED_ACCOUNT, '不能降低当前登录账号的角色');
    if (row.role === 'super_admin' && role !== 'super_admin' && activeSuperAdmins(ctx.db, id) === 0) {
      throw errors.business(CODES.PROTECTED_ACCOUNT, '系统至少需要保留一名启用的超级管理员');
    }
    if (row.role === 'super_admin' && status === 'disabled' && activeSuperAdmins(ctx.db, id) === 0) {
      throw errors.business(CODES.PROTECTED_ACCOUNT, '系统至少需要保留一名启用的超级管理员');
    }

    const now = nowIso();
    ctx.db
      .prepare('UPDATE admin_user SET display_name = ?, role = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(displayName, role, status, now, id);
    const fresh = ctx.db.prepare('SELECT * FROM admin_user WHERE id = ?').get(id);
    audit(ctx, 'admin.update', { targetType: 'admin_user', targetId: id, detail: { role, status } });
    ctx.ok(adminView(fresh));
  });

  router.post('/api/admin/admins/:id/reset-password', requireAdmin('admin:write'), (ctx) => {
    const id = integer(ctx.params.id, '账号 id', { required: true, min: 1 });
    const body = asObject(ctx.body || {});
    const password = string(body.password, '新密码', { required: true, min: 8, max: 128, trim: false });
    const row = ctx.db.prepare('SELECT id FROM admin_user WHERE id = ?').get(id);
    if (!row) throw errors.notFound('后台账号不存在');
    ctx.db
      .prepare('UPDATE admin_user SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(password), nowIso(), id);
    audit(ctx, 'admin.reset_password', { targetType: 'admin_user', targetId: id });
    ctx.ok({ reset: true });
  });
}

module.exports = { register };
