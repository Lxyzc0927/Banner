-- ============ 任务3（秦旭）的内容模块表 ============

-- 首页轮播图：status 控制上下架，sort 越小越靠前；C 端由 link_type+link_url 拼成 link
CREATE TABLE IF NOT EXISTS banner (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  image      TEXT NOT NULL,
  link_type  TEXT NOT NULL DEFAULT 'none' CHECK (link_type IN ('bike', 'activity', 'news', 'none')),
  link_url   TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  status     INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_banner_status_sort ON banner(status, sort);

-- 新车资讯：summary 用于首页/列表摘要，content 用于详情
CREATE TABLE IF NOT EXISTS news (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  summary    TEXT,
  content    TEXT NOT NULL,
  cover      TEXT,
  date       TEXT,
  status     INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_news_status_sort ON news(status, sort);

-- 车型：tags/specs 存 JSON 文本，接口返回时展开；price 单位分；tier 由 cc 计算
CREATE TABLE IF NOT EXISTS bike (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL,
  cc         INTEGER,
  tier       TEXT CHECK (tier IN ('entry', 'mid', 'big')),
  tags       TEXT,
  price      INTEGER NOT NULL CHECK (price >= 0),
  specs      TEXT,
  intro      TEXT,
  cover      TEXT,
  status     INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_bike_status_sort ON bike(status, sort);
CREATE INDEX IF NOT EXISTS ix_bike_category ON bike(category);
CREATE INDEX IF NOT EXISTS ix_bike_name ON bike(name);

-- 车型图集：type 1主图/2细节，仅内部排序用，C 端一律返回 url 字符串数组
CREATE TABLE IF NOT EXISTS bike_image (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bike_id    INTEGER NOT NULL REFERENCES bike(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  type       INTEGER NOT NULL DEFAULT 1 CHECK (type IN (1, 2)),
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_bike_image_bike ON bike_image(bike_id, sort);

-- 收藏：(user_id, bike_id) 唯一；取消收藏物理删除；接口幂等
CREATE TABLE IF NOT EXISTS favorite (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES c_user(id) ON DELETE CASCADE,
  bike_id    INTEGER NOT NULL REFERENCES bike(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorite_user_bike ON favorite(user_id, bike_id);

-- AI 客服问答记录：按 session_id 归组；question 存最后一条用户消息，answer 存回复
CREATE TABLE IF NOT EXISTS chat_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES c_user(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_chat_log_user ON chat_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_chat_log_session ON chat_log(session_id, created_at DESC);
