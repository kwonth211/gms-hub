-- Scroll forge: how many scrolls every visitor applied, one row per KST day (the page shows today and all-time).
CREATE TABLE IF NOT EXISTS forge_counts (
  day TEXT PRIMARY KEY,
  ok INTEGER NOT NULL DEFAULT 0,
  fail INTEGER NOT NULL DEFAULT 0,
  boom INTEGER NOT NULL DEFAULT 0
);
