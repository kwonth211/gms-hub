-- What the ranking lookup says about a reported character, for the scam report cards: level, job and the character
-- picture (the same ClassicRank fields the ranking page shows). Apply with `d1 execute --file`.
ALTER TABLE scam_nicks ADD COLUMN level INTEGER;
ALTER TABLE scam_nicks ADD COLUMN job TEXT;
ALTER TABLE scam_nicks ADD COLUMN photo TEXT;
