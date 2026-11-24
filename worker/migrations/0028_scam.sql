-- Scam reports (worker/src/scam.js). Megaphones in which one player warns about another are parsed at ingest and kept
-- here (megaphones themselves are pruned after 2 days). Visitors can add a report or ask for a name to be taken down;
-- both wait for the owner's review. Apply with `d1 execute --file` (never `migrations apply` on this database).
--
-- scam_nicks: one row per accused name. key is the lowercase name. verified: 1 the character exists (ranking lookup),
-- -1 not found, 0 not checked yet. state is the owner's override: 'auto' follows the rule in scam.js (isPublic),
-- 'shown' forces it onto the list, 'hidden' keeps it off (a granted take-down request).
CREATE TABLE IF NOT EXISTS scam_nicks (
  key TEXT PRIMARY KEY,
  nick TEXT NOT NULL,
  world TEXT NOT NULL DEFAULT 'windia',
  verified INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'auto',
  note TEXT,
  first_at TEXT NOT NULL,
  last_at TEXT NOT NULL
);

-- scam_reports: one row per warning. source 'mega' (a game megaphone; accuser is the caller's name) or 'user' (written on
-- the site; accuser is the visitor hash, accuser_name the game name they gave). status: 'shown', 'pending' (user reports
-- until reviewed) or 'rejected'. strong = 1 when the megaphone names the player in a plain "X is a scammer" form.
CREATE TABLE IF NOT EXISTS scam_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  source TEXT NOT NULL,
  accuser TEXT NOT NULL,
  accuser_name TEXT,
  text TEXT NOT NULL,
  strong INTEGER NOT NULL DEFAULT 0,
  channel INTEGER,
  at TEXT NOT NULL,
  mega_id INTEGER,
  status TEXT NOT NULL DEFAULT 'shown',
  hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS scam_reports_key ON scam_reports (key, at);
CREATE INDEX IF NOT EXISTS scam_reports_status ON scam_reports (status, id);
CREATE INDEX IF NOT EXISTS scam_reports_accuser ON scam_reports (accuser, at);

-- scam_appeals: "take my name down" requests. status: 'pending', 'granted' (the name is hidden) or 'denied'.
CREATE TABLE IF NOT EXISTS scam_appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  nick TEXT NOT NULL,
  message TEXT NOT NULL,
  contact TEXT,
  reporter TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending',
  answer TEXT
);
CREATE INDEX IF NOT EXISTS scam_appeals_status ON scam_appeals (status, id);
CREATE INDEX IF NOT EXISTS scam_appeals_reporter ON scam_appeals (reporter, at);
