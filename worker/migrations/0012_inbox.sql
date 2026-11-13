-- Mail sent to contact@gms-hub.com (Cloudflare Email Routing → this worker's email handler). The worker forwards each
-- message to the owner's inbox and keeps a copy here so it can be read with `wrangler d1 execute`. Never exposed by an
-- HTTP route. raw is the MIME source, cut at 256 KB.
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  mail_from TEXT,
  mail_to TEXT,
  subject TEXT,
  size INTEGER,
  raw TEXT
);
