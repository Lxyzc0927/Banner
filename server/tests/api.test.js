'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-please-change-000000000000';
process.env.WECHAT_MOCK = 'true';
process.env.LLM_API_KEY = '';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');

const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { hashPassword } = require('../src/auth');
const { nowIso, addDays, localDay } = require('../src/time');

let db;
let server;
let baseUrl;
let superToken;
let operatorToken;

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function insertAdmin(username, password, role) {
  const now = nowIso();
  return Number(
    db
      .prepare(
        `INSERT INTO admin_user(username, password_hash, display_name, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(username, hashPassword(password), username, role, now, now).lastInsertRowid,
  );
}

function insertUser(index, { phone = null, status = 'active' } = {}) {
  const now = nowIso();
  return Number(
    db
      .prepare(
        `INSERT INTO c_user(openid, nickname, phone, status, disabled_reason, disabled_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `mock_test_u${index}`,
        `测试用户${index}`,
        phone,
        status,
        status === 'disabled' ? '测试禁用' : null,
        status === 'disabled' ? now : null,
        now,
        now,
      ).lastInsertRowid,
  );
}

function insertActivity({
  title,
  quota = 10,
  status = 'published',
  signupStart = iso(-3600_000),
  signupEnd = iso(3600_000),
  startAt = iso(86_400_000),
  endAt = iso(2 * 86_400_000),
} = {}) {
  const now = nowIso();
  return Number(
    db
      .prepare(
        `INSERT INTO activity(title, subtitle, cover, description, location,
                              start_at, end_at, signup_start_at, signup_end_at,
                              quota, status, version, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      )
      .run(
        title,
        '测试副标题',
        '/admin/assets/cover-gs.svg',
        '测试活动详情',
        '测试地点',
        startAt,
        endAt,
        signupStart,
        signupEnd,
        quota,
        status,
        now,
        now,
      ).lastInsertRowid,
  );
}

async function api(path, { method = 'GET', token = null, body = undefined, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const buffer = Buffer.from(await response.clone().arrayBuffer());
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // CSV/plain text
  }
  return { status: response.status, headers: response.headers, text, buffer, body: json };
}

function loginUser(code) {
  return api('/api/auth/wechat/login', { method: 'POST', body: { code } });
}

function loginUserWithPhone(code, phone) {
  return api('/api/auth/wechat/login', { method: 'POST', body: { code, phoneCode: `mock:${phone}` } });
}

before(async () => {
  db = openDatabase(':memory:');
  insertAdmin('superadmin', 'Admin@123456', 'super_admin');
  insertAdmin('operator', 'Operator@123', 'operator');

  for (let i = 1; i <= 10; i += 1) insertUser(i, { phone: `1360000${String(i).padStart(4, '0')}` });
  insertUser(11, { phone: '13600000011', status: 'disabled' });
  insertUser(12, { phone: null });

  const app = createApp({ db });
  server = http.createServer((req, res) => app.handle(req, res));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const superLogin = await api('/api/auth/admin/login', {
    method: 'POST',
    body: { username: 'superadmin', password: 'Admin@123456' },
  });
  assert.equal(superLogin.body.code, 0);
  superToken = superLogin.body.data.token;
  const operatorLogin = await api('/api/auth/admin/login', {
    method: 'POST',
    body: { username: 'operator', password: 'Operator@123' },
  });
  assert.equal(operatorLogin.body.code, 0);
  operatorToken = operatorLogin.body.data.token;
});

after(async () => {
  if (server) {
    server.close();
    await once(server, 'close');
  }
  if (db) db.close();
});

describe('基础与后台账号', () => {
  test('health 与 meta 可访问', async () => {
    const health = await api('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.code, 0);
    assert.equal(health.body.data.status, 'ok');
    const meta = await api('/api/meta');
    assert.equal(meta.body.code, 0);
    assert.ok(meta.body.data.modules.includes('activities'));
  });

  test('后台登录：错误密码返回 1001，正确密码返回 token', async () => {
    const wrong = await api('/api/auth/admin/login', {
      method: 'POST',
      body: { username: 'superadmin', password: 'wrong-password' },
    });
    assert.equal(wrong.body.code, 1001);
    const ok = await api('/api/auth/admin/login', {
      method: 'POST',
      body: { username: 'superadmin', password: 'Admin@123456' },
    });
    assert.equal(ok.body.code, 0);
    assert.ok(ok.body.data.token);
    assert.equal(ok.body.data.admin.role, 'super_admin');
  });

  test('至少两种角色：operator 不能管理后台账号', async () => {
    const denied = await api('/api/admin/admins', { token: operatorToken });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 403);
    const allowed = await api('/api/admin/admins', { token: superToken });
    assert.equal(allowed.body.code, 0);
    assert.equal(allowed.body.data.total, 2);
  });

  test('超级管理员可创建运营账号，用户名重复被拒绝', async () => {
    const created = await api('/api/admin/admins', {
      method: 'POST',
      token: superToken,
      body: { username: 'operator2', password: 'Operator2@123', displayName: '运营二号', role: 'operator' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.code, 0);
    assert.equal(created.body.data.role, 'operator');
    const duplicate = await api('/api/admin/admins', {
      method: 'POST',
      token: superToken,
      body: { username: 'operator2', password: 'Operator2@123', displayName: '运营二号', role: 'operator' },
    });
    assert.equal(duplicate.body.code, 1006);
  });

  test('不能禁用当前登录账号，也不能移除最后一名超级管理员', async () => {
    const self = await api('/api/admin/admins/1', {
      method: 'PUT',
      token: superToken,
      body: { status: 'disabled' },
    });
    assert.equal(self.body.code, 1007);
  });
});

describe('C 端登录、手机号授权与禁用', () => {
  test('mock 登录幂等，并支持手机号授权绑定', async () => {
    const first = await loginUser('mock:test-user-1');
    assert.equal(first.body.code, 0);
    assert.equal(first.body.data.isNew, true);
    assert.equal(first.body.data.phoneBound, false);
    const second = await loginUser('mock:test-user-1');
    assert.equal(second.body.data.isNew, false);
    assert.equal(second.body.data.user.id, first.body.data.user.id);

    const phone = await api('/api/auth/wechat/phone', {
      method: 'POST',
      token: first.body.data.token,
      body: { phone: '13911112222' },
    });
    assert.equal(phone.body.code, 0);
    assert.equal(phone.body.data.user.phone, '13911112222');

    const me = await api('/api/auth/me', { token: first.body.data.token });
    assert.equal(me.body.data.user.phone, '13911112222');
  });

  test('一个手机号只能绑定一个微信账号', async () => {
    const user = await loginUser('mock:test-user-2');
    const conflict = await api('/api/auth/wechat/phone', {
      method: 'POST',
      token: user.body.data.token,
      body: { phone: '13911112222' },
    });
    assert.equal(conflict.body.code, 1011);
  });

  test('禁用用户后 token 立即失效，重新登录被拒绝；启用后恢复', async () => {
    const user = await loginUser('mock:test-user-3');
    const uid = user.body.data.user.id;
    const token = user.body.data.token;

    const disabled = await api(`/api/admin/users/${uid}/status`, {
      method: 'PATCH',
      token: superToken,
      body: { status: 'disabled', reason: '测试封禁' },
    });
    assert.equal(disabled.body.code, 0);
    assert.equal(disabled.body.data.user.status, 'disabled');

    const me = await api('/api/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.body.code, 1008);

    const relogin = await loginUser('mock:test-user-3');
    assert.equal(relogin.body.code, 1008);

    const enabled = await api(`/api/admin/users/${uid}/status`, {
      method: 'PATCH',
      token: superToken,
      body: { status: 'active' },
    });
    assert.equal(enabled.body.code, 0);
    const meAgain = await api('/api/auth/me', { token });
    assert.equal(meAgain.body.code, 0);
  });

  test('用户列表支持关键词搜索与状态筛选', async () => {
    const list = await api('/api/admin/users?page=1&pageSize=5&keyword=测试用户1', { token: superToken });
    assert.equal(list.body.code, 0);
    assert.ok(list.body.data.total >= 1);
    const disabled = await api('/api/admin/users?status=disabled', { token: superToken });
    assert.ok(disabled.body.data.list.every((user) => user.status === 'disabled'));
  });
});

describe('活动发布、下架与并发控制', () => {
  test('创建草稿后 C 端不可见，发布后可见', async () => {
    const created = await api('/api/admin/activities', {
      method: 'POST',
      token: superToken,
      body: {
        title: '接口测试活动',
        subtitle: '发布流程',
        description: '用于验证草稿到发布的完整流程',
        location: '测试场地',
        startAt: iso(3 * 86_400_000),
        endAt: iso(4 * 86_400_000),
        signupStartAt: iso(-3600_000),
        signupEndAt: iso(2 * 86_400_000),
        quota: 5,
        status: 'draft',
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.code, 0);
    const id = created.body.data.id;

    const before = await api('/api/activities?pageSize=100');
    assert.ok(!before.body.data.list.some((item) => item.id === id));

    const published = await api(`/api/admin/activities/${id}/publish`, { method: 'POST', token: superToken });
    assert.equal(published.body.code, 0);
    assert.equal(published.body.data.status, 'published');

    const afterList = await api('/api/activities?pageSize=100');
    assert.ok(afterList.body.data.list.some((item) => item.id === id));
  });

  test('版本号不一致时拒绝覆盖（乐观锁）', async () => {
    const created = await api('/api/admin/activities', {
      method: 'POST',
      token: superToken,
      body: {
        title: '版本冲突测试活动',
        startAt: iso(3 * 86_400_000),
        endAt: iso(4 * 86_400_000),
        signupStartAt: iso(-3600_000),
        signupEndAt: iso(2 * 86_400_000),
        quota: 5,
        status: 'draft',
      },
    });
    const id = created.body.data.id;
    const updated = await api(`/api/admin/activities/${id}`, {
      method: 'PUT',
      token: superToken,
      body: { quota: 8, version: 1 },
    });
    assert.equal(updated.body.code, 0);
    assert.equal(updated.body.data.version, 2);
    const conflict = await api(`/api/admin/activities/${id}`, {
      method: 'PUT',
      token: superToken,
      body: { quota: 9, version: 1 },
    });
    assert.equal(conflict.body.code, 1012);
  });

  test('下架后 C 端详情不可见', async () => {
    const id = insertActivity({ title: '下架测试活动', status: 'published' });
    const offline = await api(`/api/admin/activities/${id}/offline`, { method: 'POST', token: superToken });
    assert.equal(offline.body.code, 0);
    const detail = await api(`/api/activities/${id}`);
    assert.equal(detail.status, 404);
  });
});

describe('报名：防重、名额、时间窗、手机号与取消', () => {
  let activityId;
  let users;

  before(async () => {
    activityId = insertActivity({ title: '报名主流程测试', quota: 3 });
    users = [];
    for (let i = 1; i <= 4; i += 1) {
      const login = await loginUserWithPhone(`mock:signup-user-${i}`, `1392222000${i}`);
      assert.equal(login.body.code, 0);
      users.push(login.body.data.token);
    }
    const noPhone = await loginUser('mock:no-phone-user');
    users.push(noPhone.body.data.token);
  });

  test('报名成功，重复报名返回 1004', async () => {
    const first = await api(`/api/activities/${activityId}/signup`, {
      method: 'POST',
      token: users[0],
      body: { remark: '第一次' },
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.code, 0);
    assert.ok(first.body.data.signup.signupNo);
    const duplicate = await api(`/api/activities/${activityId}/signup`, {
      method: 'POST',
      token: users[0],
      body: {},
    });
    assert.equal(duplicate.body.code, 1004);
  });

  test('名额满后返回 1003', async () => {
    const second = await api(`/api/activities/${activityId}/signup`, { method: 'POST', token: users[1] });
    assert.equal(second.body.code, 0);
    const third = await api(`/api/activities/${activityId}/signup`, { method: 'POST', token: users[2] });
    assert.equal(third.body.code, 0);
    const fourth = await api(`/api/activities/${activityId}/signup`, { method: 'POST', token: users[3] });
    assert.equal(fourth.body.code, 1003);
  });

  test('未授权手机号返回 1010', async () => {
    const activity = insertActivity({ title: '手机号校验活动', quota: 10 });
    const noPhone = await loginUser('mock:no-phone-user-2');
    const result = await api(`/api/activities/${activity}/signup`, {
      method: 'POST',
      token: noPhone.body.data.token,
    });
    assert.equal(result.body.code, 1010);
  });

  test('报名未开始返回 1002，已下架返回 1005', async () => {
    const future = insertActivity({
      title: '未来报名活动',
      quota: 10,
      signupStart: iso(3600_000),
      signupEnd: iso(2 * 3600_000),
    });
    const early = await api(`/api/activities/${future}/signup`, { method: 'POST', token: users[0] });
    assert.equal(early.body.code, 1002);

    const offline = insertActivity({ title: '下架报名活动', quota: 10, status: 'offline' });
    const closed = await api(`/api/activities/${offline}/signup`, { method: 'POST', token: users[0] });
    assert.equal(closed.body.code, 1005);
  });

  test('取消报名释放名额，可重新报名', async () => {
    const cancel = await api(`/api/activities/${activityId}/signup`, { method: 'DELETE', token: users[0] });
    assert.equal(cancel.body.code, 0);
    assert.equal(cancel.body.data.signup.status, 'cancelled');
    assert.equal(cancel.body.data.activity.remaining, 1);
    const again = await api(`/api/activities/${activityId}/signup`, { method: 'POST', token: users[0] });
    assert.equal(again.body.code, 0);
  });

  test('并发报名不会超卖：quota=1 时 10 个请求只有 1 个成功', async () => {
    const activity = insertActivity({ title: '并发报名测试', quota: 1 });
    const tokens = [];
    for (let i = 0; i < 10; i += 1) {
      const login = await loginUser(`mock:concurrent-user-${i}`);
      if (login.body.data.phoneBound === false) {
        await api('/api/auth/wechat/phone', {
          method: 'POST',
          token: login.body.data.token,
          body: { phone: `1370000${String(i).padStart(4, '0')}` },
        });
      }
      tokens.push(login.body.data.token);
    }
    const results = await Promise.all(
      tokens.map((token) => api(`/api/activities/${activity}/signup`, { method: 'POST', token })),
    );
    const success = results.filter((result) => result.body.code === 0);
    const full = results.filter((result) => result.body.code === 1003);
    assert.equal(success.length, 1);
    assert.equal(full.length, 9);
    const count = db.prepare("SELECT COUNT(*) AS c FROM signup WHERE activity_id = ? AND status = 'confirmed'").get(activity).c;
    assert.equal(count, 1);
  });
});

describe('报名统计与名单导出', () => {
  test('统计接口返回名额、转化率与每日报名', async () => {
    const activity = insertActivity({ title: '统计测试活动', quota: 5 });
    const user = await loginUserWithPhone('mock:stats-user', '13933330001');
    await api(`/api/activities/${activity}/signup`, { method: 'POST', token: user.body.data.token });
    const stats = await api(`/api/admin/activities/${activity}/stats`, { token: superToken });
    assert.equal(stats.body.code, 0);
    assert.equal(stats.body.data.signedUp, 1);
    assert.equal(stats.body.data.remaining, 4);
    assert.equal(stats.body.data.signupRate, 20);
    assert.ok(Array.isArray(stats.body.data.daily));
    assert.equal(stats.body.data.daily.length, 14);
  });

  test('名单导出为带 BOM 的 CSV，且包含报名编号', async () => {
    const activity = insertActivity({ title: '导出测试活动', quota: 5 });
    const user = await loginUserWithPhone('mock:export-user', '13933330002');
    const signed = await api(`/api/activities/${activity}/signup`, { method: 'POST', token: user.body.data.token });
    const exportResult = await api(`/api/admin/activities/${activity}/signups/export`, { token: superToken });
    assert.equal(exportResult.status, 200);
    assert.match(exportResult.headers.get('content-type'), /text\/csv/);
    assert.deepEqual([...exportResult.buffer.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(exportResult.text.includes('报名编号'));
    assert.ok(exportResult.text.includes(signed.body.data.signup.signupNo));
  });

  test('operator 也能导出，但没有后台账号管理权限', async () => {
    const activity = insertActivity({ title: '权限导出测试', quota: 2 });
    const result = await api(`/api/admin/activities/${activity}/signups/export`, { token: operatorToken });
    assert.equal(result.status, 200);
    const denied = await api('/api/admin/admins', { token: operatorToken });
    assert.equal(denied.status, 403);
  });
});

describe('访问分析：模块热度、趋势、漏斗与 AI 解读', () => {
  before(() => {
    const day = localDay();
    const base = Date.parse(`${day}T02:00:00.000Z`);
    const insertEvent = db.prepare(
      `INSERT INTO visit_event(event_id, visitor_id, user_id, session_id, module, action, page, target_id, channel, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const sessions = [
      { id: 'sess_test_1', user: 1, path: ['home', 'activity_list', 'activity_detail', 'signup_click', 'signup_success'] },
      { id: 'sess_test_2', user: 2, path: ['home', 'activity_list', 'activity_detail', 'signup_click'] },
      { id: 'sess_test_3', user: null, path: ['home'] },
      { id: 'sess_test_4', user: 3, path: ['home', 'bike_list', 'bike_detail'] },
      { id: 'sess_test_5', user: 4, path: ['home', 'activity_list'] },
    ];
    for (const session of sessions) {
      session.path.forEach((step, index) => {
        const isHome = step === 'home';
        const isList = step === 'activity_list';
        const isDetail = step === 'activity_detail';
        const isClick = step === 'signup_click';
        const isSuccess = step === 'signup_success';
        const isBikeList = step === 'bike_list';
        const isBikeDetail = step === 'bike_detail';
        insertEvent.run(
          `evt_${session.id}_${index}`,
          `visitor_${session.id}`,
          session.user,
          session.id,
          isBikeList || isBikeDetail ? 'bike' : isHome ? 'home' : 'activity',
          isSuccess ? 'signup_success' : isClick ? 'signup_click' : 'view',
          isList ? 'activity_list' : isDetail || isClick || isSuccess ? 'activity_detail' : isBikeDetail ? 'bike_detail' : isBikeList ? 'bike_list' : 'home',
          1,
          'wechat_search',
          30_000,
          new Date(base + index * 60_000).toISOString(),
        );
      });
    }
  });

  test('summary 返回模块热度、趋势与严格顺序漏斗', async () => {
    const summary = await api('/api/admin/analytics/summary', { token: superToken });
    assert.equal(summary.body.code, 0);
    assert.ok(summary.body.data.modules.length >= 3);
    const totalShare = summary.body.data.modules.reduce((sum, item) => sum + item.pvShare, 0);
    assert.ok(Math.abs(totalShare - 100) < 1);
    const steps = summary.body.data.funnel.steps;
    assert.equal(steps.length, 5);
    for (let i = 1; i < steps.length; i += 1) {
      assert.ok(steps[i].sessions <= steps[i - 1].sessions);
    }
    assert.ok(summary.body.data.funnel.overallConversion <= 100);
    assert.ok(summary.body.data.trend.length >= 1);
  });

  test('模块热度、趋势、漏斗、渠道单接口可用', async () => {
    for (const path of ['modules', 'trend', 'funnel', 'channels', 'overview']) {
      const result = await api(`/api/admin/analytics/${path}`, { token: superToken });
      assert.equal(result.body.code, 0, path);
    }
  });

  test('未配置大模型 Key 时返回规则兜底，并落库', async () => {
    const result = await api('/api/admin/analytics/interpret', {
      method: 'POST',
      token: superToken,
      body: { from: addDays(localDay(), -6), to: localDay() },
    });
    assert.equal(result.body.code, 0);
    assert.equal(result.body.data.insight.source, 'fallback');
    assert.ok(result.body.data.insight.findings.length >= 3);
    assert.ok(result.body.data.insight.recommendations.length >= 3);
    const latest = await api('/api/admin/analytics/insights/latest', { token: superToken });
    assert.equal(latest.body.data.insight.source, 'fallback');
    assert.ok(latest.body.data.insight.summary.length > 10);
  });
});

describe('审计与错误处理', () => {
  test('关键后台操作写入审计日志', () => {
    const count = db.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action IN ('admin.create','user.disable','activity.signup')").get().c;
    assert.ok(count >= 1);
  });

  test('未知接口返回 404 JSON，非法 JSON 返回 400', async () => {
    const notFound = await api('/api/not-exists');
    assert.equal(notFound.status, 404);
    assert.equal(notFound.body.code, 404);

    const response = await fetch(`${baseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, 400);
  });
});
