-- Shared price summaries (2026-11-21). The per-data-centre edge cache missed about 10,000 times a day (each region keeps
-- its own copy), and every miss re-read the 14-day rows of up to 60 items: ~57M row reads a day, 60% of all reads.
-- /prices now reads a summary here first (one row per item) and recomputes an item only when its row is over 30 minutes old.
CREATE TABLE IF NOT EXISTS price_cache (item INTEGER PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL);
