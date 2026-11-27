'use strict';

const { startServer } = require('./app');
const { config } = require('./config');

const { server, db } = startServer();

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
