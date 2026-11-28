'use strict';

const { CODES, errors } = require('../../errors');
const { config } = require('../../config');
const { signToken, verifyPassword, parseTtl, ROLE_LABELS, ROLE_PERMISSIONS } = require('../../auth');
const { publicUser, publicAdmin, requireUser, requireAdmin } = require('../../middleware');
const { code2Session, getPhoneNumber } = require('../../wechat');
const { asObject, string, phone: parsePhone } = require('../../validate');
const { nowIso } = require('../../time');
const { transaction } = require('../../db');
const { audit } = require('../../audit');

function bindPhone(db, userId, phone) {
  const existing = db.prepare('SELECT id FROM c_user WHERE phone = ? AND id <> ?').get(phone, userId);
  if (existing) {
    throw errors.business(CODES.PHONE_BOUND, '该手机号已绑定其他微信账号');
  }
  db.prepare('UPDATE c_user SET phone = ?, updated_at = ? WHERE id = ?').run(phone, nowIso(), userId);
}

function register(router) {
  const wechatLoginHandler = async (ctx) => {
    const body = asObject(ctx.body || {});
    const code = string(body.code, 'code', { required: true, max: 512 });
    const nickname = string(body.nickname, 'nickname', { max: 40 });
    const avatarUrl = string(body.avatarUrl, 'avatarUrl', { max: 500 });
    const phoneCode = string(body.phoneCode, 'phoneCode', { max: 512 });
    const directPhone = body.phone ? parsePhone(body.phone) : null;

    const session = await code2Session(code);

    let phoneInfo = null;
    if (phoneCode || directPhone) {
      phoneInfo = await getPhoneNumber({ code: phoneCode, phone: directPhone });
    }

    const result = transaction(ctx.db, () => {
      let user = ctx.db.prepare('SELECT * FROM c_user WHERE openid = ?').get(session.openid);
      let isNew = false;
      const now = nowIso();
      if (!user) {
        isNew = true;
        const info = ctx.db
          .prepare(
            `INSERT INTO c_user(openid, unionid, nickname, avatar_url, status, last_login_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
          )
          .run(
            session.openid,
            session.unionid,
            nickname || '微信用户',
            avatarUrl,
            now,
            now,
            now,
          );
        user = ctx.db.prepare('SELECT * FROM c_user WHERE id = ?').get(Number(info.lastInsertRowid));
      } else {
        if (user.status === 'disabled') {
          throw errors.business(CODES.USER_DISABLED, '账号已被禁用，请联系管理员', {
            reason: user.disabled_reason || null,
          });
        }
        ctx.db
          .prepare(
            `UPDATE c_user SET
               nickname = COALESCE(?, nickname),
               avatar_url = COALESCE(?, avatar_url),
               last_login_at = ?,
               updated_at = ?
             WHERE id = ?`,
          )
          .run(nickname, avatarUrl, now, now, user.id);
      }

      if (phoneInfo) bindPhone(ctx.db, user.id, phoneInfo.phone);

      user = ctx.db.prepare('SELECT * FROM c_user WHERE id = ?').get(user.id);
      return { user, isNew };
    });

    const token = signToken({ sub: result.user.id, type: 'user' }, config.jwt.userTtl);
    ctx.ok({
      token,
      tokenType: 'Bearer',
      expiresIn: parseTtl(config.jwt.userTtl),
      isNew: result.isNew,
      phoneBound: Boolean(result.user.phone),
      user: publicUser(result.user),
      mock: Boolean(session.mock),
    });
  };

  // 兼容小程序现有调用：/api/auth/wx-login
  router.post('/api/auth/wechat/login', wechatLoginHandler);
  router.post('/api/auth/wx-login', wechatLoginHandler);

  const wechatPhoneHandler = async (ctx) => {
    const body = asObject(ctx.body || {});
    const phoneCode = string(body.code, 'code', { max: 512 });
    const directPhone = body.phone ? parsePhone(body.phone) : null;
    if (!phoneCode && !directPhone) throw errors.badRequest('缺少手机号授权 code');

    const info = await getPhoneNumber({ code: phoneCode, phone: directPhone });
    if (ctx.user.phone === info.phone) {
      ctx.ok({ user: publicUser(ctx.user), changed: false });
      return;
    }
    bindPhone(ctx.db, ctx.user.id, info.phone);
    const user = ctx.db.prepare('SELECT * FROM c_user WHERE id = ?').get(ctx.user.id);
    audit(ctx, 'user.bind_phone', { targetType: 'c_user', targetId: user.id });
    ctx.ok({ user: publicUser(user), changed: true });
  };

  // 兼容小程序现有调用：/api/auth/phone
  router.post('/api/auth/wechat/phone', requireUser, wechatPhoneHandler);
  router.post('/api/auth/phone', requireUser, wechatPhoneHandler);

  router.get('/api/auth/me', requireUser, (ctx) => {
    const signupCount = ctx.db
      .prepare("SELECT COUNT(*) AS count FROM signup WHERE user_id = ? AND status = 'confirmed'")
      .get(ctx.user.id).count;
    ctx.ok({ user: publicUser(ctx.user), signupCount });
  });

  router.post('/api/auth/admin/login', (ctx) => {
    const body = asObject(ctx.body || {});
    const username = string(body.username, 'username', { required: true, min: 3, max: 40 });
    const password = string(body.password, 'password', { required: true, min: 6, max: 128, trim: false });

    const admin = ctx.db.prepare('SELECT * FROM admin_user WHERE username = ?').get(username);
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      throw errors.business(CODES.AUTH_FAILED, '用户名或密码错误');
    }
    if (admin.status !== 'active') throw errors.forbidden('后台账号已被禁用');

    const now = nowIso();
    ctx.db.prepare('UPDATE admin_user SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, admin.id);
    const fresh = ctx.db.prepare('SELECT * FROM admin_user WHERE id = ?').get(admin.id);
    const token = signToken({ sub: fresh.id, type: 'admin', role: fresh.role }, config.jwt.adminTtl);
    ctx.admin = fresh;
    audit(ctx, 'admin.login', { targetType: 'admin_user', targetId: fresh.id });
    ctx.ok({
      token,
      tokenType: 'Bearer',
      expiresIn: parseTtl(config.jwt.adminTtl),
      admin: publicAdmin(fresh),
    });
  });

  router.get('/api/auth/admin/me', requireAdmin(), (ctx) => {
    ctx.ok({ admin: publicAdmin(ctx.admin) });
  });

  router.post('/api/auth/admin/logout', requireAdmin(), (ctx) => {
    audit(ctx, 'admin.logout', { targetType: 'admin_user', targetId: ctx.admin.id });
    ctx.ok({ loggedOut: true });
  });

  router.get('/api/auth/admin/roles', requireAdmin('admin:read'), (ctx) => {
    ctx.ok({
      roles: Object.entries(ROLE_LABELS).map(([value, label]) => ({
        value,
        label,
        permissions: [...ROLE_PERMISSIONS[value]],
      })),
    });
  });
}

module.exports = { register };
