-- "Log in with Discord" for the whole site (worker/src/account.js): who logged in, and a copy of their own browser
-- settings (localStorage keys) so they follow them to another device. Logging in is optional; nothing else depends on it.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,          -- Discord user id
  name TEXT,
  avatar TEXT,
  created INTEGER,
  seen INTEGER
);
-- One row per key; v NULL = removed on some device (so the removal reaches the others); t = when the browser changed it.
CREATE TABLE IF NOT EXISTS account_data (
  id TEXT NOT NULL,
  k TEXT NOT NULL,
  v TEXT,
  t INTEGER NOT NULL,
  PRIMARY KEY (id, k)
);
