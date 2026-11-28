'use strict';

/**
 * 启动前的监听安全检查。
 * 只监听本机时允许演示默认值；一旦监听局域网 / 公网，必须换掉示例密钥和密码。
 */
const { verifyPassword } = require('./auth');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_ADMIN_PASSWORD = 'Admin@123456';
const DEFAULT_OPERATOR_PASSWORD = 'Operator@123';

function isLoopbackHost(host) {
  return LOOPBACK_HOSTS.has(String(host || '').trim().toLowerCase());
}

function validateBindConfig({
  host = '127.0.0.1',
  defaultJwtSecret = false,
  jwtSecret,
  adminPassword = '',
  operatorPassword = '',
  wechatMock = false,
} = {}) {
  const errors = [];
  const warnings = [];
  const loopback = isLoopbackHost(host);

  if (loopback) {
    return { loopback, errors, warnings };
  }

  if (defaultJwtSecret || (typeof jwtSecret === 'string' && jwtSecret.trim().length < 32)) {
    errors.push('监听局域网/公网需要至少 32 字符的随机 JWT_SECRET，且不能使用示例值');
  }
  if (adminPassword === DEFAULT_ADMIN_PASSWORD || operatorPassword === DEFAULT_OPERATOR_PASSWORD) {
    errors.push('后台种子密码仍是示例默认值，监听局域网/公网前必须修改 SEED_ADMIN_PASSWORD / SEED_OPERATOR_PASSWORD');
  }
  if (wechatMock) {
    warnings.push('当前 WECHAT_MOCK=true；真机授权验收前请关闭 Mock，并配置 WECHAT_APPID / WECHAT_SECRET');
  }

  return { loopback, errors, warnings };
}

function hasDefaultAdminPassword(db) {
  const admins = db.prepare("SELECT password_hash FROM admin_user WHERE status = 'active'").iterate();
  for (const { password_hash: hash } of admins) {
    if (verifyPassword(DEFAULT_ADMIN_PASSWORD, hash) || verifyPassword(DEFAULT_OPERATOR_PASSWORD, hash)) return true;
  }
  return false;
}

module.exports = {
  hasDefaultAdminPassword,
  LOOPBACK_HOSTS,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_OPERATOR_PASSWORD,
  isLoopbackHost,
  validateBindConfig,
};
