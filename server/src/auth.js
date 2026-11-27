'use strict';

const crypto = require('node:crypto');
const { config } = require('./config');
const { errors } = require('./errors');

const ROLE_PERMISSIONS = {
  super_admin: new Set([
    'admin:read',
    'admin:write',
    'user:read',
    'user:write',
    'activity:read',
    'activity:write',
    'activity:publish',
    'activity:export',
    'analytics:read',
    'analytics:interpret',
    'audit:read',
  ]),
  operator: new Set([
    'user:read',
    'user:write',
    'activity:read',
    'activity:write',
    'activity:publish',
    'activity:export',
    'analytics:read',
    'analytics:interpret',
  ]),
};

const ROLE_LABELS = {
  super_admin: '超级管理员',
  operator: '运营管理员',
};

function hasPermission(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role]?.has(permission));
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function parseTtl(ttl) {
  if (typeof ttl === 'number') return ttl;
  const match = /^(\d+)([smhd])$/.exec(String(ttl).trim());
  if (!match) throw new Error(`非法 TTL: ${ttl}`);
  const value = Number(match[1]);
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
  return value * unit;
}

function signToken(payload, ttl) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + parseTtl(ttl) }));
  const signature = crypto
    .createHmac('sha256', config.jwt.secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') throw errors.unauthorized('请先登录');
  const parts = token.split('.');
  if (parts.length !== 3) throw errors.unauthorized('登录凭证格式错误');
  const [header, body, signature] = parts;
  const expected = crypto
    .createHmac('sha256', config.jwt.secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw errors.unauthorized('登录已失效，请重新登录');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw errors.unauthorized('登录凭证无效');
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) throw errors.unauthorized('登录已过期，请重新登录');
  return payload;
}

function parseBearer(req) {
  const raw = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match ? match[1] : null;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const N = 16384;
  const r = 8;
  const p = 1;
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p }).toString('hex');
  return `scrypt$${N}$${r}$${p}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, n, r, p, salt, hash] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function randomId(prefix = '') {
  return `${prefix}${crypto.randomBytes(12).toString('hex')}`;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

module.exports = {
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  hasPermission,
  signToken,
  verifyToken,
  parseBearer,
  hashPassword,
  verifyPassword,
  randomId,
  sha256,
  parseTtl,
};
