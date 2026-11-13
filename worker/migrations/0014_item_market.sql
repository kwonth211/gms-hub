-- One row per item with its current asking summary (7-day records, 24h open listings), recomputed only for the items a
-- collector run touched. The market catalogue reads this small table instead of scanning the whole 7-day listings window.
CREATE TABLE IF NOT EXISTS item_market (
  item INTEGER PRIMARY KEY,
  open INTEGER NOT NULL,
  records INTEGER NOT NULL,
  median INTEGER,
  low INTEGER,
  sold_median INTEGER,
  sold INTEGER NOT NULL,
  shops INTEGER NOT NULL,
  last TEXT,
  at TEXT NOT NULL
);

-- Long-term history: when listings pass the 30-day retention, each item/day's prices are kept here as one row
-- (lowest, median and count of asking prices last seen that day) before the raw rows are deleted.
CREATE TABLE IF NOT EXISTS item_daily (
  item INTEGER NOT NULL,
  day TEXT NOT NULL,
  low INTEGER,
  median INTEGER,
  n INTEGER NOT NULL,
  sold INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item, day)
) WITHOUT ROWID;
