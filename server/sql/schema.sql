-- XX 摩托销售管理系统 · 登录/用户/活动/分析模块
-- SQLite 3（Node.js 内置 node:sqlite）。所有时间字段均为 UTC ISO 8601 字符串。
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 后台账号：至少两种角色（super_admin / operator）
CREATE TABLE IF NOT EXISTS admin_user (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('super_admin', 'operator')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_admin_role_status ON admin_user(role, status);

-- C 端用户：openid 唯一；手机号授权后回填，一个手机号只绑定一个微信用户
CREATE TABLE IF NOT EXISTS c_user (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  openid          TEXT NOT NULL UNIQUE,
  unionid         TEXT,
  nickname        TEXT NOT NULL DEFAULT '微信用户',
  avatar_url      TEXT,
  phone           TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  disabled_reason TEXT,
  disabled_at     TEXT,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_c_user_phone ON c_user(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_c_user_status_created ON c_user(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_c_user_nickname ON c_user(nickname);

-- 活动
CREATE TABLE IF NOT EXISTS activity (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  cover           TEXT,
  description     TEXT,
  location        TEXT,
  start_at        TEXT NOT NULL,
  end_at          TEXT NOT NULL,
  signup_start_at TEXT NOT NULL,
  signup_end_at   TEXT NOT NULL,
  quota           INTEGER NOT NULL CHECK (quota > 0),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'offline')),
  version         INTEGER NOT NULL DEFAULT 1,
  created_by      INTEGER REFERENCES admin_user(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (end_at > start_at),
  CHECK (signup_end_at > signup_start_at)
);
CREATE INDEX IF NOT EXISTS ix_activity_status_start ON activity(status, start_at DESC);
CREATE INDEX IF NOT EXISTS ix_activity_signup_window ON activity(signup_start_at, signup_end_at);

-- 报名：同一活动同一用户只能存在一条 confirmed 记录（取消后可重新报名）
CREATE TABLE IF NOT EXISTS signup (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  signup_no    TEXT NOT NULL UNIQUE,
  activity_id  INTEGER NOT NULL REFERENCES activity(id),
  user_id      INTEGER NOT NULL REFERENCES c_user(id),
  phone        TEXT NOT NULL,
  remark       TEXT,
  status       TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  is_mock      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  cancelled_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_signup_active ON signup(activity_id, user_id) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS ix_signup_activity_status ON signup(activity_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_signup_user_created ON signup(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_signup_phone ON signup(phone);

-- 模拟访问行为事件
CREATE TABLE IF NOT EXISTS visit_event (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    TEXT NOT NULL UNIQUE,
  visitor_id  TEXT NOT NULL,
  user_id     INTEGER REFERENCES c_user(id),
  session_id  TEXT NOT NULL,
  module      TEXT NOT NULL,
  action      TEXT NOT NULL,
  page        TEXT,
  target_id   INTEGER,
  channel     TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_visit_created ON visit_event(created_at);
CREATE INDEX IF NOT EXISTS ix_visit_module_created ON visit_event(module, created_at);
CREATE INDEX IF NOT EXISTS ix_visit_action_created ON visit_event(action, created_at);
CREATE INDEX IF NOT EXISTS ix_visit_session_created ON visit_event(session_id, created_at);
CREATE INDEX IF NOT EXISTS ix_visit_user_created ON visit_event(user_id, created_at);

-- AI 分析解读结果（保存数据快照，便于复盘与对比）
CREATE TABLE IF NOT EXISTS ai_insight (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  range_from     TEXT NOT NULL,
  range_to       TEXT NOT NULL,
  source         TEXT NOT NULL CHECK (source IN ('llm', 'fallback')),
  model          TEXT,
  prompt_version TEXT NOT NULL,
  summary        TEXT NOT NULL,
  payload        TEXT NOT NULL,
  created_by     INTEGER REFERENCES admin_user(id),
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ai_insight_range ON ai_insight(range_from, range_to, created_at DESC);

-- 后台操作审计
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type  TEXT NOT NULL,
  actor_id    INTEGER,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   INTEGER,
  detail      TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_actor ON audit_log(actor_type, actor_id, created_at DESC);

INSERT INTO app_meta(key, value) VALUES ('schema_version', '1')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
