'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { config } = require('./config');

const SCHEMA_PATH = path.join(__dirname, '..', 'sql', 'schema.sql');

let singleton = null;

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function openDatabase(file = config.dbPath, { migrate = true } = {}) {
  ensureDir(file);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }
  if (migrate) db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

function getDb() {
  if (!singleton) singleton = openDatabase();
  return singleton;
}

function closeDb() {
  if (singleton) {
    try {
      singleton.close();
    } catch {
      // ignore
    }
    singleton = null;
  }
}

/**
 * 同步事务。node:sqlite 是同步 API，BEGIN IMMEDIATE 可避免并发写竞争；
 * 回调内抛错自动回滚。不要在事务内再开事务。
 */
function transaction(db, fn, { immediate = true } = {}) {
  db.exec(immediate ? 'BEGIN IMMEDIATE;' : 'BEGIN;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // ignore rollback failure
    }
    throw error;
  }
}

/** 仅用于开发/测试：删除数据库文件并重建。 */
function resetDatabase(file = config.dbPath) {
  closeDb();
  const resolved = path.resolve(file);
  const allowedRoots = [path.resolve(config.serverDir, 'data'), path.resolve(__dirname, '..', 'tests', '.tmp')];
  if (resolved !== ':memory:' && !allowedRoots.some((root) => resolved.startsWith(root))) {
    throw new Error(`拒绝删除非数据目录文件: ${resolved}`);
  }
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${resolved}${suffix}`;
    if (fs.existsSync(target)) {
      try {
        fs.rmSync(target, { force: true });
      } catch (error) {
        if (error.code === 'EPERM' || error.code === 'EBUSY') {
          throw new Error(`数据库正在被占用，无法重置：${target}\n请先停止 npm start / node server/src/server.js，再执行 npm run db:reset。`);
        }
        throw error;
      }
    }
  }
  return openDatabase(resolved);
}

function getMeta(key, db = getDb()) {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMeta(key, value, db = getDb()) {
  db.prepare(
    'INSERT INTO app_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, String(value));
}

module.exports = {
  SCHEMA_PATH,
  openDatabase,
  getDb,
  closeDb,
  transaction,
  resetDatabase,
  getMeta,
  setMeta,
};
