'use strict';

const { errors, CODES } = require('../../errors');
const { requireAdmin } = require('../../middleware');
const { dateRange, integer, string, asObject } = require('../../validate');
const { config } = require('../../config');
const {
  overview,
  moduleHeat,
  trend,
  funnel,
  channelBreakdown,
  summary,
  compare,
  latestInsight,
} = require('./service');
const { generateInsight } = require('./ai');
const { audit } = require('../../audit');

const lastInterpretAt = new Map();

function register(router) {
  router.get('/api/admin/analytics/overview', requireAdmin('analytics:read'), (ctx) => {
    const range = dateRange(ctx.query, { defaultDays: 14, maxDays: config.analytics.maxRangeDays });
    ctx.ok({
      range: { from: range.from, to: range.to, days: range.days },
      overview: overview(ctx.db, range),
      compare: compare(ctx.db, range),
    });
  });

  router.get('/api/admin/analytics/modules', requireAdmin('analytics:read'), (ctx) => {
    const range = dateRange(ctx.query, { defaultDays: 14, maxDays: config.analytics.maxRangeDays });
    ctx.ok({ range: { from: range.from, to: range.to, days: range.days }, list: moduleHeat(ctx.db, range) });
  });

  router.get('/api/admin/analytics/trend', requireAdmin('analytics:read'), (ctx) => {
    const range = dateRange(ctx.query, { defaultDays: 14, maxDays: config.analytics.maxRangeDays });
    ctx.ok({ range: { from: range.from, to: range.to, days: range.days }, list: trend(ctx.db, range) });
  });

  router.get('/api/admin/analytics/funnel', requireAdmin('analytics:read'), (ctx) => {
    const range = dateRange(ctx.query, { defaultDays: 14, maxDays: config.analytics.maxRangeDays });
    const activityId = integer(ctx.query.activityId, 'activityId', { min: 1, defaultValue: null });
    ctx.ok({
      range: { from: range.from, to: range.to, days: range.days },
      ...funnel(ctx.db, range, { activityId }),
    });
  });

  router.get('/api/admin/analytics/channels', requireAdmin('analytics:read'), (ctx) => {
    const range = dateRange(ctx.query, { defaultDays: 14, maxDays: config.analytics.maxRangeDays });
    ctx.ok({ range: { from: range.from, to: range.to, days: range.days }, list: channelBreakdown(ctx.db, range) });
  });

  router.get('/api/admin/analytics/summary', requireAdmin('analytics:read'), (ctx) => {
    const range = dateRange(ctx.query, { defaultDays: 14, maxDays: config.analytics.maxRangeDays });
    const data = summary(ctx.db, range);
    data.compare = compare(ctx.db, range);
    ctx.ok(data);
  });

  router.get('/api/admin/analytics/insights/latest', requireAdmin('analytics:read'), (ctx) => {
    ctx.ok({ insight: latestInsight(ctx.db) });
  });

  router.post('/api/admin/analytics/interpret', requireAdmin('analytics:interpret'), async (ctx) => {
    const body = asObject(ctx.body || {});
    const range = dateRange(body, { defaultDays: 14, maxDays: config.analytics.maxRangeDays });
    const question = string(body.question, 'question', { max: config.limits.aiQuestionChars });

    const now = Date.now();
    const last = lastInterpretAt.get(ctx.admin.id) || 0;
    if (now - last < 3000) {
      throw errors.business(CODES.AI_UNAVAILABLE, '解读请求过于频繁，请稍后再试');
    }
    lastInterpretAt.set(ctx.admin.id, now);

    const insight = await generateInsight(ctx.db, range, { question, adminId: ctx.admin.id });
    audit(ctx, 'analytics.interpret', {
      targetType: 'ai_insight',
      targetId: insight.id,
      detail: { range: `${range.from}~${range.to}`, source: insight.source, model: insight.model },
    });
    ctx.ok({ insight });
  });
}

module.exports = { register };
