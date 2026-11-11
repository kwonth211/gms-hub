-- Write diet (D1 free plan: 100k rows written/day; 11/9 used 82,740 for 7,035 collected rows, ~12 writes each).
-- 1. A shop seen again at the same price, qty and sold state adds a history row at most every 6 hours. Daily medians and
--    charts need one sighting per listing per day, not one per scan; new listings, price/qty/sold changes always record.
DROP TRIGGER IF EXISTS listing_history_update;
CREATE TRIGGER listing_history_update AFTER UPDATE ON listings
WHEN NEW.price != OLD.price OR NEW.item != OLD.item OR NEW.qty != OLD.qty OR NEW.sold != OLD.sold
  OR NOT EXISTS (SELECT 1 FROM listing_history WHERE listing_id = NEW.id AND seen > datetime(NEW.last_seen, '-6 hours'))
BEGIN
  INSERT OR IGNORE INTO listing_history VALUES (NEW.id,NEW.item,NEW.price,NEW.qty,NEW.sold,NEW.seller,NEW.channel,NEW.room,NEW.last_seen);
END;
-- 2. No query filters on (seller, channel, room, last_seen); every listing write was also updating this index.
DROP INDEX IF EXISTS listings_seller_location;
