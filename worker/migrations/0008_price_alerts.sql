-- Price alerts: a browser's push subscription watches one item below a price. The schedule records hits and sends an
-- empty push; the browser's service worker then reads its hits (no payload encryption needed).
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth TEXT,
  item INTEGER NOT NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  fired_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_endpoint_item ON alerts (endpoint, item);
CREATE TABLE IF NOT EXISTS alert_hits (
  id INTEGER PRIMARY KEY,
  endpoint TEXT NOT NULL,
  item INTEGER NOT NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  channel INTEGER,
  room INTEGER,
  seller TEXT,
  lang TEXT NOT NULL DEFAULT 'en',
  at TEXT NOT NULL DEFAULT (datetime('now')),
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS alert_hits_endpoint ON alert_hits (endpoint, seen);
