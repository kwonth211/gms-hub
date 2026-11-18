-- "팔렸어요" (owner 2026-11-18): a visitor who went to a shop and found the listing gone reports it with one press. The
-- listing keeps how many different visitors said so and when the last one did; a later sighting by a collector or a scan
-- (last_seen after gone_at) means it is back. One row per visitor and listing stops double counting; rows older than
-- 31 days are dropped with the daily run (listings themselves live 30 days).
ALTER TABLE listings ADD COLUMN gone_n INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN gone_at TEXT;
CREATE TABLE IF NOT EXISTS listing_gone (listing INTEGER NOT NULL, reporter TEXT NOT NULL, at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (listing, reporter)) WITHOUT ROWID;
