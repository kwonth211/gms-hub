// Checks the EXP tracker the way a visitor uses it: a real Chrome window share of the open game, without touching the game.
//   node scripts/exp-share-check.mjs [base url]        (default http://127.0.0.1:8798, served from dist/)
// Needs the game window open, screen recording allowed for Chrome, and playwright-core (PLAYWRIGHT=path to its index.mjs).
// Visits are not counted: analytics and the live-viewer socket are blocked.
import { homedir } from 'node:os';
const { chromium } = await import(process.env.PLAYWRIGHT || `${homedir()}/gms-hub-imports/2026-11-09-latest-500/batch-research/node_modules/playwright-core/index.mjs`);
const base = process.argv[2] || 'http://127.0.0.1:8798';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--auto-select-window-capture-source-by-title=MapleStory', '--auto-select-desktop-capture-source=MapleStory', '--window-position=1500,60', '--window-size=1000,1000'] });
for (const [name, ctx, seconds] of [['normal screen', { viewport: null }, 35], ['small screen 1280x720 (scaled laptop)', { viewport: { width: 1000, height: 600 }, screen: { width: 1280, height: 720 } }, 15]]) {
  const context = await browser.newContext(ctx), page = await context.newPage();
  await page.route('**/*', (r) => (/cdn-cgi\/rum|cloudflareinsights|google-analytics|googletagmanager|clarity|doubleclick|googlesyndication|adfit|kakao|workers\.dev\/tool-report/.test(r.request().url()) ? r.abort() : r.continue()));
  await page.routeWebSocket(/presence/, () => {});
  await page.addInitScript(() => { const ask = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getDisplayMedia = async (o) => (window.shared = await ask(o)); });
  await page.goto(`${base}/ko/tools/exp/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('#exp-start').scrollIntoView());
  await page.click('#exp-start');
  const seen = new Set();
  for (let i = 0; i < seconds; i++) { await page.waitForTimeout(1000); seen.add(await page.evaluate(() => document.querySelector('#exp-check-read small')?.textContent)); }
  const info = await page.evaluate(() => { const s = window.shared?.getVideoTracks()[0].getSettings(); return `${s?.width}x${s?.height} | ${document.querySelector('#exp-check-lv small')?.textContent}`; });
  console.log(`## ${name}: ${info}\n   ${[...seen].join(' || ')}`);
  await context.close();
}
await browser.close();
