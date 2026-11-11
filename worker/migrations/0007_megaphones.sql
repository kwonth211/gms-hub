-- In-game megaphones read from a shared game window by the admin collector (/admin/megaphone/). kind: 'super' (고확, pink band),
-- 'item' (아이템 고확, gold) or 'double' (더블 아이템 고확, teal); 'mega' is a channel megaphone. hash dedupes the same line seen in several frames.
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
