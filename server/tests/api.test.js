'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-please-change-000000000000';
process.env.WECHAT_MOCK = 'true';
process.env.LLM_API_KEY = '';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const vm = require('node:vm');
const { tmpdir } = require('node:os');
const path = require('node:path');

const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { hashPassword } = require('../src/auth');
const { nowIso, addDays, localDay } = require('../src/time');
const { funnel } = require('../src/modules/analytics/service');
const { validateBindConfig } = require('../src/security');

let db;
let server;
let baseUrl;
let superToken;
let operatorToken;
let uploadDir;

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

  uploadDir = mkdtempSync(path.join(tmpdir(), 'banner-upload-test-'));
  const app = createApp({ db, uploadDir });
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
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
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

  test('非本机监听必须替换示例密钥和后台密码', () => {
    const unsafe = validateBindConfig({
      host: '0.0.0.0',
      defaultJwtSecret: true,
      adminPassword: 'Admin@123456',
      operatorPassword: 'Operator@123',
      wechatMock: true,
    });
    assert.equal(unsafe.loopback, false);
    assert.ok(unsafe.errors.length >= 2);
    assert.ok(unsafe.warnings.some((item) => item.includes('WECHAT_MOCK')));

    const local = validateBindConfig({
      host: '127.0.0.1',
      defaultJwtSecret: true,
      adminPassword: 'Admin@123456',
      operatorPassword: 'Operator@123',
      wechatMock: true,
    });
    assert.equal(local.errors.length, 0);
  });

  test('后台启动拒绝显式配置的示例密钥和旧库的演示密码', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'banner-bind-test-'));
    const env = {
      ...process.env,
      HOST: '127.0.0.2', PORT: '0', DB_PATH: path.join(dir, 'app.db'),
      SEED_ADMIN_PASSWORD: 'test-rotated-admin-password',
      SEED_OPERATOR_PASSWORD: 'test-rotated-operator-password',
    };
    const start = (jwtSecret) => spawnSync(process.execPath, [require.resolve('../src/server')], {
      env: { ...env, JWT_SECRET: jwtSecret }, encoding: 'utf8', timeout: 5000,
    });
    try {
      const example = start('dev-only-change-me-please-32-chars');
      assert.equal(example.status, 1);
      assert.match(example.stderr, /JWT_SECRET/);

      const oldDb = openDatabase(env.DB_PATH);
      try {
        const now = nowIso();
        oldDb.prepare(`INSERT INTO admin_user(username, password_hash, display_name, role, created_at, updated_at)
          VALUES (?, ?, ?, 'super_admin', ?, ?)`)
          .run('legacy-admin', hashPassword('Admin@123456'), 'legacy-admin', now, now);
      } finally {
        oldDb.close();
      }
      const legacy = start(process.env.JWT_SECRET);
      assert.equal(legacy.status, 1);
      assert.match(legacy.stderr, /数据库中有启用的后台账号仍使用演示密码/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('种子脚本只显示账号名，不输出配置密码', (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'banner-seed-test-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const adminPassword = 'test-custom-admin-password';
    const operatorPassword = 'test-custom-operator-password';
    const result = spawnSync(process.execPath, [require.resolve('../src/scripts/seed')], {
      env: { ...process.env, DB_PATH: path.join(dir, 'seed.db'), SEED_ADMIN_USERNAME: 'seed-admin',
        SEED_OPERATOR_USERNAME: 'seed-operator', SEED_ADMIN_PASSWORD: adminPassword,
        SEED_OPERATOR_PASSWORD: operatorPassword },
      encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /seed-admin.*seed-operator/);
    for (const password of [adminPassword, operatorPassword]) {
      assert.ok(!(result.stdout + result.stderr).includes(password));
    }
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

  test('兼容小程序现有路径：wx-login / phone / signups/mine', async () => {
    const login = await api('/api/auth/wx-login', {
      method: 'POST',
      body: { code: 'mock:alias-user', phoneCode: 'mock:13944440001' },
    });
    assert.equal(login.body.code, 0);
    assert.equal(login.body.data.phoneBound, true);

    const phone = await api('/api/auth/phone', {
      method: 'POST',
      token: login.body.data.token,
      body: { phone: '13944440002' },
    });
    assert.equal(phone.body.code, 0);
    assert.equal(phone.body.data.user.phone, '13944440002');

    const mine = await api('/api/signups/mine', { token: login.body.data.token });
    assert.equal(mine.body.code, 0);
    assert.ok(Array.isArray(mine.body.data.list));
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

  test('operator 只能看脱敏手机号；完整 CSV 和 AI 解读仅超级管理员可用', async () => {
    const activity = insertActivity({ title: '手机号脱敏测试', quota: 5 });
    const user = await loginUserWithPhone('mock:mask-user', '13955550001');
    await api(`/api/activities/${activity}/signup`, { method: 'POST', token: user.body.data.token });

    const operatorList = await api(`/api/admin/activities/${activity}/signups`, { token: operatorToken });
    assert.equal(operatorList.body.data.list[0].phone, '139****0001');
    const userId = operatorList.body.data.list[0].userId;

    const operatorUserSignups = await api(`/api/admin/users/${userId}/signups`, { token: operatorToken });
    assert.equal(operatorUserSignups.body.data.list[0].phone, '139****0001');

    const superList = await api(`/api/admin/activities/${activity}/signups`, { token: superToken });
    assert.equal(superList.body.data.list[0].phone, '13955550001');
    const superUserSignups = await api(`/api/admin/users/${userId}/signups`, { token: superToken });
    assert.equal(superUserSignups.body.data.list[0].phone, '13955550001');

    const operatorExport = await api(`/api/admin/activities/${activity}/signups/export`, { token: operatorToken });
    assert.equal(operatorExport.status, 200);
    assert.ok(operatorExport.text.includes('139****0001'));
    assert.ok(!operatorExport.text.includes('13955550001'));

    const superExport = await api(`/api/admin/activities/${activity}/signups/export`, { token: superToken });
    assert.ok(superExport.text.includes('13955550001'));

    const aiDenied = await api('/api/admin/analytics/interpret', {
      method: 'POST',
      token: operatorToken,
      body: {},
    });
    assert.equal(aiDenied.status, 403);
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

  test('空区间漏斗返回 null，不应报告 100% 流失', () => {
    const empty = openDatabase(':memory:');
    try {
      const result = funnel(empty, {
        from: '2026-01-01',
        to: '2026-01-02',
        fromIso: '2026-01-01T00:00:00.000Z',
        toIso: '2026-01-02T23:59:59.999Z',
      });
      assert.equal(result.hasData, false);
      assert.equal(result.overallConversion, null);
      assert.equal(result.biggestDrop, null);
      assert.ok(result.steps.every((step) => step.dropRate === null));
      assert.ok(result.steps.every((step) => step.rateFromPrev === null));
    } finally {
      empty.close();
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

  test('漏斗只统计服务端确认的报名，并关联匿名浏览和点击', async () => {
    const activityId = insertActivity({ title: '真实报名转化测试' });
    const user = await loginUserWithPhone('mock:conversion-user', '13999990111');
    const token = user.body.data.token;
    const channel = 'signup-regression';
    let click;
    for (const body of [
      { event: 'view', module: 'home' },
      { event: 'view', module: 'activity' },
      { event: 'view', module: 'activity_detail', activityId },
      { event: 'signup_click', activityId },
    ]) {
      const response = await api('/api/track', { method: 'POST', body: { ...body, channel } });
      assert.equal(response.body.data.tracked, true);
      click = response.body.data.eventId;
    }

    const ignored = await api('/api/track', {
      method: 'POST', body: { event: 'signup_success', activityId, channel },
    });
    assert.deepEqual(ignored.body.data, { tracked: false });

    // 模拟升级前已经入库的客户端成功事件，验证历史记录不会混入统计。
    db.prepare(`INSERT INTO visit_event(event_id, visitor_id, session_id, module, action, page, target_id, channel, created_at)
      SELECT 'evt_track_legacy_conversion', visitor_id, session_id, module, 'signup_success', page, target_id, channel, created_at
      FROM visit_event WHERE event_id = ?`).run(click);
    const getConversion = async () => {
      const result = await api(`/api/admin/analytics/funnel?activityId=${activityId}`, { token: superToken });
      return result.body.data.steps.at(-1).sessions;
    };
    assert.equal(await getConversion(), 0);

    const signup = await api(`/api/activities/${activityId}/signup`, { method: 'POST', token, body: { channel } });
    assert.equal(signup.status, 201);
    const duplicate = await api(`/api/activities/${activityId}/signup`, { method: 'POST', token });
    assert.equal(duplicate.body.code, 1004);
    assert.equal(await getConversion(), 1);
    const channels = await api('/api/admin/analytics/channels', { token: superToken });
    assert.equal(channels.body.data.list.find((item) => item.channel === channel).signups, 1);
  });

  test('小程序埋点 /api/track 写入 visit_event', async () => {
    const before = db.prepare("SELECT COUNT(*) AS c FROM visit_event WHERE action = 'bike_sort'").get().c;
    const tracked = await api('/api/track', {
      method: 'POST',
      body: { event: 'bike_sort', sort: 'price_asc' },
    });
    assert.equal(tracked.body.code, 0);
    assert.equal(tracked.body.data.tracked, true);
    const after = db.prepare("SELECT COUNT(*) AS c FROM visit_event WHERE action = 'bike_sort'").get().c;
    assert.equal(after, before + 1);
    const row = db
      .prepare("SELECT module, page, action FROM visit_event WHERE action = 'bike_sort' ORDER BY id DESC LIMIT 1")
      .get();
    assert.deepEqual({ ...row }, { module: 'bike', page: 'bike_list', action: 'bike_sort' });
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

describe('v1.7 内容初始化、上传与展示', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRX8AAAAASUVORK5CYII=', 'base64');

  function upload(data, type, token = operatorToken) {
    const body = new FormData();
    body.append('file', new Blob([data], { type }), 'test.png');
    return fetch(`${baseUrl}/api/upload`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
  }

  test('空库自动创建六张内容表，首页接口可以正常读取', async () => {
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(({ name }) => name);
    for (const name of ['banner', 'news', 'bike', 'bike_image', 'favorite', 'chat_log']) assert.ok(names.includes(name), name);
    const home = await api('/api/home');
    assert.equal(home.status, 200);
    assert.deepEqual(home.body.data, { banners: [], news: [], hotBikes: [] });
  });

  test('上传图片后可读取同一文件，拒绝未登录、格式错误及超限请求', async () => {
    const response = await upload(png, 'image/png');
    assert.equal(response.status, 200);
    const { data: { url } } = await response.json();
    assert.match(url, /^\/uploads\/\d{4}\/\d{2}\/[0-9a-f-]+\.png$/);
    const file = await fetch(`${baseUrl}${url}`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), png);
    const head = await fetch(`${baseUrl}${url}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(png.length));
    assert.equal((await upload(png, 'image/png', null)).status, 401);
    const user = await loginUser('test_u1');
    assert.equal(user.body.code, 0);
    assert.equal((await upload(png, 'image/png', user.body.data.token)).status, 401);
    assert.equal((await upload(Buffer.from('not a PNG'), 'image/png')).status, 400);
    for (const bytes of [5 * 1024 * 1024 + 1, 6 * 1024 * 1024]) {
      const tooLarge = await upload(Buffer.alloc(bytes), 'image/png');
      assert.equal(tooLarge.status, 400);
      assert.equal((await tooLarge.json()).code, 400);
    }
  });

  test('Banner 必填图片、编辑可保留原图，车型支持无封面和后续换图', async () => {
    const request = (route, method, body) => api(route, { method, body, token: operatorToken });
    const response = await upload(png, 'image/png');
    const { data: { url } } = await response.json();
    const invalid = await request('/api/admin/banners', 'POST', { title: '缺图' });
    assert.equal(invalid.status, 400);
    const banner = await request('/api/admin/banners', 'POST', { title: '首页推荐', image: url, sort: 2 });
    assert.equal(banner.body.code, 0);
    const bannerId = banner.body.data.id;
    const created = await request('/api/admin/bikes', 'POST', { name: '测试车型', category: '巡航', cc: 250, price: 199900 });
    assert.equal(created.body.code, 0);
    const bikeId = created.body.data.id;
    const bannerUpdate = await request(`/api/admin/banners/${bannerId}`, 'PUT', { title: '改名', linkType: 'bike', linkUrl: bikeId });
    assert.equal(bannerUpdate.body.code, 0);
    const detailPath = `/api/bikes/${bikeId}`;
    assert.equal((await api(detailPath)).body.data.cover, null);
    const update = await request(`/api/admin/bikes/${bikeId}`, 'PUT', { cover: url, images: [url], desc: '描述', power: 15 });
    assert.equal(update.body.code, 0);
    const detail = (await api(detailPath)).body.data;
    assert.equal(detail.cover, url);
    assert.deepEqual(detail.images, [url]);
    assert.equal(detail.desc, '描述');
    assert.equal(detail.power, 15);
    const home = (await api('/api/home')).body.data;
    assert.equal(home.banners[0].image, url);
    assert.equal(home.banners[0].link, `/bike/${bikeId}`);
    assert.equal(home.hotBikes[0].price, 199900);
    assert.equal((await api('/api/bikes?cc=0&minPrice=1999&maxPrice=1999')).body.data.total, 1);
    assert.equal((await api('/api/bikes?minPrice=1999.01')).body.data.total, 0);
    assert.equal((await api('/api/bikes?minPrice=-1')).status, 400);
    const { data: { token } } = (await loginUser('test_u1')).body;
    const favoritePath = `/api/bikes/${bikeId}/favorite`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.equal((await api(favoritePath, { method: 'POST', token })).body.data.favorited, true);
    }
    db.prepare('UPDATE favorite SET id = ? WHERE bike_id = ?').run(bikeId + 1000, bikeId);
    const favorites = (await api('/api/favorites', { token })).body.data;
    assert.equal(favorites.total, 1);
    assert.equal(favorites.list[0].id, bikeId);
    assert.equal((await api(detailPath, { token })).body.data.favorited, true);
    assert.equal((await api(favoritePath, { method: 'DELETE', token })).body.data.favorited, false);
  });
});

function runFrontend(file, context, transform = source => source) {
  const filename = path.resolve(__dirname, '../..', file);
  const source = readFileSync(filename, 'utf8');
  vm.runInContext(transform(source), context, { filename });
}

describe('v1.7 联调回归', () => {
  test('后台 Banner 表单允许留空创建和修改 sort=0 的标题', async () => {
    const fields = {
      '#f-title': { value: '默认排序' }, '#f-sort': { value: '' }, '#f-link': { value: '' },
      '#e-sort': {}, '#btn-save': {}, '#f-file': {}, '#modal-root': {},
    };
    const DB = { banners: [] };
    const context = vm.createContext({
      DB,
      document: { querySelector: name => fields[name], querySelectorAll: () => [] },
      Bridge: {
        isReal: () => true,
        async mutate(action, payload) {
          const suffix = payload.editId ? '/' + payload.editId : '';
          if (!payload.editId) assert.equal(payload.sort, undefined);
          const { body } = await api('/api/admin/banners' + suffix, {
            method: payload.editId ? 'PUT' : 'POST', token: superToken,
            body: { title: payload.title, sort: payload.sort, ...(payload.imageFile ? { image: '/test.png' } : {}) },
          });
          assert.equal(body.code, 0);
          payload.savedId = body.data.id;
          return true;
        },
      },
    });
    runFrontend('admin/js/app.js', context, source => source.replace(/boot\(\);\s*$/, ''));
    await vm.runInContext('toast = () => {}; pendingFile = {}; saveBanner()', context);
    const banner = DB.banners[0];
    assert.equal(banner.sort, 0);
    fields['#f-sort'].value = '0';
    fields['#f-title'].value = '修改标题';
    context.bannerId = banner.id;
    await vm.runInContext('state.editId = bannerId; saveBanner()', context);
    const { body } = await api('/api/admin/banners', { token: superToken });
    const saved = body.data.list.find(item => item.id === banner.id);
    assert.equal(saved.sort, 0);
    assert.equal(saved.title, '修改标题');
    for (const value of ['1.5', 'abc', '1e2', '9007199254740992']) {
      fields['#f-sort'].value = value;
      fields['#e-sort'].textContent = '';
      await vm.runInContext('saveBanner()', context);
      assert.match(fields['#e-sort'].textContent, /安全整数/);
    }
    for (const sort of ['abc', '1', true, null, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const response = await api('/api/admin/banners/' + banner.id, {
        method: 'PUT', token: superToken, body: { sort },
      });
      assert.equal(response.status, 400);
    }
    for (const value of ['-2', String(Number.MIN_SAFE_INTEGER), String(Number.MAX_SAFE_INTEGER)]) {
      fields['#f-sort'].value = value;
      await vm.runInContext('state.editId = bannerId; saveBanner()', context);
      assert.equal(db.prepare('SELECT sort FROM banner WHERE id = ?').get(banner.id).sort, Number(value));
    }
    fields['#f-sort'].value = '';
    await vm.runInContext('state.editId = bannerId; saveBanner()', context);
    assert.equal(db.prepare('SELECT sort FROM banner WHERE id = ?').get(banner.id).sort, Number.MAX_SAFE_INTEGER);
  });

  test('后台发布、下架和重新发布使用本机接口返回的阶段', async () => {
    const id = insertActivity({ title: '未来活动阶段回写', status: 'draft' });
    const DB = { activities: [{ id, rawStatus: 'draft', phase: 'draft', status: '未开始' }] };
    const transition = async (activityId, op) => {
      const { body } = await api('/api/admin/activities/' + activityId + '/' + op, { method: 'POST', token: superToken });
      assert.equal(body.code, 0);
      return body.data;
    };
    const context = vm.createContext({
      DB, URLSearchParams, location: { search: '?real=1' },
      document: { querySelector: () => null, querySelectorAll: () => [] },
      activityCalls: { publish: id => transition(id, 'publish'), offline: id => transition(id, 'offline') },
    });
    runFrontend('admin/js/api.js', context);
    vm.runInContext('Object.assign(Api.activities, activityCalls)', context);
    runFrontend('admin/js/bridge.js', context);
    runFrontend('admin/js/app.js', context, source => source.replace(/boot\(\);\s*$/, ''));
    vm.runInContext('toast = () => {}', context);
    for (const [phase, rawStatus, status] of [
      ['upcoming', 'published', '未开始'], ['offline', 'offline', '已下架'], ['upcoming', 'published', '未开始'],
    ]) {
      await vm.runInContext('toggleActivity(DB.activities[0].id)', context);
      assert.deepEqual([DB.activities[0].phase, DB.activities[0].rawStatus, DB.activities[0].status], [phase, rawStatus, status]);
    }

    context.location.search = '?real=0';
    DB.activities = [{ id, date: iso(86400000).slice(0, 10), status: '未开始', rawStatus: 'draft' }];
    await vm.runInContext('toggleActivity(DB.activities[0].id)', context);
    assert.equal(DB.activities[0].phase, 'upcoming');
    assert.equal(DB.activities[0].status, '未开始');
    await vm.runInContext('toggleActivity(DB.activities[0].id)', context);
    assert.equal(DB.activities[0].status, '已下架');
    assert.equal(db.prepare('SELECT status FROM activity WHERE id = ?').get(id).status, 'published');
  });
});
