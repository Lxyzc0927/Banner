'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SERVER_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(SERVER_DIR, '..');

/** 读取 .env（不覆盖进程中已有的环境变量）。零依赖，避免为了一个文件引入 dotenv。 */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT_DIR, '.env'));

function int(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function bool(name, fallback) {
  const value = (process.env[name] ?? '').toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

const serverDir = SERVER_DIR;
const dbPath = path.isAbsolute(process.env.DB_PATH || '')
  ? process.env.DB_PATH
  : path.resolve(serverDir, process.env.DB_PATH || 'data/app.db');

const defaultJwtSecret = 'dev-only-change-me-please-32-chars';
const jwtSecret = process.env.JWT_SECRET || defaultJwtSecret;

const config = {
  rootDir: ROOT_DIR,
  serverDir,
  adminDir: path.join(serverDir, 'public', 'admin'),
  reportsDir: path.join(ROOT_DIR, 'reports'),
  port: int('PORT', 3000),
  host: process.env.HOST || '127.0.0.1',
  dbPath,
  jwt: {
    secret: jwtSecret,
    isDefaultSecret: jwtSecret.trim() === defaultJwtSecret,
    userTtl: process.env.JWT_USER_TTL || '7d',
    adminTtl: process.env.JWT_ADMIN_TTL || '12h',
  },
  wechat: {
    mock: bool('WECHAT_MOCK', true),
    appid: process.env.WECHAT_APPID || '',
    secret: process.env.WECHAT_SECRET || '',
  },
  llm: {
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'deepseek-chat',
    timeoutMs: int('LLM_TIMEOUT_MS', 30000),
  },
  seed: {
    adminUsername: process.env.SEED_ADMIN_USERNAME || 'superadmin',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123456',
    operatorUsername: process.env.SEED_OPERATOR_USERNAME || 'operator',
    operatorPassword: process.env.SEED_OPERATOR_PASSWORD || 'Operator@123',
  },
  analytics: {
    tzOffset: int('ANALYTICS_TZ_OFFSET', 8),
    maxRangeDays: 366,
  },
  limits: {
    jsonBodyBytes: 1024 * 1024,
    pageSize: 50,
    aiQuestionChars: 300,
  },
  env: process.env.NODE_ENV || 'development',
};

module.exports = { config, loadEnvFile, ROOT_DIR, SERVER_DIR };
