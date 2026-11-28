'use strict';

const { config } = require('../../config');
const { getMeta } = require('../../db');
const { version } = require('../../../../package.json');

function register(router) {
  router.get('/api/health', (ctx) => {
    const schemaVersion = getMeta('schema_version', ctx.db);
    ctx.ok({
      status: 'ok',
      service: 'moto-sales-platform',
      env: config.env,
      schemaVersion,
      time: new Date().toISOString(),
      wechatMock: config.wechat.mock,
      llmConfigured: Boolean(config.llm.apiKey),
    });
  });

  router.get('/api/meta', (ctx) => {
    ctx.ok({
      name: 'XX 摩托销售管理系统 · 活动与分析服务',
      version,
      apiPrefix: '/api',
      responseEnvelope: { code: 0, message: 'ok', data: null },
      errorCodes: {
        0: '成功',
        401: '未登录',
        403: '无权限',
        404: '不存在',
        1002: '活动不在报名期',
        1003: '名额已满',
        1004: '重复报名',
        1005: '活动已下架',
        1008: '用户已禁用',
        1010: '未授权手机号',
        1011: '手机号已被绑定',
        1012: '并发更新冲突',
      },
      modules: ctx.modules,
    });
  });
}

module.exports = { register };
