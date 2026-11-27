'use strict';

/**
 * 生成统计报告与 AI 解读样例。
 * 用法：npm run report -- --days 14
 * 输出：
 *   reports/analytics_summary.md
 *   reports/analytics_bundle.json
 *   reports/module_heat.csv
 *   reports/trend.csv
 *   reports/funnel.csv
 *   reports/ai_insight.json
 */
const fs = require('node:fs');
const path = require('node:path');
const { config } = require('../config');
const { openDatabase } = require('../db');
const { rangeOf, summary, compare } = require('../modules/analytics/service');
const { generateInsight } = require('../modules/analytics/ai');
const { toCsv } = require('../csv');
const { formatLocalDateTime } = require('../time');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function mdTable(headers, rows) {
  const escape = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

function writeCsv(file, headers, rows) {
  fs.writeFileSync(file, toCsv(headers, rows), 'utf8');
}

function main() {
  const days = Math.min(90, Math.max(1, arg('days', 14)));
  const db = openDatabase();
  const range = rangeOf(days);
  const bundle = summary(db, range);
  bundle.compare = compare(db, range);

  const admin = db.prepare("SELECT id FROM admin_user WHERE role = 'super_admin' ORDER BY id LIMIT 1").get();
  return generateInsight(db, range, { adminId: admin?.id || null }).then((insight) => {
    fs.mkdirSync(config.reportsDir, { recursive: true });
    const generatedAt = new Date().toISOString();
    const overview = bundle.overview;
    const delta = bundle.compare.delta;
    const channelLabels = {
      wechat_search: '微信搜一搜',
      share: '分享转发',
      qr: '扫码进入',
      ad: '广告投放',
      direct: '直接访问',
    };

    const markdown = `# 用户行为分析报告

> 生成时间：${formatLocalDateTime(generatedAt)}（UTC+8）  
> 数据区间：${bundle.range.from} ~ ${bundle.range.to}（${bundle.range.days} 天）  
> 数据来源：模拟访问行为（固定随机种子可复现） + 活动报名表  
> 分析口径：模块热度按 PV；转化漏斗按同一 session 内严格时间顺序统计

## 一、核心指标

${mdTable(
  ['指标', '本周期', '上一周期', '环比'],
  [
    ['浏览量 PV', overview.pv, bundle.compare.previous.pv, `${delta.pv}%`],
    ['访客数 UV', overview.uv, bundle.compare.previous.uv, `${delta.uv}%`],
    ['会话数', overview.sessions, bundle.compare.previous.sessions, `${delta.sessions}%`],
    ['报名人数', overview.signups, bundle.compare.previous.signups, `${delta.signups}%`],
    ['报名/访客转化率', `${overview.conversionRate}%`, `${bundle.compare.previous.conversionRate}%`, `${delta.conversionRate}pp`],
    ['平均页面停留', `${(overview.avgDurationMs / 1000).toFixed(1)}s`, `${(bundle.compare.previous.avgDurationMs / 1000).toFixed(1)}s`, '—'],
  ],
)}

## 二、模块热度

${mdTable(
  ['模块', 'PV', 'UV', '平均停留', 'PV 占比'],
  bundle.modules.map((item) => [item.moduleLabel, item.pv, item.uv, `${(item.avgDurationMs / 1000).toFixed(1)}s`, `${item.pvShare}%`]),
)}

## 三、访问趋势

${mdTable(
  ['日期', 'PV', 'UV', '会话', '报名', '报名/访客转化率'],
  bundle.trend.map((item) => [item.day, item.pv, item.uv, item.sessions, item.signups, `${item.conversionRate}%`]),
)}

## 四、转化漏斗

口径：同一 session 内，后一步必须发生在前一步之后；跨会话、跨设备不合并。

${mdTable(
  ['步骤', '会话数', '相对首步', '相对上一步', '流失率'],
  bundle.funnel.steps.map((step) => [step.label, step.sessions, `${step.rateFromStart}%`, `${step.rateFromPrev}%`, `${step.dropRate}%`]),
)}

- 总体转化率：**${bundle.funnel.overallConversion}%**
- 最大流失环节：**${bundle.funnel.biggestDrop?.from || '—'} → ${bundle.funnel.biggestDrop?.label || '—'}（流失 ${bundle.funnel.biggestDrop?.dropRate || 0}%）**

## 五、渠道来源

${mdTable(
  ['渠道', '会话', '事件', '报名', '报名/会话转化率'],
  bundle.channels.map((item) => [channelLabels[item.channel] || item.channel, item.sessions, item.events, item.signups, `${item.conversionRate}%`]),
)}

## 六、AI 分析解读

- 生成方式：**${insight.source === 'llm' ? `大模型（${insight.model}）` : '规则兜底（' + insight.model + '）'}**
- 结论置信度：**${insight.confidence}**
- 一句话结论：**${insight.headline}**

${insight.summary}

### 关键发现

${insight.findings.map((item, index) => `${index + 1}. **${item.title}** — ${item.evidence}  \n   ${item.implication}`).join('\n')}

### 行动建议

${insight.recommendations.map((item) => `- **${item.priority}** ${item.action}（负责人：${item.owner}；预期：${item.expectedImpact}）`).join('\n')}

### 数据局限

${insight.risks.map((item) => `- ${item}`).join('\n')}

${insight.meta?.fallbackReason ? `> 规则兜底原因：${insight.meta.fallbackReason}。配置 \`LLM_API_KEY\` 后执行 \`npm run report\` 可生成大模型版本。\n` : ''}
---

### 附：文件说明

- \`analytics_bundle.json\`：本报告全部聚合数据与环比，便于前端或答辩图表复用。
- \`module_heat.csv\` / \`trend.csv\` / \`funnel.csv\`：可直接导入 Excel 的统计结果。
- \`ai_insight.json\`：AI 解读原文、来源、模型与输入快照。
`;

    fs.writeFileSync(path.join(config.reportsDir, 'analytics_summary.md'), markdown, 'utf8');
    fs.writeFileSync(
      path.join(config.reportsDir, 'analytics_bundle.json'),
      JSON.stringify({ generatedAt, ...bundle }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(config.reportsDir, 'ai_insight.json'),
      JSON.stringify({ generatedAt, ...insight }, null, 2),
      'utf8',
    );
    writeCsv(
      path.join(config.reportsDir, 'module_heat.csv'),
      ['模块', 'PV', 'UV', '平均停留秒', 'PV占比'],
      bundle.modules.map((item) => [item.moduleLabel, item.pv, item.uv, (item.avgDurationMs / 1000).toFixed(1), item.pvShare]),
    );
    writeCsv(
      path.join(config.reportsDir, 'trend.csv'),
      ['日期', 'PV', 'UV', '会话', '报名', '报名访客转化率'],
      bundle.trend.map((item) => [item.day, item.pv, item.uv, item.sessions, item.signups, item.conversionRate]),
    );
    writeCsv(
      path.join(config.reportsDir, 'funnel.csv'),
      ['步骤', '会话数', '相对首步', '相对上一步', '流失率'],
      bundle.funnel.steps.map((step) => [step.label, step.sessions, step.rateFromStart, step.rateFromPrev, step.dropRate]),
    );

    console.log('✔ 报告生成完成');
    console.log(`  区间: ${bundle.range.from} ~ ${bundle.range.to}`);
    console.log(`  核心: PV ${overview.pv} · UV ${overview.uv} · 报名 ${overview.signups} · 漏斗转化 ${bundle.funnel.overallConversion}%`);
    console.log(`  AI: ${insight.source === 'llm' ? `大模型 ${insight.model}` : '规则兜底'}`);
    console.log(`  目录: ${config.reportsDir}`);
    db.close();
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
