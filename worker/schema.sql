CREATE TABLE IF NOT EXISTS votes (site TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS voters (site TEXT NOT NULL, voter TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (site, voter));
CREATE TABLE IF NOT EXISTS prices (id INTEGER PRIMARY KEY AUTOINCREMENT, item INTEGER NOT NULL, price INTEGER NOT NULL, kind TEXT NOT NULL, reporter TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS prices_item ON prices (item, created_at);
CREATE INDEX IF NOT EXISTS prices_reporter ON prices (reporter, created_at);
