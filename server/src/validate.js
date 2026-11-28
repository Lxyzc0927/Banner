'use strict';

const { errors } = require('./errors');
const { localDay, addDays, diffDays, localDayStartIso, localDayEndIso } = require('./time');

const PHONE_RE = /^1[3-9]\d{9}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asObject(value) {
  if (!isPlainObject(value)) throw errors.badRequest('请求体必须是 JSON 对象');
  return value;
}

function assert(condition, message, code = 400, details = null) {
  if (!condition) throw errors.business(code, message, details);
}

function string(value, name, { required = false, min = 0, max = 200, trim = true, pattern = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw errors.badRequest(`${name}不能为空`);
    return null;
  }
  if (typeof value !== 'string') throw errors.badRequest(`${name}必须是字符串`);
  const text = trim ? value.trim() : value;
  if (text.length < min) throw errors.badRequest(`${name}至少 ${min} 个字符`);
  if (text.length > max) throw errors.badRequest(`${name}不能超过 ${max} 个字符`);
  if (pattern && !pattern.test(text)) throw errors.badRequest(`${name}格式不正确`);
  return text;
}

function integer(value, name, { required = false, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, defaultValue = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw errors.badRequest(`${name}不能为空`);
    return defaultValue;
  }
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number)) throw errors.badRequest(`${name}必须是整数`);
  if (number < min || number > max) throw errors.badRequest(`${name}必须在 ${min}—${max} 之间`);
  return number;
}

function number(value, name, { required = false, min = -Infinity, max = Infinity, defaultValue = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw errors.badRequest(`${name}不能为空`);
    return defaultValue;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw errors.badRequest(`${name}必须是数字`);
  if (parsed < min || parsed > max) throw errors.badRequest(`${name}必须在 ${min}—${max} 之间`);
  return parsed;
}

function bool(value, name, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  throw errors.badRequest(`${name}必须是布尔值`);
}

function enumValue(value, name, allowed, { required = false, defaultValue = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw errors.badRequest(`${name}不能为空`);
    return defaultValue;
  }
  if (!allowed.includes(value)) throw errors.badRequest(`${name}只能是：${allowed.join(' / ')}`);
  return value;
}

function phone(value, name = '手机号', { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw errors.badRequest(`${name}不能为空`);
    return null;
  }
  const text = String(value).trim();
  if (!PHONE_RE.test(text)) throw errors.badRequest(`${name}格式不正确`);
  return text;
}

function isoDateTime(value, name, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw errors.badRequest(`${name}不能为空`);
    return null;
  }
  if (typeof value !== 'string') throw errors.badRequest(`${name}必须是 ISO 时间字符串`);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw errors.badRequest(`${name}不是合法时间`);
  return new Date(parsed).toISOString();
}

function dateOnly(value, name, { required = false, defaultValue = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw errors.badRequest(`${name}不能为空`);
    return defaultValue;
  }
  if (!DATE_RE.test(String(value))) throw errors.badRequest(`${name}格式应为 YYYY-MM-DD`);
  const day = String(value);
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== day) {
    throw errors.badRequest(`${name}不是合法日期`);
  }
  return day;
}

function pagination(query) {
  const page = integer(query.page, 'page', { min: 1, max: 100000, defaultValue: 1 });
  const rawSize = integer(query.pageSize ?? query.size, 'pageSize', { min: 1, max: 200, defaultValue: 10 });
  const pageSize = Math.min(rawSize, 200);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function dateRange(query, { defaultDays = 14, maxDays = 366 } = {}) {
  const today = localDay();
  const to = dateOnly(query.to, 'to', { defaultValue: today });
  const from = dateOnly(query.from, 'from', { defaultValue: addDays(to, -(defaultDays - 1)) });
  const days = diffDays(from, to) + 1;
  if (days < 1) throw errors.badRequest('from 不能晚于 to');
  if (days > maxDays) throw errors.badRequest(`查询区间不能超过 ${maxDays} 天`);
  return {
    from,
    to,
    days,
    fromIso: localDayStartIso(from),
    toIso: localDayEndIso(to),
  };
}

function pickDefined(source, keys) {
  const result = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

module.exports = {
  PHONE_RE,
  DATE_RE,
  isPlainObject,
  asObject,
  assert,
  string,
  integer,
  number,
  bool,
  enumValue,
  phone,
  isoDateTime,
  dateOnly,
  pagination,
  dateRange,
  pickDefined,
};
