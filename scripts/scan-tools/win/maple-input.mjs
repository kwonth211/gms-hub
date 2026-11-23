// 윈도우용 입력 도우미 (맥 maple-input.swift 의 foreground mode 와 같은 약속).
// 사용: node maple-input.mjs move|click|release <x> <y> [imgW imgH]   (GMS_ALLOW="x,y,w,h" 는 click 에 필요)
// 게임 마우스(KMBox)는 상점 수집기(price-collector)가 쥐고 있으므로, 그 프로세스의 마우스 빌려주기
// (mouse_lend.py, 127.0.0.1:47811)에 부탁하고 그 응답 줄을 그대로 stdout 으로 넘긴다. 키보드 입력은 보내지 않는다.
// 상점 수집기가 안 돌고 있으면 exit 4(지금은 못 누름)로 끝낸다.
import net from 'node:net';
const [action, x, y, w, h] = process.argv.slice(2);
if (!['move', 'click', 'release', 'hold'].includes(action) || !Number.isFinite(+x) || !Number.isFinite(+y)) { console.log(JSON.stringify({ error: 'usage' })); process.exit(2); }
const allow = (process.env.GMS_ALLOW || '').split(',').map(Number);
const msg = { action, x: +x, y: +y, ...(w && h ? { imgW: +w, imgH: +h } : {}), ...(allow.length === 4 && allow.every(Number.isFinite) ? { allow } : {}) };
if (action === 'click' && !msg.allow) { console.log(JSON.stringify({ error: 'Click outside the allowed area (chat box only)' })); process.exit(7); }
let code = 4, buf = '';
const sock = net.connect({ host: '127.0.0.1', port: 47811 }, () => sock.write(JSON.stringify(msg) + '\n'));
sock.setTimeout(12000, () => { console.log(JSON.stringify({ error: 'lend timeout' })); sock.destroy(); process.exit(4); });
sock.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    try { const o = JSON.parse(line); if ('exit' in o) { code = o.exit; continue; } } catch { continue; }
    process.stdout.write(line + '\n');
  }
});
sock.on('error', (e) => { if (action === 'release') process.exit(0); console.log(JSON.stringify({ error: `shop collector not running (${e.code || e.message})` })); process.exit(4); });
sock.on('close', () => process.exit(code));
