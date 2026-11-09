import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { selectExperiences, experienceCards, validateTraining } from '../assets/training-evidence.js';

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const training = JSON.parse(read('data/training.json'));
const guides = JSON.parse(read('data/guides.json')).guides;
execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });

test('level 20 does not inherit Ant Tunnel advice or another author’s class', () => {
  const rows = selectExperiences(training.experiences, { level: 20 });
  assert.deepEqual(rows.map((r) => r.id), ['archer-20-cost', 'level-20-quest-supplies']);
  assert.deepEqual(selectExperiences(rows, { job: 'archer' }).map((r) => r.id), ['archer-20-cost']);
  assert.equal(selectExperiences(rows, { job: 'archer', includeUnknownJob: true }).length, 2);
  assert.equal(selectExperiences(rows, { job: 'warrior' }).length, 0);
});

test('missing levels, beta evidence and adjacent levels cannot become recommendations', () => {
  const rows = training.experiences;
  assert.equal(selectExperiences(rows, { level: 21 }).length, 0);
  assert.equal(selectExperiences(rows, { level: 70 }).length, 0);
  assert.ok(!selectExperiences(rows, { level: 37 }).some((r) => r.id === 'deep-ant-hits'));
  assert.equal(selectExperiences([{ ...rows[0], context: 'historical' }]).length, 0);
  assert.ok(selectExperiences(rows).some((r) => r.id === 'deep-ant-hits'));
  assert.equal(selectExperiences(rows, { band: [61, 80] }).length, 0);
});

test('every account requires an original source, explicit unknowns and both-language limits', () => {
  assert.doesNotThrow(() => validateTraining(training));
  for (const mutate of [
    (r) => { delete r.source.author; },
    (r) => { r.source.url = 'javascript:alert(1)'; },
    (r) => { delete r.level; },
    (r) => { r.level = { min: 46, max: 32 }; },
    (r) => { delete r.limits.en; }
  ]) {
    const bad = structuredClone(training); mutate(bad.experiences[0]);
    assert.throws(() => validateTraining(bad));
  }
});

test('rendering preserves uncertainty, author and source without HTML injection', () => {
  const row = structuredClone(training.experiences.find((r) => r.id === 'deep-ant-hits'));
  row.title.ko = '<img src=x onerror=alert(1)>';
  const html = experienceCards([row], 'ko');
  assert.ok(html.includes('레벨 미기재') && html.includes('직업 미기재'));
  assert.ok(html.includes(row.source.url) && html.includes(row.source.author));
  assert.ok(html.includes('게시일 미확인'));
  assert.ok(!html.includes('<img'));
});

test('withheld bodies stay out of published HTML, recommendations, home search and sitemap', () => {
  const sitemap = read('dist/sitemap.xml');
  for (const g of guides) {
    const html = read(`dist/${g.lang}/guides/${g.slug}/index.html`);
    const home = read(`dist/${g.lang}/index.html`);
    if (g.status === 'withheld') {
      assert.match(html, /<meta name="robots" content="noindex">/);
      assert.ok(html.includes(g.reviewReason));
      assert.ok(!html.includes('"@type":"Article"'));
      assert.ok(!home.includes(`/guides/${g.slug}/`), `home search: ${g.slug}`);
      assert.ok(!sitemap.includes(`/${g.lang}/guides/${g.slug}/`));
      const oldBody = read(`data/guides/${g.slug}.${g.lang}.html`).trim();
      assert.ok(!html.includes(oldBody.slice(0, 100)), `withheld body: ${g.slug}`);
    } else {
      assert.ok(g.sources.length && g.reviewed && g.evidenceKind);
      assert.ok(sitemap.includes(`/${g.lang}/guides/${g.slug}/`));
      for (const source of g.sources) assert.ok(html.includes(source.url));
      for (const held of guides.filter((h) => h.status === 'withheld')) assert.ok(!html.includes(`/guides/${held.slug}/`));
    }
  }
});

test('training HTML and legacy band URLs publish evidence instead of theoretical ranks', () => {
  for (const lang of ['ko', 'en']) {
    const html = read(`dist/${lang}/tools/training/index.html`);
    assert.match(html, /type="module" src="[^"]*training.js/);
    assert.ok(html.includes('name="job"') && html.includes('name="unknown"'));
    assert.ok(!html.includes('meowdbExpHr') && !html.includes('1536786'));
    const band = read(`dist/${lang}/tools/training/level-61-80/index.html`);
    assert.match(band, /<meta name="robots" content="noindex">/);
    assert.ok(!read('dist/sitemap.xml').includes(`/${lang}/tools/training/level-61-80/`));
  }
});
