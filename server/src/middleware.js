'use strict';

const { errors, CODES } = require('./errors');
const { parseBearer, verifyToken, hasPermission, ROLE_LABELS, ROLE_PERMISSIONS } = require('./auth');

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    status: row.status,
    createdAt: row.created_at,
  };
}

function publicAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] || row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    permissions: [...(ROLE_PERMISSIONS[row.role] || [])],
  };
}

function readTokenPayload(ctx, expectedType) {
  const token = parseBearer(ctx.req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (payload.type !== expectedType) throw errors.unauthorized('登录身份不匹配');
  return payload;
}

/** 可选登录：C 端列表/详情用来回显“已报名/已收藏”等状态。 */
function optionalUser(ctx, next) {
  let payload;
  try {
    payload = readTokenPayload(ctx, 'user');
  } catch {
    return next();
  }
  if (!payload) return next();
  const row = ctx.db.prepare('SELECT * FROM c_user WHERE id = ?').get(payload.sub);
  if (!row || row.status !== 'active') return next();
  ctx.user = row;
  return next();
}

function requireUser(ctx, next) {
  const payload = readTokenPayload(ctx, 'user');
  if (!payload) throw errors.unauthorized('请先登录');
  const row = ctx.db.prepare('SELECT * FROM c_user WHERE id = ?').get(payload.sub);
  if (!row) throw errors.unauthorized('用户不存在，请重新登录');
  if (row.status === 'disabled') {
    throw errors.business(CODES.USER_DISABLED, '账号已被禁用，请联系管理员', {
      reason: row.disabled_reason || null,
    });
  }
  ctx.user = row;
  return next();
}

function requireAdmin(permission = null) {
  return (ctx, next) => {
    const payload = readTokenPayload(ctx, 'admin');
    if (!payload) throw errors.unauthorized('请先登录后台');
    const row = ctx.db.prepare('SELECT * FROM admin_user WHERE id = ?').get(payload.sub);
    if (!row) throw errors.unauthorized('后台账号不存在');
    if (row.status !== 'active') throw errors.forbidden('后台账号已被禁用');
    if (permission && !hasPermission(row.role, permission)) {
      throw errors.forbidden(`当前角色（${ROLE_LABELS[row.role] || row.role}）没有该操作权限`);
    }
    ctx.admin = row;
    return next();
  };
}

module.exports = {
  publicUser,
  publicAdmin,
  optionalUser,
  requireUser,
  requireAdmin,
};
