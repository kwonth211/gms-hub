-- Price alerts on top of the megaphone alerts: price = the asking price the user waits for (sell or any: at or below it,
-- buy: someone offering at least it). Matched against megaphones with a parsed price and against new shop listings.
-- sent_price = the price of the last notice, so a cheaper listing is announced again at once and the same one only after 6 hours.
ALTER TABLE discord_alerts ADD COLUMN price INTEGER;
ALTER TABLE discord_alerts ADD COLUMN sent_price INTEGER;
