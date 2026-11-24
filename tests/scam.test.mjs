import test from 'node:test';
import assert from 'node:assert/strict';
import { scamAccusations, scamKinds, koInput, koOk, isPublic, postScamReport, postScamAppeal, handleScamAdmin } from '../worker/src/scam.js';

const names = (text, caller = 'Caller') => scamAccusations(text, caller).map((a) => `${a.nick}${a.strong ? '' : '?'}`).sort().join(',');

test('megaphone warnings name the player (lines read from the game on 2026-11-23/24)', () => {
  const cases = [
    ['DO NOT BUY FAME/SPOT FROM JENNASIN SHE SCAMS. LITTLE D OG', 'JENNASIN'],
    ['dont buy spot from JennaSin she scams 30k FORBIDDEN ENT CC30', 'JennaSin'],
    ['dont buy spot from JennaSin. she scams 30k for a spot beggar', 'JennaSin'],
    ['beware of JennaSin. scam spots for 30k', 'JennaSin'],
    ['dont buy from BlueGrey, also a spot scammer', 'BlueGrey'],
    ['LuckyDamage ls a scammer beware (Underpricing scam on people', 'LuckyDamage'],
    ['SooWoop ls a scammer EVERYONE BEWARE AND DEFAME', 'SooWoop'],
    ['SEIBAAAAAAAA ls a scammer BEWARE', 'SEIBAAAAAAAA'],
    ['[Black Napoleon] cutemariah is a 40 y/0 male scamming rodent bt w', 'cutemariah'],
    ['[Steely Throwing Knives] CUTEMARIAH = A 40 v0 SCAMMING RF ODENT BAITER', 'CUTEMARIAH'],
    ['[Black Napoleon] CuteMariah is a rodent scammer40 y/o man b ait/switch', 'CuteMariah'],
    ['[Tobi Throwing Stars] Dont trade CuteMariah she is scammer', 'CuteMariah'],
    ['[Tobi Throwing Stars] dont trade CuteMariah its a scam for sure', 'CuteMariah'],
    ['[Blue Crusader Chainmail] CuteMariah is scammer watch out and report', 'CuteMariah'],
    ['EndGameMage and CuteMariah scammers for 15luk Cape, careful!', 'CuteMariah,EndGameMage'],
    ['[Steely Throwing Knives] EndGameMage CuteMariah are tryin g to scam S> 15luk cape lol', 'CuteMariah,EndGameMage'],
    ['ChiefBandana = level 71 tying to scam, swaps out GFA 10 LOL', 'ChiefBandana'],
    ['[Mark of the Beta] Report Akundu scammer', 'Akundu'],
    ['LONTRA IS A SCAMMER BE CAREFUL', 'LONTRA'],
    ['[Special Store Permit] B> 48at Slain j TayKeith is a SCAMMER Blacklist', 'TayKeith'],
    ["Character name ''Peprika'' tries to scam in scroll trades", 'Peprika'],
    ['[Lemon] PSA Peprika tried to scroll swap scam', 'Peprika'],
    ['Terioth <<< Fame scamer', 'Terioth'],
    ['[Mokbi Throwing Stars] Jokr is a Scammer, BEWARE! POS hum an', 'Jokr'],
    ["Don't trust ThunderButz, he's a scammer lmao", 'ThunderButz'],
    ['BEWARE OF SPLINTERS. Dummy still tying bundle SCAMs', 'SPLINTERS'],
    ['Henking28 is doing scams on people dont trade with him', 'Henking28'],
    ['NaturJeks is a scammer and RMT. dont do deals with him', 'NaturJeks'],
    ['[Mark of the Beta] eLiranx441 trying to scam on FM4 CH10, easy defame', 'eLiranx441'],
    ['CH31 FM 10. IGN. NoFans = Star Scam ! DEFAME', 'NoFans'],
    ['Flamesmith << Chinese scammer watch out', 'Flamesmith'],
    ['xpromob21 is a wg scammer, avoid, bait and switch', 'xpromob21']
  ];
  for (const [text, want] of cases) assert.equal(names(text), want, text);
});

test('loose wording is kept as a weak report, never as a plain one', () => {
  assert.equal(names('[Kumbi Throwing Stars] || CAREFUL! Navy Ghost scamming kurnbis'), 'Navy?');
  assert.equal(names('Ch17 hot sands. IGN prequel, fame scam=. **fame and trade'), 'prequel?');
  assert.equal(names('Angriest why you scamming fame?'), 'Angriest?');
});

test('lines about scams that name nobody give nothing', () => {
  for (const text of [
    'Meso.watch Claw atk 60%. Scammers driving price down faking',
    'Search Claw atk 60% scoll on meso.watch. Mass scam right now',
    'Market Manipulation. Search CLAW atk 60% scroll. Mass scam',
    'S> Walter +4 Gslaot PMO. Karma is watching U scammers',
    'S> 9ATK THIEF GLOVES OR TRADING FOR INK SET',
    'this is a scam dont fall for it',
    '[Steel Slain] scrolling is a scam, selling to best offer, last sme ga',
    '[Bazlud] AtomicSip Smega clean +4 Sai then trying to scam w/ 5 slot! !',
    'she is a scammer'
  ]) assert.equal(names(text), '', text);
});

test('a caller cannot be the one they warn about', () => {
  assert.equal(names('Jokr is a scammer', 'jokr'), '');
});

test('a name is listed alone only when the character exists and the wording is plain or two players said it', () => {
  assert.equal(isPublic({ state: 'auto', verified: 1, strong: true, by: 1 }), true);
  assert.equal(isPublic({ state: 'auto', verified: 1, strong: false, by: 2 }), true);
  assert.equal(isPublic({ state: 'auto', verified: 1, strong: false, by: 1 }), false);
  assert.equal(isPublic({ state: 'auto', verified: 0, strong: true, by: 3 }), false);
  assert.equal(isPublic({ state: 'auto', verified: -1, strong: true, by: 3 }), false);
  assert.equal(isPublic({ state: 'hidden', verified: 1, strong: true, by: 9 }), false);
  assert.equal(isPublic({ state: 'shown', verified: -1, strong: false, by: 1 }), true);
});

// A tiny stand-in for D1: enough for the two public forms.
function fakeDb(counts = {}) {
  const ran = [];
  const stmt = (sql) => ({ sql, args: [], bind(...a) { this.args = a; return this; },
    async first() { ran.push(this); return { n: /scam_appeals/.test(sql) ? counts.appeals || 0 : counts.reports || 0 }; },
    async run() { ran.push(this); return { meta: { changes: 1 } }; } });
  return { ran, prepare: stmt, async batch(list) { ran.push(...list); return list.map(() => ({ meta: { changes: 1 } })); } };
}

test('a visitor report waits for review and is refused when it is empty, has a link or comes too often', async () => {
  const db = fakeDb();
  const [out, status] = await postScamReport({ DB: db }, { nick: 'JennaSin', text: 'took 30k for a spot and left the map', me: 'Kevan' }, 'v1');
  assert.equal(status, 200); assert.equal(out.ok, true);
  const insert = db.ran.find((s) => /INSERT OR IGNORE INTO scam_reports/.test(s.sql));
  assert.match(insert.sql, /'pending'/);
  assert.equal(insert.args[0], 'jennasin');
  assert.equal((await postScamReport({ DB: fakeDb() }, { nick: 'Jenna Sin', text: 'took 30k for a spot' }, 'v1'))[0].error, 'nick');
  assert.equal((await postScamReport({ DB: fakeDb() }, { nick: 'JennaSin', text: 'bad' }, 'v1'))[0].error, 'short');
  assert.equal((await postScamReport({ DB: fakeDb() }, { nick: 'JennaSin', text: 'proof at https://example.com/x' }, 'v1'))[0].error, 'link');
  assert.equal((await postScamReport({ DB: fakeDb({ reports: 5 }) }, { nick: 'JennaSin', text: 'took 30k for a spot' }, 'v1'))[1], 429);
});

test('a take-down request is stored for review', async () => {
  const db = fakeDb();
  const [out] = await postScamAppeal({ DB: db }, { nick: 'Lontra', message: 'That trade was finished, here is what happened.', contact: 'discord: lontra' }, 'v2');
  assert.equal(out.ok, true);
  assert.match(db.ran.at(-1).sql, /INSERT INTO scam_appeals/);
  assert.equal((await postScamAppeal({ DB: fakeDb() }, { nick: 'Lontra', message: 'no' }, 'v2'))[0].error, 'short');
  assert.equal((await postScamAppeal({ DB: fakeDb({ appeals: 3 }) }, { nick: 'Lontra', message: 'That trade was finished.' }, 'v2'))[1], 429);
});

test('the owner review answers only to the owner key', async () => {
  const ask = (token, env) => handleScamAdmin(new Request('https://test.invalid/internal/scam', { method: 'POST', body: JSON.stringify({ token, action: 'list' }) }), env, ['https://gms-hub.com']);
  assert.equal((await ask('wrong', { DASH_TOKEN: 'owner-key' })).status, 403);
  assert.equal((await ask('', { DASH_TOKEN: 'owner-key' })).status, 403);
  assert.equal((await ask('owner-key', {})).status, 403);
  assert.equal((await handleScamAdmin(new Request('https://test.invalid/internal/scam'), { DASH_TOKEN: 'owner-key' }, ['https://gms-hub.com'])).status, 405);
});

test('the kind of scam is read from the line, never from the linked item name', () => {
  assert.deepEqual(scamKinds('dont buy spot from JennaSin she scams 30k'), ['spot']);
  assert.deepEqual(scamKinds('Hiub is a fame scammer, if you see him DEFAME him !'), ['fame']);
  assert.deepEqual(scamKinds('[Lemon] PSA Peprika tried to scroll swap scam'), ['scroll', 'switch']);
  assert.deepEqual(scamKinds('BEWARE OF SPLINTERS. Dummy still tying bundle SCAMs'), ['bundle']);
  assert.deepEqual(scamKinds('[Gloves Attack Scroll: Intermediate] Jokr is a scammer'), []);
  assert.deepEqual(scamKinds('SooWoop ls a scammer EVERYONE BEWARE AND DEFAME'), []);
});

test('the Korean reading: the line is cleaned for the model, and a weak reading is thrown away', () => {
  assert.equal(koInput('[Steely Throwing Knives] CUTEMARIAH = A 40 y/0 SCAMMING BAITER', 'CuteMariah'), 'CuteMariah = a 40 y/0 scamming baiter');
  assert.equal(koInput('B> GFA 60% 1 .4M Report MasterAsian For tying to scam', 'MasterAsian'), 'Buying: GFA 60% 1.4M Report MasterAsian For tying to scam');
  assert.equal(koInput('[Black Napoleon] @inkwell ---> cutemariah = baiting a 15 luk cape', 'CuteMariah'), 'CuteMariah = baiting a 15 luk cape');
  assert.equal(koOk('inkwell과 CuteMariah가 15럭 망토로 바꿔치기 사기를 쳐요.', 'CuteMariah'), false, 'a bystander named');
  assert.equal(koOk('EndGameMage와 CuteMariah가 15럭 망토로 사기 쳐요.', 'CuteMariah', ['CuteMariah', 'EndGameMage']), true);
  assert.equal(koOk('JennaSin한테 인기도나 자리 사지 마세요. 사기 쳐요.', 'JennaSin'), true);
  assert.equal(koOk('MasterAsian이 사기 치려고 했으니 신고해 주세요.', 'MasterAsian'), true);
  assert.equal(koOk('LuckyDamage는 사기꾼이니 주의해', 'LuckyDamage'), false, '반말');
  assert.equal(koOk('cutemariah는 40세 남성 사기꾼이다', 'CuteMariah'), false, '~다');
  assert.equal(koOk('B> GFA 60% MasterAsian 사기꾼이에요', 'MasterAsian'), false, 'left-over trade mark');
  assert.equal(koOk('제나신은 사기꾼이에요.', 'JennaSin'), false, 'name lost');
  assert.equal(koOk('JennaSin is a scammer예요.', 'JennaSin'), false, 'English left in');
  assert.equal(koOk('ThunderButz를 믿지 마세요. 그는 사기꾼이에요.', 'ThunderButz'), false, 'pronoun');
  assert.equal(koOk('CuteMariah는 40살 남자로 바꿔치기 사기꾼이에요.', 'CuteMariah'), false, 'personal remark');
  assert.equal(koOk('ChiefBandana(레벨 71)가 사기 치려고 해요. 장갑 공격력 주문서를 10%짜리로 바꿔치기해요.', 'ChiefBandana'), true);
});
