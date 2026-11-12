-- Megaphone alerts set with the Discord bot (/alert): when a megaphone names the item, the bot sends the user a DM.
-- One row per user and item (at most 10 items a user); dm_channel caches the DM channel so a notice is one API call;
-- sent_at spaces notices for the same item at least 10 minutes apart.
CREATE TABLE IF NOT EXISTS discord_alerts (
  user_id TEXT NOT NULL,
  item INTEGER NOT NULL,
  intent TEXT NOT NULL DEFAULT 'any',
  locale TEXT NOT NULL DEFAULT 'en',
  dm_channel TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  PRIMARY KEY (user_id, item)
);
CREATE INDEX IF NOT EXISTS discord_alerts_item ON discord_alerts (item);
