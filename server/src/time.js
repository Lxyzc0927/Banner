'use strict';

const { config } = require('./config');

const OFFSET_MS = config.analytics.tzOffset * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** 中国本地日期 YYYY-MM-DD（用于按天聚合、报表标题）。 */
function localDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** 把 YYYY-MM-DD（中国时区）转成当天 00:00:00 的 UTC ISO。 */
function localDayStartIso(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, -config.analytics.tzOffset, 0, 0, 0)).toISOString();
}

/** 把 YYYY-MM-DD（中国时区）转成当天 23:59:59.999 的 UTC ISO。 */
function localDayEndIso(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23 - config.analytics.tzOffset, 59, 59, 999)).toISOString();
}

function addDays(day, count) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function diffDays(fromDay, toDay) {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  return Math.round((to - from) / 86400000);
}

function timeModifier() {
  const sign = config.analytics.tzOffset >= 0 ? '+' : '-';
  return `${sign}${Math.abs(config.analytics.tzOffset)} hours`;
}

/** 生成 [from, to] 的连续日期数组。 */
function eachDay(fromDay, toDay) {
  const days = [];
  for (let d = fromDay; d <= toDay; d = addDays(d, 1)) {
    days.push(d);
    if (days.length > 400) break;
  }
  return days;
}

/** UTC ISO -> 中国本地 YYYY-MM-DD HH:mm:ss（导出/报表用）。 */
function formatLocalDateTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return `${shifted.toISOString().slice(0, 10)} ${shifted.toISOString().slice(11, 19)}`;
}

module.exports = {
  OFFSET_MS,
  nowIso,
  toIso,
  localDay,
  localDayStartIso,
  localDayEndIso,
  addDays,
  diffDays,
  timeModifier,
  eachDay,
  formatLocalDateTime,
};
