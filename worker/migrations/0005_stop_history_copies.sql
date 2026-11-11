-- Charts now read each listing's first_seen..last_seen span (dailyPoints in market-browser.js), so nothing reads
-- listing_history any more. Stop copying into it; the table and its rows stay as an archive.
DROP TRIGGER IF EXISTS listing_history_update;
DROP TRIGGER IF EXISTS listing_history_insert;
