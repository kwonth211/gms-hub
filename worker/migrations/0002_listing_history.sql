-- Preserve each confirmed observation instead of moving the only chart point on every rescan.
CREATE TABLE IF NOT EXISTS listing_history (
  listing_id INTEGER NOT NULL, item INTEGER NOT NULL, price INTEGER NOT NULL, qty INTEGER NOT NULL,
  sold INTEGER NOT NULL, seller TEXT NOT NULL, channel INTEGER NOT NULL, room INTEGER NOT NULL, seen TEXT NOT NULL,
  PRIMARY KEY (listing_id,item,price,seller,channel,room,seen,sold)
);
CREATE INDEX IF NOT EXISTS listing_history_item_seen ON listing_history(item,seen);
CREATE INDEX IF NOT EXISTS listings_seller_location ON listings(seller,channel,room,last_seen);
INSERT OR IGNORE INTO listing_history SELECT id,item,price,qty,sold,seller,channel,room,last_seen FROM listings;
CREATE TRIGGER IF NOT EXISTS listing_history_insert AFTER INSERT ON listings BEGIN
  INSERT OR IGNORE INTO listing_history VALUES (NEW.id,NEW.item,NEW.price,NEW.qty,NEW.sold,NEW.seller,NEW.channel,NEW.room,NEW.last_seen);
END;
CREATE TRIGGER IF NOT EXISTS listing_history_update AFTER UPDATE ON listings BEGIN
  INSERT OR IGNORE INTO listing_history VALUES (NEW.id,NEW.item,NEW.price,NEW.qty,NEW.sold,NEW.seller,NEW.channel,NEW.room,NEW.last_seen);
END;
