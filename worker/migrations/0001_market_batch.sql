CREATE TABLE IF NOT EXISTS market_batch_runs (
  run_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  shops INTEGER NOT NULL, accepted INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS market_observations (
  item INTEGER NOT NULL, price INTEGER NOT NULL, seller TEXT NOT NULL,
  channel INTEGER NOT NULL, room INTEGER NOT NULL, seen TEXT NOT NULL,
  run_id TEXT NOT NULL,
  PRIMARY KEY (seller,item,price,channel,room,seen)
);
CREATE INDEX IF NOT EXISTS market_observations_item_seen ON market_observations (item,seen);
