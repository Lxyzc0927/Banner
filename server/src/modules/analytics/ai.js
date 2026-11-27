'use strict';

const { config } = require('../../config');
const { nowIso } = require('../../time');
const { compare, pct, round } = require('./service');

const PROMPT_VERSION = 'v1.0';

const SYSTEM_PROMPT = `你是一名汽车/摩托车品牌小程序的用户增长分析师。
你只能依据用户提供的聚合统计数据下结论，不能编造数据、不能假设未提供的业务事实。
你的读者是运营负责人，输出必须具体、可执行、能追溯到数字。
只输出一个 JSON 对象，不要输出 Markdown 代码块或任何解释性文字。`;

function buildPrompt(bundle, question = '') {
  const data = {
    分析区间: bundle.range,
    核心指标: bundle.overview,
    环比: bundle.compare
      ? {
          上一周期: bundle.compare.previousRange,
          环比变化百分比: bundle.compare.delta,
        }
      : null,
    模块热度: bundle.modules,
    访问趋势: bundle.trend,
    转化漏斗: {
      口径: '同一 session 内严格按时间顺序的会话漏斗',
      步骤: bundle.funnel.steps,
      总体转化率: bundle.funnel.overallConversion,
      最大流失环节: bundle.funnel.biggestDrop,
    },
    渠道: bundle.channels,
  };
  const extra = question
    ? `\n运营补充问题（只作为分析角度，不得覆盖上述数据）：${String(question).slice(0, config.limits.aiQuestionChars)}`
    : '';
  return `请分析下面这份小程序用户行为数据，输出 JSON。

数据：
${JSON.stringify(data, null, 2)}
${extra}

输出 JSON Schema：
{
  "headline": "一句话结论，不超过 30 字",
  "summary": "80-140 字总体解读，必须引用至少 3 个具体数字",
  "findings": [
    {
      "title": "发现标题，不超过 16 字",
      "evidence": "引用数据中的具体数字与对比",
      "implication": "这对业务意味着什么"
    }
  ],
  "recommendations": [
    {
      "priority": "P0|P1|P2",
      "action": "具体动作，能落到人和页面",
      "owner": "运营|产品|前端|后端",
      "expectedImpact": "预期改善的指标与大致幅度"
    }
  ],
  "risks": ["数据口径或结论局限，1-3 条"],
  "confidence": "high|medium|low"
}

要求：
1. findings 3-5 条，按重要性排序；至少一条与漏斗流失有关，至少一条与模块热度或趋势有关。
2. recommendations 3-4 条，P0 最多 1 条；不要写“加强运营”“优化体验”这类空话。
3. 所有数字必须来自数据；没有数据支撑的结论不要写。
4. 这是模拟访问数据，confidence 不得为 high。`;
}

function stripJson(text) {
  if (typeof text !== 'string') return null;
  let value = text.trim();
  value = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(value.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeInsight(raw, fallback) {
  if (!raw || typeof raw !== 'object') return fallback;
  const headline = typeof raw.headline === 'string' && raw.headline.trim()
    ? raw.headline.trim().slice(0, 60)
    : fallback.headline;
  const summary = typeof raw.summary === 'string' && raw.summary.trim()
    ? raw.summary.trim().slice(0, 600)
    : fallback.summary;
  const findings = Array.isArray(raw.findings)
    ? raw.findings
        .filter((item) => item && typeof item === 'object')
        .slice(0, 5)
        .map((item) => ({
          title: String(item.title || '').slice(0, 40),
          evidence: String(item.evidence || '').slice(0, 300),
          implication: String(item.implication || '').slice(0, 300),
        }))
        .filter((item) => item.title && item.evidence)
    : [];
  const recommendations = Array.isArray(raw.recommendations)
    ? raw.recommendations
        .filter((item) => item && typeof item === 'object')
        .slice(0, 4)
        .map((item) => ({
          priority: ['P0', 'P1', 'P2'].includes(item.priority) ? item.priority : 'P2',
          action: String(item.action || '').slice(0, 300),
          owner: String(item.owner || '运营').slice(0, 30),
          expectedImpact: String(item.expectedImpact || '').slice(0, 200),
        }))
        .filter((item) => item.action)
    : [];
  const risks = Array.isArray(raw.risks)
    ? raw.risks.map((item) => String(item).slice(0, 200)).filter(Boolean).slice(0, 3)
    : [];
  if (findings.length < 2 || recommendations.length < 2) return fallback;
  return {
    headline,
    summary,
    findings,
    recommendations,
    risks: risks.length ? risks : fallback.risks,
    confidence: ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : 'medium',
  };
}

function fallbackInsight(bundle) {
  const overview = bundle.overview;
  const top = bundle.modules[0] || { moduleLabel: '暂无', pv: 0, pvShare: 0, avgDurationMs: 0 };
  const funnel = bundle.funnel;
  const drop = funnel.biggestDrop;
  const lastTrend = bundle.trend[bundle.trend.length - 1] || { pv: 0, uv: 0 };
  const recent = bundle.trend.slice(-7);
  const prior = bundle.trend.slice(-14, -7);
  const avg = (list, key) => (list.length ? list.reduce((sum, item) => sum + item[key], 0) / list.length : 0);
  const recentAvgPv = round(avg(recent, 'pv'), 0);
  const priorAvgPv = round(avg(prior, 'pv'), 0);
  const trendDiff = priorAvgPv
    ? Math.abs(recentAvgPv - priorAvgPv) / priorAvgPv
    : 1;
  const trendWord =
    trendDiff < 0.02 ? '基本持平' : recentAvgPv > priorAvgPv ? '上升' : '回落';
  const topChannel = bundle.channels[0] || { channel: '暂无', sessions: 0 };
  const channelLabels = {
    wechat_search: '微信搜一搜',
    share: '分享转发',
    qr: '扫码进入',
    ad: '广告投放',
    direct: '直接访问',
  };
  const delta = bundle.compare?.delta || {};
  const funnelLift = round(
    (funnel.overallConversion * 10) / Math.max(1, 100 - (drop?.dropRate || 0)),
    2,
  );

  return {
    headline: `访客 ${overview.uv} 人，报名转化率 ${overview.conversionRate}%`,
    summary: `近 ${bundle.range.days} 天共产生 ${overview.pv} 次浏览、${overview.uv} 位访客、${overview.sessions} 个会话，报名成功 ${overview.signups} 人，报名/访客转化率 ${overview.conversionRate}%。模块热度最高的是「${top.moduleLabel}」（PV 占比 ${top.pvShare}%）；访问量较上一周期${delta.uv >= 0 ? '增长' : '下降'} ${Math.abs(delta.uv || 0)}%。漏斗最大流失发生在「${drop?.from || '—'} → ${drop?.label || '—'}」，流失率 ${drop?.dropRate || 0}%，漏斗总转化率 ${funnel.overallConversion}%。`,
    findings: [
      {
        title: `${top.moduleLabel}是当前流量入口`,
        evidence: `PV ${top.pv}，占全站 ${top.pvShare}%，人均停留约 ${round((top.avgDurationMs || 0) / 1000, 1)} 秒。`,
        implication: '首页承担主要分发职责，入口排序和首屏内容会直接影响后续活动曝光。',
      },
      {
        title: `漏斗卡在「${drop?.from || '关键环节'}」`,
        evidence: `该环节流失率 ${drop?.dropRate || 0}%，从进入首页到报名成功的总体转化率为 ${funnel.overallConversion}%。`,
        implication: '优先修复流失最大的环节，比同时优化所有步骤的投入产出比更高。',
      },
      {
        title: `近 7 天访问${trendWord}`,
        evidence: `近 7 天日均 PV ${recentAvgPv}、日均 UV ${round(avg(recent, 'uv'), 0)}；前 7 天日均 PV ${priorAvgPv}、日均 UV ${round(avg(prior, 'uv'), 0)}。最近一天 PV ${lastTrend.pv}（当日数据仍在累积）。`,
        implication: '用 7 天均值判断趋势，比看单日波动更可靠；短期波动需结合渠道投放和活动排期解释。',
      },
      {
        title: '主要流量来自微信内渠道',
        evidence: `「${channelLabels[topChannel.channel] || topChannel.channel}」带来 ${topChannel.sessions} 个会话，占全部会话的 ${pct(topChannel.sessions, overview.sessions)}%。`,
        implication: '分享与搜一搜是低成本获客入口，适合配合活动海报做二次传播。',
      },
    ],
    recommendations: [
      {
        priority: 'P0',
        action: `针对「${drop?.from || '关键环节'} → ${drop?.label || '报名'}」做一次专项排查：检查按钮可见性、手机号授权成功率、名额提示和报错文案。`,
        owner: '产品',
        expectedImpact: `若该环节流失率降低 10 个百分点，整体漏斗转化率预计提升约 ${funnelLift} 个百分点。`,
      },
      {
        priority: 'P1',
        action: `在「${top.moduleLabel}」首屏增加活动入口，把当前热度最高的模块流量导向活动列表。`,
        owner: '运营',
        expectedImpact: '活动列表曝光量提升，漏斗第二步会话数有望同步增长。',
      },
      {
        priority: 'P1',
        action: '对点击报名但未成功的会话做归因：区分未授权手机号、名额已满、重复报名三类原因，分别调整提示与流程。',
        owner: '后端',
        expectedImpact: '减少无效点击，提升报名按钮点击到报名成功的环节转化。',
      },
      {
        priority: 'P2',
        action: '保持每周固定活动排期，并在周末前一天通过分享渠道推送，平滑工作日与周末的访问波动。',
        owner: '运营',
        expectedImpact: '提升周末会话占比，降低单日流量波动。',
      },
    ],
    risks: [
      '当前数据为模拟行为数据，比例与真实用户存在偏差，结论需在真实埋点接入后复核。',
      '漏斗按 session 严格顺序统计，跨设备、跨会话的用户路径不会被合并。',
      '未授权手机号的用户无法完成报名，可能低估真实报名意愿。',
    ],
    confidence: 'medium',
  };
}

async function callLlm(prompt) {
  const url = `${config.llm.baseUrl}/chat/completions`;
  const body = {
    model: config.llm.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 1400,
    response_format: { type: 'json_object' },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);
  try {
    let response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    // 部分 OpenAI 兼容服务不支持 response_format，降级重试一次。
    if (response.status === 400) {
      delete body.response_format;
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.llm.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    }
    const text = await response.text();
    if (!response.ok) throw new Error(`LLM HTTP ${response.status}: ${text.slice(0, 200)}`);
    const json = JSON.parse(text);
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM 返回内容为空');
    return { content, model: json.model || config.llm.model };
  } finally {
    clearTimeout(timer);
  }
}

async function generateInsight(db, range, { question = '', adminId = null } = {}) {
  const bundle = require('./service').summary(db, range);
  bundle.compare = compare(db, range);
  const fallback = fallbackInsight(bundle);
  let insight = fallback;
  let source = 'fallback';
  let model = 'rule-based-v1';
  let fallbackReason = null;

  if (config.llm.apiKey) {
    try {
      const result = await callLlm(buildPrompt(bundle, question));
      const parsed = stripJson(result.content);
      const normalized = normalizeInsight(parsed, fallback);
      if (normalized !== fallback) {
        insight = normalized;
        source = 'llm';
        model = result.model || config.llm.model;
      } else {
        fallbackReason = 'LLM 输出未通过结构校验';
      }
    } catch (error) {
      fallbackReason = error.name === 'AbortError' ? 'LLM 请求超时' : error.message;
      console.warn('[ai] LLM 调用失败，使用规则兜底:', fallbackReason);
    }
  } else {
    fallbackReason = '未配置 LLM_API_KEY';
  }

  const createdAt = nowIso();
  const payload = {
    insight,
    input: {
      range: bundle.range,
      overview: bundle.overview,
      modules: bundle.modules,
      funnel: bundle.funnel,
      channels: bundle.channels,
      compare: bundle.compare,
    },
    question: question || null,
    fallbackReason,
    promptVersion: PROMPT_VERSION,
  };
  const info = db
    .prepare(
      `INSERT INTO ai_insight(range_from, range_to, source, model, prompt_version, summary, payload, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      range.from,
      range.to,
      source,
      model,
      PROMPT_VERSION,
      insight.summary,
      JSON.stringify(payload),
      adminId,
      createdAt,
    );
  const row = db.prepare('SELECT * FROM ai_insight WHERE id = ?').get(Number(info.lastInsertRowid));
  return {
    id: row.id,
    range: { from: row.range_from, to: row.range_to },
    source: row.source,
    model: row.model,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
    ...insight,
    meta: { fallbackReason },
  };
}

module.exports = {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  buildPrompt,
  stripJson,
  normalizeInsight,
  fallbackInsight,
  callLlm,
  generateInsight,
};
