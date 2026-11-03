import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accuracyNeeded, fromWindow, hitChance, hitRange, hitsToKill, masteryLevel, SKILLS, skillsFor, windowRange } from '../assets/damage-calc.js';

const mobs = JSON.parse(readFileSync(new URL('../data/mobs.json', import.meta.url), 'utf8')).mobs;
const mob = (en) => mobs.find((m) => m.en === en);
const skill = (id) => SKILLS.find((s) => s.id === id);
// The published worked example: level 30 warrior, 132 STR, 30 DEX, Gladius (47 attack).
const warrior = { weapon: '1h_sword', stats: { str: 132, dex: 30, int: 4, luk: 4 }, watk: 47 };
const none = { wdef: 0, mdef: 0 };

test('stat window range matches the published level 30 warrior example', () => {
  const r0 = windowRange({ ...warrior, mastery: 0 });
  assert.equal(Math.trunc(r0.min), 59);
  assert.equal(Math.trunc(r0.max), 172);
  const r10 = windowRange({ ...warrior, mastery: 10 });
  assert.equal(Math.trunc(r10.min), 137);
});

test('Power Strike with and without mastery matches the published example', () => {
  assert.deepEqual(hitRange({ ...warrior, mastery: 0, skill: skill('power_strike'), mob: none }), { min: 154, max: 449 });
  assert.deepEqual(hitRange({ ...warrior, mastery: 10, skill: skill('power_strike'), mob: none }), { min: 357, max: 449 });
});

test('solving the stat window range gives back attack and mastery', () => {
  const r = windowRange({ ...warrior, mastery: 10 });
  const got = fromWindow({ weapon: '1h_sword', stats: warrior.stats, min: Math.trunc(r.min), max: Math.trunc(r.max) });
  assert.ok(Math.abs(got.watk - 47) < 0.4);
  assert.equal(got.mastery, 10);
  assert.equal(masteryLevel(20), 10);
  assert.equal(masteryLevel(5), 3);
});

test('defence and element weakness change the per-hit range', () => {
  const boar = mob('Fire Boar');
  assert.equal(boar.hp, 842);
  const plain = hitRange({ ...warrior, mastery: 10, skill: skill('power_strike'), mob: boar });
  assert.equal(plain.max, Math.trunc(449.65 * (100 / (boar.wdef + 100))));
  const mage = { weapon: 'wand', stats: { str: 4, dex: 4, int: 200, luk: 40 }, magic: 150, mastery: 0 };
  const ice = hitRange({ ...mage, skill: skill('cold_beam'), mob: boar });
  const fire = hitRange({ ...mage, skill: skill('fire_arrow'), mob: boar });
  assert.ok(ice.max > fire.max * 1.4, 'Fire Boar is weak to ice and resists fire');
});

test('hits to kill counts every line of a multi-hit skill', () => {
  assert.deepEqual(hitsToKill({ min: 300, max: 500 }, 2, 1000), { sure: 2, avg: 3 - 1 });
  assert.deepEqual(hitsToKill({ min: 0, max: 0 }, 1, 10), { sure: Infinity, avg: Infinity });
});

test('accuracy: same-level Zombie Lupin needs about 95 like the guides say', () => {
  const lupin = mob('Zombie Lupin');
  const need = accuracyNeeded(lupin.lv, lupin);
  assert.ok(need >= 90 && need <= 100, `needed ${need}`);
  assert.equal(hitChance(need, lupin.lv, lupin), 1);
  assert.ok(hitChance(need - 20, lupin.lv, lupin) < 1);
});

test('skill lists follow the weapon and second job', () => {
  const ids = (w, s) => skillsFor(w, s).map((x) => x.id);
  assert.ok(ids('claw', 'assassin').includes('lucky_seven'));
  assert.ok(!ids('dagger', 'bandit').includes('lucky_seven'));
  assert.ok(ids('wand', 'il').includes('cold_beam'));
  assert.ok(!ids('wand', 'il').includes('fire_arrow'));
  assert.ok(!ids('wand', 'il').includes('basic'));
  assert.ok(ids('spear', 'spearman').includes('fa_spear'));
});

test('poison uses the client code S: Dark Stone Golem resists Poison Breath', () => {
  const golem = mob('Dark Stone Golem');
  const mage = { weapon: 'wand', stats: { str: 4, dex: 4, int: 250, luk: 50 }, magic: 180, mastery: 0 };
  const breath = hitRange({ ...mage, skill: skill('poison_breath'), mob: golem });
  const bolt = hitRange({ ...mage, skill: { ...skill('poison_breath'), el: undefined }, mob: golem });
  assert.ok(breath.max < bolt.max);
});
