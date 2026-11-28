'use strict';

const { startServer } = require('./app');
const { config } = require('./config');
const { getDb } = require('./db');
const { hasDefaultAdminPassword, validateBindConfig } = require('./security');

const safety = validateBindConfig({
  host: config.host,
  defaultJwtSecret: config.jwt.isDefaultSecret,
  jwtSecret: config.jwt.secret,
  adminPassword: config.seed.adminPassword,
  operatorPassword: config.seed.operatorPassword,
  wechatMock: config.wechat.mock,
});
if (safety.errors.length) {
  console.error('\n✖ 启动被拒绝：当前监听地址不是本机，但演示默认配置仍在使用。');
  for (const message of safety.errors) console.error(`  - ${message}`);
  console.error('  只在本机演示请设置 HOST=127.0.0.1；需要局域网/公网访问，请先改 .env 后重试。\n');
  process.exit(1);
}
for (const warning of safety.warnings) {
  console.warn(`  [安全提醒] ${warning}`);
}

const db = getDb();
if (!safety.loopback && hasDefaultAdminPassword(db)) {
  db.close();
  console.error('启动被拒绝：数据库中有启用的后台账号仍使用演示密码，请先在本机轮换密码。');
  process.exit(1);
}

const { server } = startServer({ db });

server.once('listening', () => {
  const address = server.address();
  const displayHost = address.address === '::' || address.address === '0.0.0.0' ? '127.0.0.1' : address.address;

  console.log('XX 摩托销售管理系统 · 活动与分析服务');
  console.log(`  API:   http://${displayHost}:${address.port}/api/health`);
  console.log(`  后台:  http://${displayHost}:${address.port}/admin/`);
  if (config.jwt.isDefaultSecret) {
    console.warn('  [安全提醒] 正在使用默认 JWT_SECRET，上线前请在 .env 中修改。');
  }
  if (config.wechat.mock) {
    console.warn('  [开发模式] WECHAT_MOCK=true，登录不会请求微信服务器。');
  }
});

server.on('error', (error) => {
  console.error('服务启动失败:', error.message);
  process.exit(1);
});

const shutdown = () => {
  console.log('\n正在关闭服务...');
  server.close(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
