-- Reference prices for (nearly) every item, read from the source site's item list once per collector run and saved at
-- most every few hours. item_summary holds the latest value; item_summary_daily one value per item per day for trends.
CREATE TABLE IF NOT EXISTS item_summary (
  item INTEGER PRIMARY KEY,
  typical INTEGER NOT NULL,
  day REAL,
  week REAL,
  sales INTEGER,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS item_summary_daily (
  item INTEGER NOT NULL,
  day TEXT NOT NULL,
  typical INTEGER NOT NULL,
  PRIMARY KEY (item, day)
) WITHOUT ROWID;
