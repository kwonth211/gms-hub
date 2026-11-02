CREATE TABLE IF NOT EXISTS votes (site TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS voters (site TEXT NOT NULL, voter TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (site, voter));
CREATE TABLE IF NOT EXISTS prices (id INTEGER PRIMARY KEY AUTOINCREMENT, item INTEGER NOT NULL, price INTEGER NOT NULL, kind TEXT NOT NULL, reporter TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS prices_item ON prices (item, created_at);
CREATE INDEX IF NOT EXISTS prices_reporter ON prices (reporter, created_at);
CREATE TABLE IF NOT EXISTS listings (id INTEGER PRIMARY KEY AUTOINCREMENT, item INTEGER NOT NULL, price INTEGER NOT NULL, qty INTEGER NOT NULL DEFAULT 1, sold INTEGER NOT NULL DEFAULT 0, seller TEXT NOT NULL, channel INTEGER NOT NULL, room INTEGER NOT NULL, reporter TEXT NOT NULL, first_seen TEXT NOT NULL DEFAULT (datetime('now')), last_seen TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (seller, item, price, channel, room));
CREATE INDEX IF NOT EXISTS listings_item ON listings (item, last_seen);
CREATE INDEX IF NOT EXISTS listings_seen ON listings (last_seen);
CREATE TABLE IF NOT EXISTS room_titles (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, room INTEGER NOT NULL, reporter TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
