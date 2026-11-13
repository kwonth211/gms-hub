-- item_daily becomes the live daily rollup of asking prices (one row per item and UTC day), kept current by every
-- collector run, so price-history charts read at most ~120 small rows per item instead of every raw listing.
-- The table was still empty (retention had not run yet), so it is rebuilt with the quartile columns the charts need.
DROP TABLE IF EXISTS item_daily;
CREATE TABLE item_daily (
  item INTEGER NOT NULL,
  day TEXT NOT NULL,
  low INTEGER,
  p25 INTEGER,
  median INTEGER,
  p75 INTEGER,
  high INTEGER,
  n INTEGER NOT NULL DEFAULT 0,
  sold INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item, day)
) WITHOUT ROWID;

-- Backfill from the listings kept so far, with the same rule the charts used (a listing counts on the day it was
-- last seen) and the same quartile picks as dailyHistory (index floor(f*(n-1)+0.5), median = mean of the middle two).
INSERT INTO item_daily (item, day, low, p25, median, p75, high, n, sold)
WITH asks AS (
  SELECT item, substr(last_seen, 1, 10) AS day, price,
    ROW_NUMBER() OVER (PARTITION BY item, substr(last_seen, 1, 10) ORDER BY price) AS rn,
    COUNT(*) OVER (PARTITION BY item, substr(last_seen, 1, 10)) AS cnt
  FROM listings WHERE sold = 0
)
SELECT item, day, MIN(price),
  MAX(CASE WHEN rn = CAST(0.25 * (cnt - 1) + 0.5 AS INTEGER) + 1 THEN price END),
  CAST(ROUND(AVG(CASE WHEN rn IN ((cnt + 1) / 2, cnt / 2 + 1) THEN price END)) AS INTEGER),
  MAX(CASE WHEN rn = CAST(0.75 * (cnt - 1) + 0.5 AS INTEGER) + 1 THEN price END),
  MAX(price), MAX(cnt), 0
FROM asks GROUP BY item, day;

INSERT INTO item_daily (item, day, n, sold)
SELECT item, substr(last_seen, 1, 10), 0, COUNT(*) FROM listings WHERE sold = 1 GROUP BY item, substr(last_seen, 1, 10)
ON CONFLICT (item, day) DO UPDATE SET sold = excluded.sold;
