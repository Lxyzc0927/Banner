(() => {
  'use strict';

  const TOKEN_KEY = 'moto_admin_token';
  const PAGE_META = {
    dashboard: ['数据看板', '用户行为与活动报名概览'],
    activities: ['活动管理', '发布、下架、名额与报名名单'],
    users: ['用户管理', 'C 端用户查询、禁用与报名记录'],
    admins: ['后台账号', '角色权限与账号状态'],
  };
  const MODULE_LABELS = {
    home: '首页',
    bike: '车型',
    activity: '活动',
    mine: '我的',
    chat: '智能客服',
  };
  const CHANNEL_LABELS = {
    wechat_search: '微信搜一搜',
    share: '分享转发',
    qr: '扫码进入',
    ad: '广告投放',
    direct: '直接访问',
    unknown: '未知来源',
  };
  const STATUS_LABELS = { draft: '草稿', published: '已发布', offline: '已下架' };
  const ROLE_LABELS = { super_admin: '超级管理员', operator: '运营管理员' };

  const state = {
    token: sessionStorage.getItem(TOKEN_KEY) || '',
    admin: null,
    page: 'dashboard',
    days: 14,
    summary: null,
    latestInsight: null,
    activity: { page: 1, pageSize: 8, keyword: '', status: '' },
    user: { page: 1, pageSize: 10, keyword: '', status: '' },
    adminList: { page: 1, pageSize: 10, keyword: '' },
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function num(value) {
    return new Intl.NumberFormat('zh-CN').format(Number(value) || 0);
  }

  function pct(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function duration(ms) {
    const seconds = Math.round((Number(ms) || 0) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  }

  function cnDay(date = new Date()) {
    const shifted = new Date(date.getTime() + 8 * 3600 * 1000);
    return shifted.toISOString().slice(0, 10);
  }

  function addDays(day, count) {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  }

  function dateRange() {
    const to = cnDay();
    return { from: addDays(to, -(state.days - 1)), to };
  }

  function formatTime(iso, withTime = true) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    const shifted = new Date(date.getTime() + 8 * 3600 * 1000);
    const text = shifted.toISOString();
    return withTime ? `${text.slice(0, 10)} ${text.slice(11, 16)}` : text.slice(0, 10);
  }

  function toLocalInput(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    const shifted = new Date(date.getTime() + 8 * 3600 * 1000);
    return shifted.toISOString().slice(0, 16);
  }

  function fromLocalInput(value) {
    if (!value) return null;
    const normalized = value.length === 16 ? `${value}:00` : value;
    return new Date(`${normalized}+08:00`).toISOString();
  }

  function deltaHtml(value, suffix = '%') {
    const number = Number(value || 0);
    const cls = number > 0 ? 'up' : number < 0 ? 'down' : 'flat';
    const arrow = number > 0 ? '↑' : number < 0 ? '↓' : '→';
    const text = suffix === 'pp' ? `${Math.abs(number).toFixed(1)}pp` : `${Math.abs(number).toFixed(1)}%`;
    return `<span class="delta ${cls}">${arrow} ${text}</span>`;
  }

  function toast(message, type = 'info') {
    const root = $('#toast-root');
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    root.appendChild(node);
    setTimeout(() => node.remove(), 3200);
  }

  class ApiError extends Error {
    constructor(message, code, status, details) {
      super(message);
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }

  async function api(path, { method = 'GET', body = undefined, raw = false } = {}) {
    const headers = {};
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError('网络请求失败，请确认服务已启动', 0, 0);
    }
    if (response.status === 401) {
      logout(false);
      throw new ApiError('登录已过期，请重新登录', 401, 401);
    }
    if (raw) return response;
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError('服务返回格式异常', 0, response.status);
    }
    if (json.code !== 0) {
      throw new ApiError(json.message || '操作失败', json.code, response.status, json.details);
    }
    return json.data;
  }

  function handleError(error) {
    if (!error) return;
    if (error.code === 401) return;
    toast(error.message || '操作失败', 'error');
    if (error.details?.reason) toast(`原因：${error.details.reason}`, 'error');
  }

  // ---------------- 登录与外壳 ----------------
  function showLogin() {
    $('#app-view').classList.add('hidden');
    $('#login-view').classList.remove('hidden');
    $('#login-username').value = 'superadmin';
    $('#login-password').value = '';
    setTimeout(() => $('#login-password')?.focus(), 50);
  }

  function showApp() {
    $('#login-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
    const admin = state.admin || {};
    $('#admin-name').textContent = admin.displayName || '管理员';
    $('#admin-role').textContent = admin.roleLabel || ROLE_LABELS[admin.role] || '—';
    $('#admin-avatar').textContent = (admin.displayName || '管').slice(0, 1);
    $$('.nav-item').forEach((button) => {
      if (button.dataset.page === 'admins' && admin.role !== 'super_admin') {
        button.classList.add('hidden');
      } else {
        button.classList.remove('hidden');
      }
    });
    const canInterpret = Array.isArray(admin.permissions) && admin.permissions.includes('analytics:interpret');
    $('#ai-generate').classList.toggle('hidden', !canInterpret);
  }

  function logout(showToast = true) {
    state.token = '';
    state.admin = null;
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin();
    if (showToast) toast('已退出登录');
  }

  async function restoreSession() {
    if (!state.token) {
      showLogin();
      return;
    }
    try {
      const data = await api('/api/auth/admin/me');
      state.admin = data.admin;
      showApp();
      await switchPage(location.hash.replace('#', '') || 'dashboard');
    } catch {
      logout(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const button = $('#login-submit');
    const errorBox = $('#login-error');
    errorBox.classList.add('hidden');
    button.disabled = true;
    button.textContent = '登录中…';
    try {
      const data = await api('/api/auth/admin/login', {
        method: 'POST',
        body: {
          username: $('#login-username').value.trim(),
          password: $('#login-password').value,
        },
      });
      state.token = data.token;
      state.admin = data.admin;
      sessionStorage.setItem(TOKEN_KEY, data.token);
      showApp();
      toast(`欢迎回来，${data.admin.displayName}`, 'success');
      await switchPage(location.hash.replace('#', '') || 'dashboard');
    } catch (error) {
      errorBox.textContent = error.message || '登录失败';
      errorBox.classList.remove('hidden');
    } finally {
      button.disabled = false;
      button.textContent = '进入运营台';
    }
  }

  async function switchPage(page) {
    if (!PAGE_META[page]) page = 'dashboard';
    if (page === 'admins' && state.admin?.role !== 'super_admin') page = 'dashboard';
    state.page = page;
    if (location.hash !== `#${page}`) history.replaceState(null, '', `#${page}`);
    $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
    $$('.page').forEach((section) => section.classList.add('hidden'));
    $(`#page-${page}`).classList.remove('hidden');
    const [title, subtitle] = PAGE_META[page];
    $('#page-title').textContent = title;
    $('#page-subtitle').textContent = subtitle;
    $('#range-controls').classList.toggle('hidden', page !== 'dashboard');

    if (page === 'dashboard') await loadDashboard();
    if (page === 'activities') await loadActivities();
    if (page === 'users') await loadUsers();
    if (page === 'admins') await loadAdmins();
  }

  // ---------------- 看板 ----------------
  async function loadDashboard() {
    const range = dateRange();
    $('#kpi-grid').innerHTML = '<div class="empty-state"><strong>加载中…</strong><p>正在聚合访问与报名数据</p></div>';
    try {
      const [summary, latest] = await Promise.all([
        api(`/api/admin/analytics/summary?from=${range.from}&to=${range.to}`),
        api('/api/admin/analytics/insights/latest').catch(() => ({ insight: null })),
      ]);
      state.summary = summary;
      state.latestInsight = latest.insight;
      renderKpis(summary);
      renderModules(summary.modules);
      renderTrend(summary.trend);
      renderFunnel(summary.funnel);
      renderChannels(summary.channels);
      renderInsight(latest.insight);
    } catch (error) {
      handleError(error);
      $('#kpi-grid').innerHTML = '<div class="empty-state"><strong>数据加载失败</strong><p>请确认后端服务已启动。</p></div>';
    }
  }

  function renderKpis(summary) {
    const overview = summary.overview;
    const delta = summary.compare?.delta || {};
    const cards = [
      {
        label: '浏览量 PV',
        value: num(overview.pv),
        delta: delta.pv,
        foot: `${num(overview.sessions)} 个会话 · 人均 ${overview.pagesPerSession} 页`,
      },
      {
        label: '访客数 UV',
        value: num(overview.uv),
        delta: delta.uv,
        foot: `上一周期 ${num(summary.compare?.previous?.uv || 0)} 人`,
      },
      {
        label: '报名人数',
        value: num(overview.signups),
        delta: delta.signups,
        foot: `报名转化率 ${overview.conversionRate}%`,
      },
      {
        label: '报名转化率',
        value: `${overview.conversionRate}%`,
        delta: delta.conversionRate,
        deltaSuffix: 'pp',
        foot: `平均停留 ${duration(overview.avgDurationMs)}`,
      },
    ];
    $('#kpi-grid').innerHTML = cards
      .map(
        (card) => `
        <article class="kpi-card">
          <div class="kpi-label"><span>${card.label}</span>${deltaHtml(card.delta, card.deltaSuffix || '%')}</div>
          <div class="kpi-value">${card.value}</div>
          <div class="kpi-foot">${card.foot}</div>
        </article>`,
      )
      .join('');
  }

  function renderModules(modules) {
    const container = $('#module-heat');
    if (!modules?.length) {
      container.innerHTML = '<div class="empty-state"><strong>暂无访问数据</strong><p>先执行 <code>npm run mock</code> 生成模拟数据。</p></div>';
      return;
    }
    const max = Math.max(...modules.map((item) => item.pv), 1);
    container.innerHTML = modules
      .map(
        (item) => `
        <div class="heat-row">
          <div class="heat-top">
            <strong>${escapeHtml(item.moduleLabel || MODULE_LABELS[item.module] || item.module)}</strong>
            <span>PV ${num(item.pv)} · UV ${num(item.uv)} · ${duration(item.avgDurationMs)} · ${pct(item.pvShare)}</span>
          </div>
          <div class="heat-track"><div class="heat-fill" style="width:${Math.max(2, (item.pv / max) * 100)}%"></div></div>
        </div>`,
      )
      .join('');
  }

  function renderFunnel(funnel) {
    const container = $('#funnel-chart');
    if (!funnel?.steps?.length) {
      container.innerHTML = '<div class="empty-state"><strong>暂无漏斗数据</strong><p>需要首页、活动列表、详情、报名点击与成功事件。</p></div>';
      return;
    }
    if (funnel.hasData === false || funnel.steps[0]?.sessions === 0) {
      $('#funnel-overall').textContent = '暂无数据';
      container.innerHTML = '<div class="empty-state"><strong>当前区间没有访问数据</strong><p>生成模拟数据或接入真实埋点后，这里会显示五步转化漏斗。</p></div>';
      return;
    }
    $('#funnel-overall').textContent = `总转化 ${pct(funnel.overallConversion)}`;
    container.innerHTML = funnel.steps
      .map(
        (step, index) => `
        <div class="funnel-step">
          <div class="funnel-top">
            <strong>${index + 1}. ${escapeHtml(step.label)}</strong>
            <span>${num(step.sessions)} 会话 · ${step.rateFromStart == null ? '—' : pct(step.rateFromStart)}${
              index > 0 && step.dropRate != null ? ` · <span class="funnel-drop">流失 ${pct(step.dropRate)}</span>` : ''
            }</span>
          </div>
          <div class="funnel-track">
            <div class="funnel-fill" style="width:${Math.max(4, step.rateFromStart || 0)}%"><span>${num(step.sessions)}</span></div>
          </div>
        </div>`,
      )
      .join('');
  }

  function renderChannels(channels) {
    const container = $('#channel-list');
    if (!channels?.length) {
      container.innerHTML = '<div class="empty-state"><strong>暂无渠道数据</strong><p>模拟数据会带上 wechat_search / share / qr 等来源。</p></div>';
      return;
    }
    container.innerHTML = channels
      .map(
        (item) => `
        <div class="channel-row">
          <div class="channel-name">
            <span class="channel-icon">${escapeHtml((CHANNEL_LABELS[item.channel] || item.channel).slice(0, 1))}</span>
            <span>${escapeHtml(CHANNEL_LABELS[item.channel] || item.channel)}</span>
          </div>
          <div class="channel-stats">
            <strong>${num(item.sessions)} 会话</strong>
            ${num(item.signups)} 报名 · ${pct(item.conversionRate)}
          </div>
        </div>`,
      )
      .join('');
  }

  function renderTrend(rows) {
    const container = $('#trend-chart');
    if (!rows?.length) {
      container.innerHTML = '<div class="empty-state"><strong>暂无趋势数据</strong></div>';
      return;
    }
    const width = 900;
    const height = 280;
    const padding = { top: 18, right: 18, bottom: 34, left: 48 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const max = Math.max(...rows.flatMap((row) => [row.pv, row.uv]), 1) * 1.12;
    const maxSignups = Math.max(...rows.map((row) => row.signups), 1);
    const x = (index) => padding.left + (rows.length === 1 ? innerWidth / 2 : (innerWidth * index) / (rows.length - 1));
    const y = (value) => padding.top + innerHeight - (Number(value || 0) / max) * innerHeight;
    const line = (key) => rows.map((row, index) => `${x(index).toFixed(1)},${y(row[key]).toFixed(1)}`).join(' ');
    const area = `${padding.left},${padding.top + innerHeight} ${line('pv')} ${padding.left + innerWidth},${padding.top + innerHeight}`;
    const barWidth = Math.max(3, (innerWidth / rows.length) * 0.46);
    const bars = rows
      .map((row, index) => {
        const barHeight = Math.max(1, (row.signups / maxSignups) * innerHeight * 0.92);
        return `<rect x="${(x(index) - barWidth / 2).toFixed(1)}" y="${(padding.top + innerHeight - barHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="2" fill="#059669" opacity="0.16"><title>${row.day} 报名 ${row.signups}</title></rect>`;
      })
      .join('');
    const grid = [0, 0.25, 0.5, 0.75, 1]
      .map((ratio) => {
        const gy = padding.top + innerHeight - innerHeight * ratio;
        return `<line class="chart-grid" x1="${padding.left}" y1="${gy}" x2="${padding.left + innerWidth}" y2="${gy}" />
                <text class="chart-axis" x="${padding.left - 8}" y="${gy + 3}" text-anchor="end">${Math.round(max * ratio)}</text>`;
      })
      .join('');
    const labelEvery = Math.max(1, Math.ceil(rows.length / 7));
    const labels = rows
      .map((row, index) =>
        index % labelEvery === 0 || index === rows.length - 1
          ? `<text class="chart-axis" x="${x(index)}" y="${height - 10}" text-anchor="middle">${row.day.slice(5)}</text>`
          : '',
      )
      .join('');
    const dots = rows
      .map(
        (row, index) =>
          `<circle class="chart-dot" cx="${x(index)}" cy="${y(row.pv)}" r="2.4" fill="#d92d20"><title>${row.day} PV ${row.pv}</title></circle>`,
      )
      .join('');
    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="访问趋势折线图">
        ${bars}
        ${grid}
        <polygon class="chart-area" fill="#d92d20" points="${area}"></polygon>
        <polyline class="chart-line" stroke="#d92d20" points="${line('pv')}"></polyline>
        <polyline class="chart-line" stroke="#2563eb" points="${line('uv')}"></polyline>
        ${dots}
        ${labels}
        <text class="chart-axis" x="${padding.left + innerWidth}" y="${padding.top - 6}" text-anchor="end">绿色柱：报名（峰值 ${maxSignups}）</text>
      </svg>`;
  }

  function normalizeInsight(raw) {
    if (!raw) return null;
    if (raw.payload?.insight) {
      return {
        ...raw.payload.insight,
        meta: {
          source: raw.source,
          model: raw.model,
          createdAt: raw.createdAt,
          range: raw.range,
          fallbackReason: raw.payload.fallbackReason,
        },
      };
    }
    if (raw.insight) {
      return {
        ...raw.insight,
        meta: {
          source: raw.source,
          model: raw.model,
          createdAt: raw.createdAt,
          range: raw.range,
          fallbackReason: raw.payload?.fallbackReason,
        },
      };
    }
    return {
      ...raw,
      meta: {
        source: raw.source,
        model: raw.model,
        createdAt: raw.createdAt,
        range: raw.range,
        fallbackReason: raw.meta?.fallbackReason,
      },
    };
  }

  function renderInsight(raw) {
    const container = $('#ai-content');
    const badge = $('#ai-source');
    const insight = normalizeInsight(raw);
    if (!insight) {
      badge.classList.add('hidden');
      container.innerHTML = `
        <div class="empty-state">
          <strong>还没有分析解读</strong>
          <p>点击「生成解读」，将当前区间数据交给大模型；未配置 API Key 时自动使用规则兜底。</p>
        </div>`;
      return;
    }
    const source = insight.meta?.source || insight.source;
    badge.classList.remove('hidden');
    badge.className = `tag ${source === 'llm' ? 'tag-green' : 'tag-blue'}`;
    badge.textContent = source === 'llm' ? '大模型生成' : '规则兜底';
    const range = insight.meta?.range || {};
    const fallbackReason = insight.meta?.fallbackReason;
    container.innerHTML = `
      <div class="ai-meta">
        <span>${escapeHtml(range.from || '')} ~ ${escapeHtml(range.to || '')}</span>
        <span>·</span>
        <span>${escapeHtml(insight.meta?.model || insight.model || '')}</span>
        <span>·</span>
        <span>${formatTime(insight.meta?.createdAt || insight.createdAt)}</span>
      </div>
      <div class="ai-headline">${escapeHtml(insight.headline || '')}</div>
      <p class="ai-summary">${escapeHtml(insight.summary || '')}</p>
      <div>
        <div class="ai-section-title">关键发现</div>
        <div class="finding-list">
          ${(insight.findings || [])
            .map(
              (item) => `
            <div class="finding">
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.evidence)}</p>
              <small>${escapeHtml(item.implication)}</small>
            </div>`,
            )
            .join('')}
        </div>
      </div>
      <div>
        <div class="ai-section-title">行动建议</div>
        <ul class="rec-list">
          ${(insight.recommendations || [])
            .map(
              (item) => `
            <li class="rec-item">
              <span class="rec-priority ${escapeHtml(item.priority)}">${escapeHtml(item.priority)}</span>
              <div>
                <p>${escapeHtml(item.action)}</p>
                <small>${escapeHtml(item.owner || '')} · ${escapeHtml(item.expectedImpact || '')}</small>
              </div>
            </li>`,
            )
            .join('')}
        </ul>
      </div>
      <div>
        <div class="ai-section-title">数据局限</div>
        <ul class="risk-list">${(insight.risks || []).map((risk) => `<li>${escapeHtml(risk)}</li>`).join('')}</ul>
      </div>
      ${
        fallbackReason
          ? `<div class="ai-empty">当前为规则兜底：${escapeHtml(fallbackReason)}。配置 <code>LLM_API_KEY</code> 后重新生成即可调用大模型。</div>`
          : ''
      }`;
  }

  async function generateInsight() {
    const button = $('#ai-generate');
    const range = dateRange();
    button.disabled = true;
    button.textContent = '生成中…';
    try {
      const data = await api('/api/admin/analytics/interpret', {
        method: 'POST',
        body: { from: range.from, to: range.to },
      });
      state.latestInsight = data.insight;
      renderInsight(data.insight);
      toast(data.insight.source === 'llm' ? '大模型解读已生成' : '已使用规则兜底生成解读', 'success');
    } catch (error) {
      handleError(error);
    } finally {
      button.disabled = false;
      button.textContent = '生成解读';
    }
  }

  // ---------------- 活动 ----------------
  async function loadActivities() {
    const query = new URLSearchParams({
      page: state.activity.page,
      pageSize: state.activity.pageSize,
      ...(state.activity.keyword ? { keyword: state.activity.keyword } : {}),
      ...(state.activity.status ? { status: state.activity.status } : {}),
    });
    $('#activity-table').innerHTML = '<div class="table-empty">加载中…</div>';
    try {
      const data = await api(`/api/admin/activities?${query}`);
      renderActivityTable(data);
      renderPagination($('#activity-pagination'), data.page, data.total, data.pageSize, (page) => {
        state.activity.page = page;
        loadActivities();
      });
    } catch (error) {
      handleError(error);
      $('#activity-table').innerHTML = '<div class="table-empty">加载失败</div>';
    }
  }

  function renderActivityTable(data) {
    if (!data.list.length) {
      $('#activity-table').innerHTML = '<div class="table-empty">没有符合条件的活动</div>';
      return;
    }
    const rows = data.list
      .map((activity) => {
        const ratio = activity.quota ? Math.min(100, (activity.signupCount / activity.quota) * 100) : 0;
        const quotaClass = ratio >= 100 ? 'full' : ratio >= 80 ? 'warn' : '';
        return `
        <tr>
          <td>
            <div class="cell-title">
              <img class="cell-thumb" src="${escapeHtml(activity.cover || 'assets/cover-gs.svg')}" alt="" onerror="this.src='assets/cover-gs.svg'" />
              <div>
                <strong>${escapeHtml(activity.title)}</strong>
                <small>${escapeHtml(activity.location || '未设置地点')}</small>
              </div>
            </div>
          </td>
          <td>${formatTime(activity.startAt)}<br /><span class="mono">至 ${formatTime(activity.endAt)}</span></td>
          <td class="quota-cell">
            ${activity.signupCount} / ${activity.quota}
            <div class="quota-bar"><div class="quota-fill ${quotaClass}" style="width:${ratio}%"></div></div>
            <span class="mono">剩余 ${activity.remaining}</span>
          </td>
          <td><span class="status status-${activity.status}">${STATUS_LABELS[activity.status] || activity.status}</span></td>
          <td>
            <div class="actions">
              <button data-action="edit" data-id="${activity.id}">编辑</button>
              ${
                activity.status === 'published'
                  ? `<button data-action="offline" data-id="${activity.id}" class="danger">下架</button>`
                  : `<button data-action="publish" data-id="${activity.id}">发布</button>`
              }
              <button data-action="stats" data-id="${activity.id}">统计</button>
              <button data-action="export" data-id="${activity.id}">导出</button>
            </div>
          </td>
        </tr>`;
      })
      .join('');
    $('#activity-table').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>活动</th><th>时间</th><th>名额 / 报名</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function activityFormHtml(activity = null) {
    const now = new Date();
    const defaults = {
      title: '',
      subtitle: '',
      location: '',
      cover: 'assets/cover-gs.svg',
      description: '',
      startAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
      endAt: new Date(now.getTime() + 8 * 86400000).toISOString(),
      signupStartAt: now.toISOString(),
      signupEndAt: new Date(now.getTime() + 6 * 86400000).toISOString(),
      quota: 50,
      status: 'draft',
    };
    const value = { ...defaults, ...(activity || {}) };
    return `
      <form id="activity-form">
        <div class="form-row">
          <label class="field"><span>活动标题 *</span><input name="title" required maxlength="80" value="${escapeHtml(value.title)}" placeholder="例如：GS 探秘之旅 · 大连站" /></label>
          <label class="field"><span>副标题</span><input name="subtitle" maxlength="120" value="${escapeHtml(value.subtitle || '')}" placeholder="一句话亮点" /></label>
        </div>
        <div class="form-row">
          <label class="field"><span>活动地点</span><input name="location" maxlength="120" value="${escapeHtml(value.location || '')}" placeholder="大连 · 东港机车营地" /></label>
          <label class="field"><span>封面地址</span><input name="cover" maxlength="500" value="${escapeHtml(value.cover || '')}" placeholder="/admin/assets/cover-gs.svg" /></label>
        </div>
        <div class="form-row">
          <label class="field"><span>活动开始 *</span><input name="startAt" type="datetime-local" required value="${toLocalInput(value.startAt)}" /></label>
          <label class="field"><span>活动结束 *</span><input name="endAt" type="datetime-local" required value="${toLocalInput(value.endAt)}" /></label>
        </div>
        <div class="form-row">
          <label class="field"><span>报名开始 *</span><input name="signupStartAt" type="datetime-local" required value="${toLocalInput(value.signupStartAt)}" /></label>
          <label class="field"><span>报名截止 *</span><input name="signupEndAt" type="datetime-local" required value="${toLocalInput(value.signupEndAt)}" /></label>
        </div>
        <div class="form-row">
          <label class="field"><span>名额 *</span><input name="quota" type="number" min="1" max="100000" required value="${value.quota}" /></label>
          <label class="field"><span>发布状态</span>
            <select name="status">
              <option value="draft" ${value.status === 'draft' ? 'selected' : ''}>保存为草稿</option>
              <option value="published" ${value.status === 'published' ? 'selected' : ''}>立即发布</option>
              <option value="offline" ${value.status === 'offline' ? 'selected' : ''}>下架</option>
            </select>
          </label>
        </div>
        <label class="field"><span>活动详情</span><textarea name="description" maxlength="5000" placeholder="活动流程、注意事项、报名须知">${escapeHtml(value.description || '')}</textarea></label>
        <p class="form-hint">时间按中国时区（UTC+8）填写；报名截止不能晚于活动结束。名额不能小于当前已报名人数。</p>
        <p class="form-error hidden" id="activity-form-error"></p>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-close>取消</button>
          <button type="submit" class="btn btn-primary">${activity ? '保存修改' : '创建活动'}</button>
        </div>
      </form>`;
  }

  function openActivityForm(activity = null) {
    const modal = openModal({
      title: activity ? '编辑活动' : '发布活动',
      subtitle: activity ? `活动 #${activity.id}` : '填写活动信息，可先保存草稿',
      body: activityFormHtml(activity),
      size: 'lg',
    });
    const form = $('#activity-form', modal.root);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = $('#activity-form-error', form);
      errorBox.classList.add('hidden');
      const data = Object.fromEntries(new FormData(form).entries());
      const payload = {
        title: data.title.trim(),
        subtitle: data.subtitle.trim() || null,
        location: data.location.trim() || null,
        cover: data.cover.trim() || null,
        description: data.description.trim() || null,
        startAt: fromLocalInput(data.startAt),
        endAt: fromLocalInput(data.endAt),
        signupStartAt: fromLocalInput(data.signupStartAt),
        signupEndAt: fromLocalInput(data.signupEndAt),
        quota: Number(data.quota),
        status: data.status,
      };
      if (activity) payload.version = activity.version;
      const submit = $('button[type="submit"]', form);
      submit.disabled = true;
      submit.textContent = '保存中…';
      try {
        if (activity) {
          await api(`/api/admin/activities/${activity.id}`, { method: 'PUT', body: payload });
          toast('活动已更新', 'success');
        } else {
          await api('/api/admin/activities', { method: 'POST', body: payload });
          toast('活动已创建', 'success');
        }
        modal.close();
        state.activity.page = 1;
        await loadActivities();
        if (state.page === 'dashboard') await loadDashboard();
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.classList.remove('hidden');
      } finally {
        submit.disabled = false;
        submit.textContent = activity ? '保存修改' : '创建活动';
      }
    });
  }

  async function setActivityStatus(id, action) {
    const label = action === 'publish' ? '发布' : '下架';
    const confirmed = await confirmDialog(`确认${label}活动 #${id}？`, action === 'publish' ? '发布后 C 端立即可见并可报名。' : '下架后 C 端不可见，已产生的报名记录保留。');
    if (!confirmed) return;
    try {
      await api(`/api/admin/activities/${id}/${action}`, { method: 'POST' });
      toast(`活动已${label}`, 'success');
      await loadActivities();
      if (state.page === 'dashboard') await loadDashboard();
    } catch (error) {
      handleError(error);
    }
  }

  async function openStats(id) {
    const modal = openModal({
      title: '报名统计',
      subtitle: `活动 #${id}`,
      body: '<div class="table-empty">加载中…</div>',
      size: 'lg',
    });
    try {
      const [stats, signups] = await Promise.all([
        api(`/api/admin/activities/${id}/stats`),
        api(`/api/admin/activities/${id}/signups?page=1&pageSize=8`),
      ]);
      const maxDaily = Math.max(...stats.daily.map((item) => item.count), 1);
      const bars = stats.daily
        .map(
          (item) => `<div class="mini-bar" style="height:${Math.max(3, (item.count / maxDaily) * 64)}px" title="${item.day}: ${item.count}"><span>${item.day.slice(5)}</span></div>`,
        )
        .join('');
      const rows = signups.list.length
        ? signups.list
            .map(
              (item) => `<tr>
                <td class="mono">${escapeHtml(item.signupNo)}</td>
                <td>${escapeHtml(item.nickname)}</td>
                <td>${escapeHtml(item.phone)}</td>
                <td><span class="status status-${item.status === 'confirmed' ? 'active' : 'disabled'}">${item.statusLabel}</span></td>
                <td>${formatTime(item.createdAt)}</td>
              </tr>`,
            )
            .join('')
        : '<tr><td colspan="5" class="table-empty">暂无报名记录</td></tr>';
      modal.setBody(`
        <div class="stats-kpis">
          <div class="stats-kpi"><span>已报名</span><strong>${num(stats.signedUp)}</strong></div>
          <div class="stats-kpi"><span>剩余名额</span><strong>${num(stats.remaining)}</strong></div>
          <div class="stats-kpi"><span>报名率</span><strong>${pct(stats.signupRate)}</strong></div>
          <div class="stats-kpi"><span>取消报名</span><strong>${num(stats.cancelled)}</strong></div>
        </div>
        <div class="panel" style="box-shadow:none;padding:14px;margin-bottom:16px">
          <div class="panel-head" style="margin-bottom:4px"><div><h3>近 14 天报名</h3><p>${escapeHtml(stats.activity.title)}</p></div></div>
          <div class="mini-bars">${bars}</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>报名编号</th><th>昵称</th><th>手机号</th><th>状态</th><th>报名时间</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-close>关闭</button>
          <button type="button" class="btn btn-primary" id="stats-export">导出完整名单 CSV</button>
        </div>`);
      $('#stats-export', modal.root).addEventListener('click', () => downloadExport(id));
    } catch (error) {
      handleError(error);
      modal.setBody('<div class="empty-state"><strong>统计加载失败</strong></div>');
    }
  }

  async function downloadExport(id) {
    try {
      const response = await api(`/api/admin/activities/${id}/signups/export`, { raw: true });
      if (!response.ok) {
        const text = await response.text();
        let message = '导出失败';
        try {
          message = JSON.parse(text).message || message;
        } catch {}
        throw new ApiError(message, 0, response.status);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `activity-${id}-signups-${cnDay()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast('名单已导出', 'success');
    } catch (error) {
      handleError(error);
    }
  }

  // ---------------- 用户 ----------------
  async function loadUsers() {
    const query = new URLSearchParams({
      page: state.user.page,
      pageSize: state.user.pageSize,
      ...(state.user.keyword ? { keyword: state.user.keyword } : {}),
      ...(state.user.status ? { status: state.user.status } : {}),
    });
    $('#user-table').innerHTML = '<div class="table-empty">加载中…</div>';
    try {
      const data = await api(`/api/admin/users?${query}`);
      $('#user-summary').textContent = `正常 ${data.summary.active} · 禁用 ${data.summary.disabled} · 共 ${data.total} 条`;
      renderUserTable(data);
      renderPagination($('#user-pagination'), data.page, data.total, data.pageSize, (page) => {
        state.user.page = page;
        loadUsers();
      });
    } catch (error) {
      handleError(error);
      $('#user-table').innerHTML = '<div class="table-empty">加载失败</div>';
    }
  }

  function renderUserTable(data) {
    if (!data.list.length) {
      $('#user-table').innerHTML = '<div class="table-empty">没有符合条件的用户</div>';
      return;
    }
    const rows = data.list
      .map(
        (user) => `
        <tr>
          <td>
            <div class="cell-title">
              <span class="avatar-sm">${escapeHtml((user.nickname || '微').slice(0, 1))}</span>
              <div><strong>${escapeHtml(user.nickname)}</strong><small class="mono">${escapeHtml(user.openid)}</small></div>
            </div>
          </td>
          <td>${escapeHtml(user.phone || '未授权')}</td>
          <td><span class="status status-${user.status}">${user.status === 'active' ? '正常' : '已禁用'}</span></td>
          <td>${num(user.signupCount)}</td>
          <td>${formatTime(user.createdAt, false)}</td>
          <td>
            <div class="actions">
              <button data-action="signups" data-id="${user.id}">报名记录</button>
              ${
                user.status === 'active'
                  ? `<button data-action="disable" data-id="${user.id}" data-name="${escapeHtml(user.nickname)}" class="danger">禁用</button>`
                  : `<button data-action="enable" data-id="${user.id}" data-name="${escapeHtml(user.nickname)}">启用</button>`
              }
            </div>
          </td>
        </tr>`,
      )
      .join('');
    $('#user-table').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>用户</th><th>手机号</th><th>状态</th><th>报名</th><th>注册时间</th><th>操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function openDisableUser(id, nickname) {
    const modal = openModal({
      title: '禁用用户',
      subtitle: `${nickname} · #${id}`,
      body: `
        <form id="disable-form">
          <label class="field"><span>禁用原因 *</span><textarea name="reason" required maxlength="200" placeholder="例如：恶意刷报名、虚假手机号"></textarea></label>
          <p class="form-hint">禁用后该用户的 token 立即失效，无法重新登录和报名；历史报名记录保留。</p>
          <p class="form-error hidden" id="disable-error"></p>
          <div class="modal-foot">
            <button type="button" class="btn btn-ghost" data-close>取消</button>
            <button type="submit" class="btn btn-danger">确认禁用</button>
          </div>
        </form>`,
    });
    $('#disable-form', modal.root).addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const reason = new FormData(form).get('reason').trim();
      try {
        await api(`/api/admin/users/${id}/status`, { method: 'PATCH', body: { status: 'disabled', reason } });
        modal.close();
        toast('用户已禁用', 'success');
        await loadUsers();
      } catch (error) {
        const box = $('#disable-error', form);
        box.textContent = error.message;
        box.classList.remove('hidden');
      }
    });
  }

  async function enableUser(id) {
    if (!(await confirmDialog('确认启用该用户？', '启用后用户可以重新登录并报名。'))) return;
    try {
      await api(`/api/admin/users/${id}/status`, { method: 'PATCH', body: { status: 'active' } });
      toast('用户已启用', 'success');
      await loadUsers();
    } catch (error) {
      handleError(error);
    }
  }

  async function openUserSignups(id) {
    const modal = openModal({ title: '报名记录', subtitle: `用户 #${id}`, body: '<div class="table-empty">加载中…</div>', size: 'lg' });
    try {
      const data = await api(`/api/admin/users/${id}/signups?page=1&pageSize=20`);
      const rows = data.list.length
        ? data.list
            .map(
              (item) => `<tr>
                <td>${escapeHtml(item.activity.title)}</td>
                <td class="mono">${escapeHtml(item.signupNo)}</td>
                <td><span class="status status-${item.status === 'confirmed' ? 'active' : 'disabled'}">${item.status === 'confirmed' ? '已报名' : '已取消'}</span></td>
                <td>${formatTime(item.createdAt)}</td>
              </tr>`,
            )
            .join('')
        : '<tr><td colspan="4" class="table-empty">暂无报名记录</td></tr>';
      modal.setBody(`
        <div class="table-wrap"><table><thead><tr><th>活动</th><th>报名编号</th><th>状态</th><th>时间</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>关闭</button></div>`);
    } catch (error) {
      handleError(error);
      modal.setBody('<div class="empty-state"><strong>加载失败</strong></div>');
    }
  }

  // ---------------- 后台账号 ----------------
  async function loadAdmins() {
    if (state.admin?.role !== 'super_admin') return;
    const query = new URLSearchParams({
      page: state.adminList.page,
      pageSize: state.adminList.pageSize,
      ...(state.adminList.keyword ? { keyword: state.adminList.keyword } : {}),
    });
    $('#admin-table').innerHTML = '<div class="table-empty">加载中…</div>';
    try {
      const data = await api(`/api/admin/admins?${query}`);
      renderAdminTable(data);
      renderPagination($('#admin-pagination'), data.page, data.total, data.pageSize, (page) => {
        state.adminList.page = page;
        loadAdmins();
      });
    } catch (error) {
      handleError(error);
      $('#admin-table').innerHTML = '<div class="table-empty">加载失败</div>';
    }
  }

  function renderAdminTable(data) {
    if (!data.list.length) {
      $('#admin-table').innerHTML = '<div class="table-empty">暂无后台账号</div>';
      return;
    }
    const rows = data.list
      .map(
        (admin) => `
        <tr>
          <td>
            <div class="cell-title">
              <span class="avatar-sm">${escapeHtml(admin.displayName.slice(0, 1))}</span>
              <div><strong>${escapeHtml(admin.displayName)}</strong><small class="mono">${escapeHtml(admin.username)}</small></div>
            </div>
          </td>
          <td>${escapeHtml(admin.roleLabel || ROLE_LABELS[admin.role])}</td>
          <td><span class="status status-${admin.status}">${admin.status === 'active' ? '启用' : '禁用'}</span></td>
          <td>${formatTime(admin.lastLoginAt)}</td>
          <td>${formatTime(admin.createdAt, false)}</td>
          <td>
            <div class="actions">
              <button data-action="edit-admin" data-id="${admin.id}">编辑</button>
              <button data-action="reset-password" data-id="${admin.id}">重置密码</button>
            </div>
          </td>
        </tr>`,
      )
      .join('');
    $('#admin-table').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>账号</th><th>角色</th><th>状态</th><th>最近登录</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function openAdminForm(admin = null) {
    const modal = openModal({
      title: admin ? '编辑后台账号' : '新建后台账号',
      subtitle: admin ? admin.username : '至少两种角色：超级管理员 / 运营管理员',
      body: `
        <form id="admin-form">
          <div class="form-row">
            <label class="field"><span>用户名 *</span><input name="username" required minlength="3" maxlength="40" value="${escapeHtml(admin?.username || '')}" ${admin ? 'disabled' : ''} placeholder="例如：operator2" /></label>
            <label class="field"><span>显示名称 *</span><input name="displayName" required maxlength="40" value="${escapeHtml(admin?.displayName || '')}" placeholder="运营小王" /></label>
          </div>
          ${
            admin
              ? ''
              : `<label class="field"><span>初始密码 *</span><input name="password" type="password" required minlength="8" maxlength="128" placeholder="至少 8 位" /></label>`
          }
          <div class="form-row">
            <label class="field"><span>角色 *</span>
              <select name="role">
                <option value="operator" ${admin?.role === 'operator' ? 'selected' : ''}>运营管理员（活动 / 用户 / 分析）</option>
                <option value="super_admin" ${admin?.role === 'super_admin' ? 'selected' : ''}>超级管理员（含账号管理）</option>
              </select>
            </label>
            <label class="field"><span>状态</span>
              <select name="status">
                <option value="active" ${admin?.status !== 'disabled' ? 'selected' : ''}>启用</option>
                <option value="disabled" ${admin?.status === 'disabled' ? 'selected' : ''}>禁用</option>
              </select>
            </label>
          </div>
          <p class="form-hint">不能禁用自己，也不能移除最后一名启用的超级管理员。</p>
          <p class="form-error hidden" id="admin-form-error"></p>
          <div class="modal-foot">
            <button type="button" class="btn btn-ghost" data-close>取消</button>
            <button type="submit" class="btn btn-primary">${admin ? '保存修改' : '创建账号'}</button>
          </div>
        </form>`,
    });
    $('#admin-form', modal.root).addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form).entries());
      const box = $('#admin-form-error', form);
      const submit = $('button[type="submit"]', form);
      submit.disabled = true;
      try {
        if (admin) {
          await api(`/api/admin/admins/${admin.id}`, {
            method: 'PUT',
            body: { displayName: data.displayName, role: data.role, status: data.status },
          });
          toast('账号已更新', 'success');
        } else {
          await api('/api/admin/admins', {
            method: 'POST',
            body: {
              username: data.username,
              password: data.password,
              displayName: data.displayName,
              role: data.role,
            },
          });
          toast('账号已创建', 'success');
        }
        modal.close();
        await loadAdmins();
      } catch (error) {
        box.textContent = error.message;
        box.classList.remove('hidden');
      } finally {
        submit.disabled = false;
      }
    });
  }

  function openResetPassword(id) {
    const modal = openModal({
      title: '重置密码',
      subtitle: `后台账号 #${id}`,
      body: `
        <form id="password-form">
          <label class="field"><span>新密码 *</span><input name="password" type="password" required minlength="8" maxlength="128" placeholder="至少 8 位" /></label>
          <p class="form-error hidden" id="password-error"></p>
          <div class="modal-foot">
            <button type="button" class="btn btn-ghost" data-close>取消</button>
            <button type="submit" class="btn btn-primary">确认重置</button>
          </div>
        </form>`,
    });
    $('#password-form', modal.root).addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const password = new FormData(form).get('password');
      try {
        await api(`/api/admin/admins/${id}/reset-password`, { method: 'POST', body: { password } });
        modal.close();
        toast('密码已重置', 'success');
      } catch (error) {
        const box = $('#password-error', form);
        box.textContent = error.message;
        box.classList.remove('hidden');
      }
    });
  }

  // ---------------- 通用组件 ----------------
  function renderPagination(container, page, total, pageSize, onChange) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    container.innerHTML = `
      <span>共 ${num(total)} 条 · 第 ${page} / ${pages} 页</span>
      <button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>上一页</button>
      <button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>下一页</button>`;
    $$('button[data-page]', container).forEach((button) => {
      button.addEventListener('click', () => {
        const next = Number(button.dataset.page);
        if (next >= 1 && next <= pages && next !== page) onChange(next);
      });
    });
  }

  function openModal({ title, subtitle = '', body = '', footer = '', size = '' }) {
    const root = $('#modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal ${size === 'lg' ? 'modal-lg' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <div class="modal-head">
            <div><h3>${escapeHtml(title)}</h3>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div>
            <button class="modal-close" type="button" aria-label="关闭" data-close>×</button>
          </div>
          <div class="modal-body"></div>
          ${footer || ''}
        </div>
      </div>`;
    const backdrop = $('.modal-backdrop', root);
    const bodyNode = $('.modal-body', root);
    if (body) bodyNode.innerHTML = body;
    const close = () => {
      root.innerHTML = '';
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
    $$('[data-close]', root).forEach((button) => button.addEventListener('click', close));
    return {
      root,
      close,
      setBody(html) {
        bodyNode.innerHTML = html;
        $$('[data-close]', root).forEach((button) => button.addEventListener('click', close));
      },
    };
  }

  function confirmDialog(title, message) {
    return new Promise((resolve) => {
      const modal = openModal({
        title,
        body: `<p class="muted" style="margin:0 0 14px">${escapeHtml(message)}</p>
          <div class="modal-foot">
            <button type="button" class="btn btn-ghost" data-close>取消</button>
            <button type="button" class="btn btn-primary" id="confirm-ok">确认</button>
          </div>`,
      });
      $('#confirm-ok', modal.root).addEventListener('click', () => {
        modal.close();
        resolve(true);
      });
      const observer = new MutationObserver(() => {
        if (!$('#modal-root').innerHTML) {
          observer.disconnect();
          resolve(false);
        }
      });
      observer.observe($('#modal-root'), { childList: true });
    });
  }

  // ---------------- 事件绑定 ----------------
  function bindEvents() {
    $('#login-form').addEventListener('submit', handleLogin);
    $('#logout-btn').addEventListener('click', () => logout(true));
    $('#refresh-btn').addEventListener('click', () => switchPage(state.page));
    $('#ai-generate').addEventListener('click', generateInsight);

    $$('.nav-item').forEach((button) => button.addEventListener('click', () => switchPage(button.dataset.page)));
    $$('.chip[data-days]').forEach((button) =>
      button.addEventListener('click', () => {
        state.days = Number(button.dataset.days);
        $$('.chip[data-days]').forEach((chip) => chip.classList.toggle('active', chip === button));
        loadDashboard();
      }),
    );

    $('#activity-search-btn').addEventListener('click', () => {
      state.activity.keyword = $('#activity-search').value.trim();
      state.activity.status = $('#activity-status').value;
      state.activity.page = 1;
      loadActivities();
    });
    $('#activity-search').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') $('#activity-search-btn').click();
    });
    $('#activity-create').addEventListener('click', () => openActivityForm());
    $('#activity-table').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const id = Number(button.dataset.id);
      const action = button.dataset.action;
      if (action === 'edit') {
        api(`/api/admin/activities/${id}`).then((activity) => openActivityForm(activity)).catch(handleError);
      }
      if (action === 'publish' || action === 'offline') setActivityStatus(id, action);
      if (action === 'stats') openStats(id);
      if (action === 'export') downloadExport(id);
    });

    $('#user-search-btn').addEventListener('click', () => {
      state.user.keyword = $('#user-search').value.trim();
      state.user.status = $('#user-status').value;
      state.user.page = 1;
      loadUsers();
    });
    $('#user-search').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') $('#user-search-btn').click();
    });
    $('#user-table').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const id = Number(button.dataset.id);
      const action = button.dataset.action;
      if (action === 'disable') openDisableUser(id, button.dataset.name || `用户 #${id}`);
      if (action === 'enable') enableUser(id);
      if (action === 'signups') openUserSignups(id);
    });

    $('#admin-search-btn').addEventListener('click', () => {
      state.adminList.keyword = $('#admin-search').value.trim();
      state.adminList.page = 1;
      loadAdmins();
    });
    $('#admin-search').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') $('#admin-search-btn').click();
    });
    $('#admin-create').addEventListener('click', () => openAdminForm());
    $('#admin-table').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const id = Number(button.dataset.id);
      const action = button.dataset.action;
      if (action === 'edit-admin') {
        api(`/api/admin/admins?page=1&pageSize=100`).then((data) => {
          const admin = data.list.find((item) => item.id === id);
          if (admin) openAdminForm(admin);
        }).catch(handleError);
      }
      if (action === 'reset-password') openResetPassword(id);
    });
  }

  function init() {
    bindEvents();
    if (state.token) restoreSession();
    else showLogin();
  }

  init();
})();
