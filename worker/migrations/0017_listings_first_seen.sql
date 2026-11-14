-- "Newest first" on the market's all-listings view orders by when a listing first appeared, so a shop that was just
-- set up sits on top instead of under shops that were only checked again. The index lets that read stop after one page.
CREATE INDEX IF NOT EXISTS listings_first ON listings (first_seen);
