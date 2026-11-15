CREATE TABLE IF NOT EXISTS votes (site TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS voters (site TEXT NOT NULL, voter TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (site, voter));
CREATE TABLE IF NOT EXISTS prices (id INTEGER PRIMARY KEY AUTOINCREMENT, item INTEGER NOT NULL, price INTEGER NOT NULL, kind TEXT NOT NULL, reporter TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS prices_item ON prices (item, created_at);
CREATE INDEX IF NOT EXISTS prices_reporter ON prices (reporter, created_at);
CREATE TABLE IF NOT EXISTS listings (id INTEGER PRIMARY KEY AUTOINCREMENT, item INTEGER NOT NULL, price INTEGER NOT NULL, qty INTEGER NOT NULL DEFAULT 1, sold INTEGER NOT NULL DEFAULT 0, seller TEXT NOT NULL, channel INTEGER NOT NULL, room INTEGER NOT NULL, reporter TEXT NOT NULL, first_seen TEXT NOT NULL DEFAULT (datetime('now')), last_seen TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (seller, item, price, channel, room));
CREATE INDEX IF NOT EXISTS listings_item ON listings (item, last_seen);
CREATE INDEX IF NOT EXISTS listings_seen ON listings (last_seen);
CREATE INDEX IF NOT EXISTS listings_first ON listings (first_seen);
CREATE TABLE IF NOT EXISTS room_titles (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, room INTEGER NOT NULL, reporter TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS snapshots (key TEXT PRIMARY KEY, json TEXT NOT NULL, at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS item_summary (
  item INTEGER PRIMARY KEY,
  typical INTEGER NOT NULL,
  day REAL,
  week REAL,
  sales INTEGER,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS item_summary_daily (
  item INTEGER NOT NULL,
  day TEXT NOT NULL,
  typical INTEGER NOT NULL,
  PRIMARY KEY (item, day)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS megaphones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seen_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  color TEXT,
  channel INTEGER,
  nick TEXT NOT NULL,
  text TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS megaphones_seen ON megaphones (seen_at);
CREATE TABLE IF NOT EXISTS item_market (
  item INTEGER PRIMARY KEY,
  open INTEGER NOT NULL,
  records INTEGER NOT NULL,
  median INTEGER,
  low INTEGER,
  sold_median INTEGER,
  sold INTEGER NOT NULL,
  shops INTEGER NOT NULL,
  last TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_daily (
  item INTEGER NOT NULL,
  day TEXT NOT NULL,
  low INTEGER,
  p25 INTEGER,
  median INTEGER,
  p75 INTEGER,
  high INTEGER,
  n INTEGER NOT NULL DEFAULT 0,
  sold INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item, day)
) WITHOUT ROWID;

-- Scroll forge: how many scrolls every visitor applied, one row per KST day (the page shows today and all-time).
CREATE TABLE IF NOT EXISTS forge_counts (
  day TEXT PRIMARY KEY,
  ok INTEGER NOT NULL DEFAULT 0,
  fail INTEGER NOT NULL DEFAULT 0,
  boom INTEGER NOT NULL DEFAULT 0
);
-- 무료 고확 (free megaphones): trade posts written on the site itself. Kept apart from the game megaphones on purpose:
-- they never feed price summaries, trends or alerts (anyone can type a price), they expire after 24 hours, and they carry
-- the poster's IP hash for rate limits, their own delete key and a report count.
CREATE TABLE IF NOT EXISTS free_megaphones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  nick TEXT NOT NULL,
  intent TEXT NOT NULL,
  item INTEGER,
  price INTEGER,
  text TEXT NOT NULL DEFAULT '',
  channel INTEGER,
  reporter TEXT NOT NULL,
  key TEXT NOT NULL,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS free_megaphones_reporter ON free_megaphones (reporter, at);
CREATE TABLE IF NOT EXISTS free_megaphone_reports (post INTEGER NOT NULL, reporter TEXT NOT NULL, PRIMARY KEY (post, reporter));
