-- Worlds (owner 2026-11-18): Classic World now has Windia and the new Zenith. Every raw record says which world it came
-- from; everything collected so far is Windia, so the column defaults to 'windia' and existing rows need no rewrite.
-- Aggregates (item_daily, item_market, snapshots) are rebuilt from these rows if a second world is ever shown.
ALTER TABLE listings ADD COLUMN world TEXT NOT NULL DEFAULT 'windia';
ALTER TABLE megaphones ADD COLUMN world TEXT NOT NULL DEFAULT 'windia';
ALTER TABLE free_megaphones ADD COLUMN world TEXT NOT NULL DEFAULT 'windia';
ALTER TABLE alerts ADD COLUMN world TEXT NOT NULL DEFAULT 'windia';
ALTER TABLE discord_alerts ADD COLUMN world TEXT NOT NULL DEFAULT 'windia';
