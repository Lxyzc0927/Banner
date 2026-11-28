'use strict';

const {
  localDay,
  addDays,
  eachDay,
  timeModifier,
  localDayStartIso,
  localDayEndIso,
} = require('../../time');

const MODULE_LABELS = {
  home: '首页',
  bike: '车型',
  activity: '活动',
  mine: '我的',
  chat: '智能客服',
};

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function pct(part, total) {
  if (!total) return 0;
  return round((part / total) * 100, 2);
}

function changePct(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return round(((current - previous) / previous) * 100, 2);
}

function rangeOf(daysBack = 14, toDay = localDay()) {
  const from = addDays(toDay, -(daysBack - 1));
  return {
    from,
    to: toDay,
    days: daysBack,
    fromIso: localDayStartIso(from),
    toIso: localDayEndIso(toDay),
  };
}

function previousRange(range) {
  const to = addDays(range.from, -1);
  const from = addDays(to, -(range.days - 1));
  return {
    from,
    to,
    days: range.days,
    fromIso: localDayStartIso(from),
    toIso: localDayEndIso(to),
  };
}

function overview(db, range) {
  const event = db
    .prepare(
      `SELECT
         SUM(CASE WHEN action = 'view' THEN 1 ELSE 0 END) AS pv,
         COUNT(DISTINCT CASE WHEN action = 'view' THEN COALESCE('u:' || user_id, 'v:' || visitor_id) END) AS uv,
         COUNT(DISTINCT session_id) AS sessions,
         AVG(CASE WHEN action = 'view' THEN duration_ms END) AS avg_duration
       FROM visit_event
       WHERE created_at >= ? AND created_at <= ?`,
    )
    .get(range.fromIso, range.toIso);
  const signups = db
    .prepare("SELECT COUNT(*) AS c FROM signup WHERE status = 'confirmed' AND created_at >= ? AND created_at <= ?")
    .get(range.fromIso, range.toIso).c;
  const modules = moduleHeat(db, range);
  const pv = event.pv || 0;
  const uv = event.uv || 0;
  const sessions = event.sessions || 0;
  const avgDurationMs = round(event.avg_duration || 0, 0);

  return {
    pv,
    uv,
    sessions,
    avgDurationMs,
    signups,
    conversionRate: pct(signups, uv),
    pagesPerSession: sessions ? round(pv / sessions, 2) : 0,
    topModule: modules[0] || null,
    moduleCount: modules.length,
  };
}

function moduleHeat(db, range) {
  const rows = db
    .prepare(
      `SELECT module,
              SUM(CASE WHEN action = 'view' THEN 1 ELSE 0 END) AS pv,
              COUNT(DISTINCT CASE WHEN action = 'view' THEN COALESCE('u:' || user_id, 'v:' || visitor_id) END) AS uv,
              AVG(CASE WHEN action = 'view' THEN duration_ms END) AS avg_duration
       FROM visit_event
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY module
       ORDER BY pv DESC, module ASC`,
    )
    .all(range.fromIso, range.toIso);
  const totalPv = rows.reduce((sum, row) => sum + (row.pv || 0), 0);
  return rows.map((row) => ({
    module: row.module,
    moduleLabel: MODULE_LABELS[row.module] || row.module,
    pv: row.pv || 0,
    uv: row.uv || 0,
    avgDurationMs: round(row.avg_duration || 0, 0),
    pvShare: pct(row.pv || 0, totalPv),
  }));
}

function trend(db, range) {
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at, ?) AS day,
              SUM(CASE WHEN action = 'view' THEN 1 ELSE 0 END) AS pv,
              COUNT(DISTINCT CASE WHEN action = 'view' THEN COALESCE('u:' || user_id, 'v:' || visitor_id) END) AS uv,
              COUNT(DISTINCT session_id) AS sessions
       FROM visit_event
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY day
       ORDER BY day ASC`,
    )
    .all(timeModifier(), range.fromIso, range.toIso);
  const signupRows = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at, ?) AS day, COUNT(*) AS signups
       FROM signup
       WHERE status = 'confirmed' AND created_at >= ? AND created_at <= ?
       GROUP BY day`,
    )
    .all(timeModifier(), range.fromIso, range.toIso);
  const eventMap = new Map(rows.map((row) => [row.day, row]));
  const signupMap = new Map(signupRows.map((row) => [row.day, row.signups]));
  return eachDay(range.from, range.to).map((day) => {
    const event = eventMap.get(day) || {};
    const uv = event.uv || 0;
    const signups = signupMap.get(day) || 0;
    return {
      day,
      pv: event.pv || 0,
      uv,
      sessions: event.sessions || 0,
      signups,
      conversionRate: pct(signups, uv),
    };
  });
}

/**
 * 严格顺序的会话转化漏斗：同一 session 内，后一步必须发生在前一步之后。
 * 相比“各步骤独立去重”，这种口径不会被“先看详情、后看列表”的乱序访问污染。
 */
function funnel(db, range, { activityId = null } = {}) {
  const params = [range.fromIso, range.toIso];
  const activityFilter3 = activityId ? 'AND e.target_id = ?' : '';
  const activityFilter4 = activityId ? 'AND e.target_id = ?' : '';
  const activityFilter5 = activityId ? 'AND e.target_id = ?' : '';

  const sql = `
    WITH s1 AS (
      SELECT session_id, MIN(created_at) AS t1, MIN(COALESCE('u:' || user_id, 'v:' || visitor_id)) AS actor
      FROM visit_event
      WHERE created_at >= ? AND created_at <= ? AND module = 'home' AND action = 'view'
      GROUP BY session_id
    ),
    s2 AS (
      SELECT s1.session_id, MIN(e.created_at) AS t2, s1.actor
      FROM s1 JOIN visit_event e
        ON e.session_id = s1.session_id AND e.created_at >= s1.t1
      WHERE e.module = 'activity' AND e.action = 'view' AND e.page = 'activity_list'
      GROUP BY s1.session_id
    ),
    s3 AS (
      SELECT s2.session_id, MIN(e.created_at) AS t3, s2.actor
      FROM s2 JOIN visit_event e
        ON e.session_id = s2.session_id AND e.created_at >= s2.t2
      WHERE e.module = 'activity' AND e.action = 'view' AND e.page = 'activity_detail'
        ${activityFilter3}
      GROUP BY s2.session_id
    ),
    s4 AS (
      SELECT s3.session_id, MIN(e.created_at) AS t4, s3.actor
      FROM s3 JOIN visit_event e
        ON e.session_id = s3.session_id AND e.created_at >= s3.t3
      WHERE e.action = 'signup_click'
        ${activityFilter4}
      GROUP BY s3.session_id
    ),
    s5 AS (
      SELECT s4.session_id, MIN(e.created_at) AS t5, s4.actor
      FROM s4 JOIN visit_event e
        ON e.session_id = s4.session_id AND e.created_at >= s4.t4
      WHERE e.action = 'signup_success'
        ${activityFilter5}
      GROUP BY s4.session_id
    )
    SELECT
      (SELECT COUNT(*) FROM s1) AS step1,
      (SELECT COUNT(*) FROM s2) AS step2,
      (SELECT COUNT(*) FROM s3) AS step3,
      (SELECT COUNT(*) FROM s4) AS step4,
      (SELECT COUNT(*) FROM s5) AS step5,
      (SELECT COUNT(DISTINCT actor) FROM s1) AS visitors1,
      (SELECT COUNT(DISTINCT actor) FROM s2) AS visitors2,
      (SELECT COUNT(DISTINCT actor) FROM s3) AS visitors3,
      (SELECT COUNT(DISTINCT actor) FROM s4) AS visitors4,
      (SELECT COUNT(DISTINCT actor) FROM s5) AS visitors5
  `;
  const queryParams = [...params];
  if (activityId) queryParams.push(activityId, activityId, activityId);
  const row = db.prepare(sql).get(...queryParams);

  const definitions = [
    { key: 'step1', label: '进入首页', description: '打开小程序并浏览首页' },
    { key: 'step2', label: '浏览活动列表', description: '进入活动列表页' },
    { key: 'step3', label: '查看活动详情', description: '打开任意活动详情' },
    { key: 'step4', label: '点击报名', description: '在详情页点击报名按钮' },
    { key: 'step5', label: '报名成功', description: '服务端校验通过并创建报名记录' },
  ];
  const first = row.step1 || 0;
  const hasData = first > 0;
  const steps = definitions.map((def, index) => {
    const count = row[def.key] || 0;
    const prev = index === 0 ? count : row[definitions[index - 1].key] || 0;
    const hasPrev = index === 0 ? hasData : prev > 0;
    const rateFromPrev = index === 0
      ? (hasData ? 100 : null)
      : (prev > 0 ? pct(count, prev) : null);
    return {
      order: index + 1,
      key: def.key,
      label: def.label,
      description: def.description,
      sessions: count,
      visitors: row[`visitors${index + 1}`] || 0,
      rateFromStart: hasData ? pct(count, first) : null,
      rateFromPrev,
      dropRate: index === 0
        ? (hasData ? 0 : null)
        : (!hasPrev || rateFromPrev === null ? null : round(100 - rateFromPrev, 2)),
    };
  });
  const candidates = steps.slice(1).filter((step) => step.dropRate !== null && step.dropRate !== undefined);
  const biggestDrop = candidates.length
    ? candidates.reduce((worst, step) => (step.dropRate > worst.dropRate ? step : worst), candidates[0])
    : null;

  return {
    basis: 'session',
    activityId,
    hasData,
    steps,
    overallConversion: hasData ? pct(row.step5 || 0, first) : null,
    biggestDrop: biggestDrop
      ? { label: biggestDrop.label, dropRate: biggestDrop.dropRate, from: steps[biggestDrop.order - 2]?.label }
      : null,
  };
}

function channelBreakdown(db, range) {
  const rows = db
    .prepare(
      `SELECT COALESCE(channel, 'unknown') AS channel,
              COUNT(*) AS events,
              COUNT(DISTINCT session_id) AS sessions,
              SUM(CASE WHEN action = 'signup_success' THEN 1 ELSE 0 END) AS signups
       FROM visit_event
       WHERE created_at >= ? AND created_at <= ?
       GROUP BY channel
       ORDER BY sessions DESC`,
    )
    .all(range.fromIso, range.toIso);
  return rows.map((row) => ({
    channel: row.channel,
    events: row.events || 0,
    sessions: row.sessions || 0,
    signups: row.signups || 0,
    conversionRate: pct(row.signups || 0, row.sessions || 0),
  }));
}

function summary(db, range) {
  return {
    range: { from: range.from, to: range.to, days: range.days },
    overview: overview(db, range),
    modules: moduleHeat(db, range),
    trend: trend(db, range),
    funnel: funnel(db, range),
    channels: channelBreakdown(db, range),
    generatedAt: new Date().toISOString(),
  };
}

function compare(db, range) {
  const prev = previousRange(range);
  const currentOverview = overview(db, range);
  const previousOverview = overview(db, prev);
  return {
    current: currentOverview,
    previous: previousOverview,
    previousRange: { from: prev.from, to: prev.to },
    delta: {
      pv: changePct(currentOverview.pv, previousOverview.pv),
      uv: changePct(currentOverview.uv, previousOverview.uv),
      sessions: changePct(currentOverview.sessions, previousOverview.sessions),
      signups: changePct(currentOverview.signups, previousOverview.signups),
      conversionRate: round(currentOverview.conversionRate - previousOverview.conversionRate, 2),
    },
  };
}

function latestInsight(db) {
  const row = db.prepare('SELECT * FROM ai_insight ORDER BY created_at DESC, id DESC LIMIT 1').get();
  if (!row) return null;
  return {
    id: row.id,
    range: { from: row.range_from, to: row.range_to },
    source: row.source,
    model: row.model,
    promptVersion: row.prompt_version,
    summary: row.summary,
    payload: JSON.parse(row.payload),
    createdAt: row.created_at,
  };
}

module.exports = {
  MODULE_LABELS,
  round,
  pct,
  rangeOf,
  previousRange,
  overview,
  moduleHeat,
  trend,
  funnel,
  channelBreakdown,
  summary,
  compare,
  latestInsight,
};
