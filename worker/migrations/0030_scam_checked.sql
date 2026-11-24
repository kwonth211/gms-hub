-- When a reported character's level, job and picture were last read from the ranking, so they can be read again every
-- few days (scam.js refreshProfiles). Apply with `d1 execute --file`.
ALTER TABLE scam_nicks ADD COLUMN checked_at TEXT;
