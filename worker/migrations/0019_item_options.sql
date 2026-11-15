-- Equipment options sent with a listing or megaphone (worker/src/item-options.js): compact JSON, NULL when unknown.
-- Same row, no index, so storing them adds no writes.
ALTER TABLE listings ADD COLUMN opts TEXT;
ALTER TABLE megaphones ADD COLUMN opts TEXT;
