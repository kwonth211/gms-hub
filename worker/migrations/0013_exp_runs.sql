-- EXP tracker runs that players chose to share (the "add to the spot rankings" button on /tools/exp/). One row per
-- finished session of 10+ minutes. voter is a salted hash of the IP and a random browser id, never the raw values; run
-- is the browser's own session id so pressing twice does not count twice. Read back only as per-spot medians.
CREATE TABLE IF NOT EXISTS exp_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  voter TEXT NOT NULL,
  run TEXT NOT NULL,
  mob INTEGER,
  route TEXT,
  level INTEGER NOT NULL,
  job TEXT NOT NULL,
  party INTEGER NOT NULL DEFAULT 1,
  minutes INTEGER NOT NULL,
  per_hour INTEGER NOT NULL,
  lang TEXT,
  UNIQUE (voter, run)
);
CREATE INDEX IF NOT EXISTS exp_runs_created ON exp_runs (created_at);
