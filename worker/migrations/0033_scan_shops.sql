-- 상점 스캔으로 올라온 상점 (owner 2026-11-26): every shop a visitor's Shop Scan upload touched, so /trade/ can list the
-- shops people scanned with what they sell now (read from listings by the existing seller/channel/room index).
-- seller_faces caches the shop owner's ClassicRank picture, level and job (looked up a few at a time on the schedule).
CREATE TABLE IF NOT EXISTS scan_shops (
  seller TEXT NOT NULL,
  channel INTEGER NOT NULL,
  room INTEGER NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (seller, channel, room)
);
CREATE INDEX IF NOT EXISTS scan_shops_at ON scan_shops (at);
CREATE TABLE IF NOT EXISTS seller_faces (
  key TEXT PRIMARY KEY,
  nick TEXT,
  photo TEXT,
  level INTEGER,
  job TEXT,
  checked_at TEXT
);
