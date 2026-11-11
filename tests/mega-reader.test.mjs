import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, assemble, bandClass } from '../assets/mega-reader.js';

test('band colours: gold, dithered pink and teal are megaphones; the dark chat background is not', () => {
  assert.equal(bandClass(216, 168, 40), 'Y');
  assert.equal(bandClass(200, 152, 168), 'P');
  assert.equal(bandClass(184, 152, 168), 'P');
  assert.equal(bandClass(110, 200, 200), 'C');
  assert.equal(bandClass(24, 24, 8), null);
});

test('trade shorthand misreads are put back to S> and B>', () => {
  assert.equal(cleanText('[Arc Staff] 5» 95 MAG'), '[Arc Staff] S> 95 MAG');
  assert.equal(cleanText('S=kumbi 480K'), 'S> kumbi 480K');
  assert.equal(cleanText('Bxkumbi 460k'), 'B> kumbi 460k');
  assert.equal(cleanText('Sell meba PMO'), 'Sell meba PMO');
});

test('a wrapped second line joins the megaphone above it on the same colour only', () => {
  const out = assemble([
    { color: 'Y', nick: 'Armindz', channel: 1, text: '[Gloves Attack Scroll: Intermediate] S> Glove ATT 60% Scroll 1.5' },
    { color: 'Y', cont: true, text: 'M (Firm Price)' },
    { color: 'P', cont: true, text: 'stray line' },
    { color: 'P', nick: 'lord0', channel: 1, text: 'S> Teddy Bear 105k' }
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].text, '[Gloves Attack Scroll: Intermediate] S> Glove ATT 60% Scroll 1.5 M (Firm Price)');
  assert.equal(out[1].nick, 'lord0');
});

test('misread bracketed item names snap to the catalogue only when clearly the same item', async () => {
  const { itemFixer } = await import('../assets/mega-reader.js');
  const fix = itemFixer(['Sapphire Earrings', 'White Choco Bunny', 'Zard', 'Work Gloves']);
  assert.equal(fix('[Sapphire Earmings] S> 1m'), '[Sapphire Earrings] S> 1m');
  assert.equal(fix('[white Choco Bunry] S> 850k'), '[White Choco Bunny] S> 850k');
  assert.equal(fix('[work gloves] PMO'), '[Work Gloves] PMO');
  assert.equal(fix('[Totally Unknown Thing] hi'), '[Totally Unknown Thing] hi');
});
