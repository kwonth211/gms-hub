-- D1 counts every index entry as a row written, and the free plan allows 100,000 a day. The seen_at index on megaphones
-- cost a write per megaphone and only served the daily prune, which now runs once a day as a scan instead.
DROP INDEX IF EXISTS megaphones_seen;
