// Where a shop stands: Free Market rooms 1-40, or a town street that players use as a market. Streets get room codes
// above 100 so they fit the same channel+room fields; 101 is the Kerning City construction site.
export const KERNING = 101;
export const STREETS = { [KERNING]: { ko: '커닝 공사장', en: 'Kerning Construction Site' } };
export const validRoom = (n) => Number.isInteger(n) && ((n >= 1 && n <= 40) || n in STREETS);
export const placeLabel = (room, ko) => (STREETS[room] ? STREETS[room][ko ? 'ko' : 'en'] : `FM ${room}`);
