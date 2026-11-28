'use strict';

/** 防止 CSV/Excel 公式注入：以 = + - @ 开头的文本前加单引号。 */
function safeCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers, rows) {
  const lines = [headers.map(safeCell).join(',')];
  for (const row of rows) lines.push(row.map(safeCell).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}

module.exports = { safeCell, toCsv };
