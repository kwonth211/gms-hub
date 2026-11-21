-- Which shop names an anonymous contributor uploaded (worker/src/contributors.js). Someone who mostly uploads one shop is
-- almost always its owner, so the leaderboard shows that in-game name instead of "anonymous" (owner, 2026-11-21).
CREATE TABLE IF NOT EXISTS contributor_sellers (
  who TEXT NOT NULL,
  seller TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (who, seller)
);
