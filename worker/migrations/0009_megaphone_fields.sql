-- Megaphones carry what was parsed from the text at ingest (item id by its bracketed or quoted English name, selling or
-- buying, and the asking price in mesos), so item lookups use an index instead of scanning text, and asking prices can
-- feed the price summaries of consumables and cash items. Rows are now kept 14 days.
ALTER TABLE megaphones ADD COLUMN item INTEGER;
ALTER TABLE megaphones ADD COLUMN intent TEXT;
ALTER TABLE megaphones ADD COLUMN price INTEGER;
CREATE INDEX IF NOT EXISTS megaphones_item ON megaphones (item, id);
