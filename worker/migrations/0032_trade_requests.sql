-- 거래 신청 (owner 2026-11-25): a post written while logged in with Discord remembers its writer (owner) and the
-- language they wrote it in, so a visitor's "거래 신청" on /trade/ reaches the writer as a Discord DM. The Discord id
-- never leaves the worker: the list only says whether a post takes requests (dm). One request per visitor and post;
-- the rows also pace a visitor and protect a writer from a flood.
ALTER TABLE free_megaphones ADD COLUMN owner TEXT;
ALTER TABLE free_megaphones ADD COLUMN lang TEXT;
CREATE TABLE IF NOT EXISTS free_mega_requests (
  post INTEGER NOT NULL,
  reporter TEXT NOT NULL,
  nick TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post, reporter)
);
CREATE INDEX IF NOT EXISTS free_mega_requests_reporter ON free_mega_requests (reporter, at);
