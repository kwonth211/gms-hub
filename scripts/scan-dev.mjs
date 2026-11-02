// Local test server for the shop scanner: builds the site with dev-only pages, serves dist/ on http://localhost:8790, and keeps
// frames the scan page posts to /__scan/frame in ~/gms-hub-samples/ so the shop reader can be built and checked against them.
// Run: node scripts/scan-dev.mjs   then open http://localhost:8790/ko/tools/scan/ in Chrome.
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const samples = path.join(homedir(), 'gms-hub-samples');
const PORT = 8790;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' };

execFileSync('node', [path.join(root, 'scripts/build.mjs')], { env: { ...process.env, GMS_DEV: '1' }, stdio: 'inherit' });
mkdirSync(samples, { recursive: true });
let kept = 0;

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'POST' && url.pathname === '/__scan/frame') {
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => {
      const name = `frame-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      writeFileSync(path.join(samples, name), Buffer.concat(parts));
      kept++;
      console.log(`kept ${name} (${kept} this session)`);
      res.writeHead(204).end();
    });
    return;
  }
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!existsSync(file)) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
}).listen(PORT, '127.0.0.1', () => console.log(`Shop scan: http://localhost:${PORT}/ko/tools/scan/  (samples -> ${samples})`));
