'use strict';

const crypto = require('node:crypto');
const { config } = require('./config');
const { errors, CODES } = require('./errors');
const { PHONE_RE } = require('./validate');

let accessTokenCache = { token: null, expiresAt: 0 };

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`微信接口返回非 JSON: ${text.slice(0, 120)}`);
    }
    if (!response.ok) throw new Error(`微信接口 HTTP ${response.status}: ${json.errmsg || text.slice(0, 120)}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 小程序 wx.login 的 code 换 openid。
 * mock=true 时：code 形如 mock:demo-user-1 可得到稳定 openid；普通 code 则按哈希生成。
 */
async function code2Session(code) {
  if (!code || typeof code !== 'string') throw errors.business(CODES.AUTH_FAILED, '缺少微信登录 code');
  if (config.wechat.mock) {
    const key = code.startsWith('mock:') ? code.slice(5) : crypto.createHash('sha256').update(code).digest('hex').slice(0, 24);
    return { openid: `mock_${key}`, unionid: null, sessionKey: 'mock-session-key', mock: true };
  }
  if (!config.wechat.appid || !config.wechat.secret) {
    throw errors.business(CODES.AUTH_FAILED, '服务端未配置 WECHAT_APPID / WECHAT_SECRET');
  }
  const params = new URLSearchParams({
    appid: config.wechat.appid,
    secret: config.wechat.secret,
    js_code: code,
    grant_type: 'authorization_code',
  });
  const data = await fetchJson(`https://api.weixin.qq.com/sns/jscode2session?${params}`);
  if (data.errcode) throw errors.business(CODES.AUTH_FAILED, `微信登录失败：${data.errmsg || data.errcode}`);
  return { openid: data.openid, unionid: data.unionid || null, sessionKey: data.session_key, mock: false };
}

async function getAccessToken() {
  if (!config.wechat.appid || !config.wechat.secret) {
    throw errors.business(CODES.AUTH_FAILED, '服务端未配置 WECHAT_APPID / WECHAT_SECRET');
  }
  if (accessTokenCache.token && accessTokenCache.expiresAt > Date.now() + 60_000) {
    return accessTokenCache.token;
  }
  const params = new URLSearchParams({
    grant_type: 'client_credential',
    appid: config.wechat.appid,
    secret: config.wechat.secret,
  });
  const data = await fetchJson(`https://api.weixin.qq.com/cgi-bin/token?${params}`);
  if (data.errcode) throw errors.business(CODES.AUTH_FAILED, `获取微信 access_token 失败：${data.errmsg || data.errcode}`);
  accessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 7200) * 1000,
  };
  return data.access_token;
}

/**
 * 手机号授权：小程序 <button open-type="getPhoneNumber"> 回调里的 code。
 * mock=true 时支持 body.phone 或 code=mock:13800138000，便于本地演示。
 */
async function getPhoneNumber({ code, phone } = {}) {
  if (config.wechat.mock) {
    let value = phone;
    if (!value && typeof code === 'string' && code.startsWith('mock:')) value = code.slice(5);
    if (!value || !PHONE_RE.test(String(value))) {
      throw errors.business(CODES.AUTH_FAILED, '模拟手机号授权失败：请传 phone 或 code=mock:手机号');
    }
    return { phone: String(value), purePhoneNumber: String(value), countryCode: '86', mock: true };
  }
  if (!code) throw errors.business(CODES.AUTH_FAILED, '缺少手机号授权 code');
  const token = await getAccessToken();
  const data = await fetchJson(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    },
  );
  if (data.errcode) throw errors.business(CODES.AUTH_FAILED, `手机号授权失败：${data.errmsg || data.errcode}`);
  const info = data.phone_info || {};
  return {
    phone: info.purePhoneNumber || info.phoneNumber,
    purePhoneNumber: info.purePhoneNumber || info.phoneNumber,
    countryCode: info.countryCode || '86',
    mock: false,
  };
}

module.exports = { code2Session, getPhoneNumber, getAccessToken };
