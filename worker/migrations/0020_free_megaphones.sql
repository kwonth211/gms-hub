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
