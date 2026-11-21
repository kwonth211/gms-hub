-- Contributor leaderboard (worker/src/contributors.js): points per KST day for public uploads from the site — shop scan
-- listings (kind 'scan') and sold reports (kind 'gone'). who = 'd:<discord id>' when logged in, else 'a:<visitor hash>'.
CREATE TABLE IF NOT EXISTS contributions (
  day TEXT NOT NULL,
  who TEXT NOT NULL,
  name TEXT,
  avatar TEXT,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, who, kind)
);
CREATE INDEX IF NOT EXISTS contributions_who ON contributions (who);
