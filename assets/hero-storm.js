// A small, cached canvas layer over the existing home scene. No libraries or network requests.
// Keep all layout reads out of the render loop and stop scheduling work whenever it is not visible.
const MAPLE = [
  '00000000100000000', '00000001110000000', '00010001110001000',
  '00011011111011000', '00011111111111000', '00001111111110000',
  '10001111111110001', '11011111111111011', '01111111111111110',
  '00111111111111100', '00011111111111000', '00001111111110000',
  '00111111111111100', '00000001110000000', '00000000110000000',
  '00000000110000000', '00000000100000000',
];
const COLORS = ['#ffb54f', '#ffd383', '#e9803e', '#ffe9b5'];
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const random = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const mix = (a, b, t) => a + (b - a) * t;

export function mountHeroStorm(hero) {
  if (!hero || hero.querySelector('.hero-storm')) return;
  const card = hero.querySelector('.hero-card');
  if (!card) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.className = 'hero-storm';
  canvas.setAttribute('aria-hidden', 'true');
  hero.insertBefore(canvas, hero.querySelector('.hero-inner'));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 760px)');
  const connection = navigator.connection;
  const constrained = !!connection?.saveData || (navigator.hardwareConcurrency || 8) <= 4;
  const profile = new URLSearchParams(location.search).has('hero-perf');
  const cells = [];
  MAPLE.forEach((row, y) => [...row].forEach((v, x) => { if (v === '1') cells.push([x - 8, y - 8]); }));
  function texture(size, draw) {
    const image = document.createElement('canvas');
    image.width = image.height = size;
    draw(image.getContext('2d'), size);
    return image;
  }
  const leaves = COLORS.map(color => texture(34, (c) => {
    c.fillStyle = color;
    for (const [x, y] of cells) c.fillRect((x + 8) * 2, (y + 8) * 2, 2, 2);
  }));
  // Gradients and the crest's light sweep are rasterized once, never recreated per particle/frame.
  const glow = texture(256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, '#ffd18465'); g.addColorStop(.45, '#efa44825'); g.addColorStop(1, '#efa44800');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
  const crests = Array.from({ length: 10 }, (_, frame) => texture(204, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 204);
    g.addColorStop(0, '#ffe7a5'); g.addColorStop(.48, '#ffba57'); g.addColorStop(1, '#d97634');
    for (const [x, y] of cells) {
      c.fillStyle = '#a7662b'; c.fillRect((x + 8) * 11 + 9, (y + 8) * 11 + 12, 11, 11);
    }
    for (const [x, y] of cells) {
      c.fillStyle = g; c.fillRect((x + 8) * 11 + 7, (y + 8) * 11 + 7, 11, 11);
      if (frame) {
        const shine = Math.exp(-Math.pow((x + y - (frame - 5) * 4) / 2.6, 2));
        if (shine > .05) {
          c.fillStyle = `rgba(255,249,216,${shine * .8})`;
          c.fillRect((x + 8) * 11 + 7, (y + 8) * 11 + 7, 11, 11);
        }
      }
    }
  }));
  const particles = Array.from({ length: 144 }, (_, i) => ({
    target: cells[i % cells.length], seed: random(i + 10), orbit: .8 + random(i + 3) * 1.12,
    angle: i * 2.399, image: leaves[i % 4],
  }));
  let width = 0, height = 0, radius = 0, inView = false, away = false, disposed = false;
  let frameId = 0, timer = 0, layoutId = 0, time = .25, previous = 0, lastReport = 0;
  let count = constrained ? 72 : 144, fps = constrained ? 24 : 30, slowFrames = 0, overloaded = false;
  let frameCount = 0, totalMs = 0, maxMs = 0;
  const samples = [];
  const canRun = () => !disposed && !away && inView && !document.hidden
    && !reduced.matches && !narrow.matches && !overloaded && width >= 160;

  // The little game shares the existing capped frame loop; pointer events only update coordinates.
  const lang = (document.documentElement.lang || 'en').split('-')[0];
  const words = ({
    ko: ['단풍 모으기', '그만하기', '한 번 더', '마우스를 움직여 가을 바람을 만들어 보세요', '반짝이는 단풍에 마우스를 올려보세요', '단풍 5개 완성! 가을의 기운을 모았어요', '황금 단풍 모으기'],
    en: ['Collect leaves', 'Stop', 'Play again', 'Move your mouse to stir the autumn breeze', 'Move over the glowing leaf to collect it', 'All 5 collected! Autumn magic unlocked', 'Collect golden leaf'],
    ja: ['もみじ集め', 'やめる', 'もう一度', 'マウスを動かして秋風を起こそう', '光るもみじにマウスを重ねよう', '5枚達成！秋の魔法を集めたよ', '金色のもみじを集める'],
    zh: ['收集楓葉', '停止', '再玩一次', '移動滑鼠，掀起一陣秋風', '將滑鼠移到發光的楓葉上', '集齊5片！秋日魔法完成', '收集金色楓葉'],
  })[lang] || ['Collect leaves', 'Stop', 'Play again', 'Move your mouse to stir the autumn breeze', 'Move over the glowing leaf to collect it', 'All 5 collected! Autumn magic unlocked', 'Collect golden leaf'];
  const play = document.createElement('div'); play.className = 'hero-play';
  const status = document.createElement('span'); status.className = 'hero-play-status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'hero-play-toggle';
  const target = document.createElement('button'); target.type = 'button'; target.className = 'hero-play-leaf'; target.hidden = true;
  target.innerHTML = `<svg viewBox="0 0 17 17" aria-hidden="true" focusable="false">${cells.map(([x, y]) => `<rect x="${x + 8}" y="${y + 8}" width="1" height="1"/>`).join('')}</svg>`;
  play.append(status, toggle); hero.append(play, target);
  const spots = [[.72, .24], [.23, .55], [.66, .60], [.29, .22], [.5, .4]];
  let playing = false, score = 0, originX = 0, originY = 0, canvasLeft = 0, canvasTop = 0;
  let pointer = null, lastPointer = null, driftX = 0, driftY = 0, celebration = -10;
  const sparks = [];
  function labelGame() {
    toggle.textContent = playing ? words[1] : score === 5 ? words[2] : words[0];
    toggle.setAttribute('aria-pressed', String(playing));
    status.textContent = playing ? `${score} / 5 · ${words[4]}` : score === 5 ? words[5] : words[3];
    target.hidden = !playing || !canRun();
    if (playing) {
      const [x, y] = spots[score];
      target.style.left = `${canvasLeft + width * x}px`; target.style.top = `${canvasTop + height * y}px`;
      target.setAttribute('aria-label', `${words[6]} ${score + 1} / 5`);
    }
    play.dataset.score = String(score);
  }
  function burst(x, y, amount = 16) {
    const limit = count > 72 ? 48 : 24;
    for (let i = 0; i < amount; i++) {
      const a = i * 2.399;
      sparks.push({ x, y, vx: Math.cos(a) * 65, vy: Math.sin(a) * 65 - 22, born: time, life: .8, angle: a, image: leaves[i % 4], size: 9 + i % 6 });
    }
    if (sparks.length > limit) sparks.splice(0, sparks.length - limit);
  }
  function collect() {
    if (!playing || !canRun()) return;
    const [x, y] = spots[score]; burst(width * x, height * y);
    score++;
    if (score === 5) {
      playing = false; celebration = time; burst(width / 2, height * .42, 30);
      if (document.activeElement === target) toggle.focus({ preventScroll: true });
    }
    labelGame();
  }
  function toggleGame() {
    if (!canRun()) return;
    playing = !playing; score = 0; labelGame();
  }
  function move(event) {
    if (!canRun() || event.pointerType === 'touch' || event.target.closest?.('.hero-card')) { pointer = null; return; }
    const x = event.clientX + window.scrollX - originX, y = event.clientY + window.scrollY - originY;
    pointer = x >= 0 && x <= width && y >= 0 && y <= height ? { x, y } : null;
  }
  const clearPointer = () => { pointer = lastPointer = null; };
  hero.addEventListener('pointermove', move, { passive: true });
  hero.addEventListener('pointerleave', clearPointer);
  toggle.addEventListener('click', toggleGame);
  target.addEventListener('pointerenter', collect); target.addEventListener('click', collect);
  labelGame();

  function drawPlay() {
    if (pointer && (!lastPointer || Math.hypot(pointer.x - lastPointer.x, pointer.y - lastPointer.y) > 5)) {
      const limit = count > 72 ? 48 : 24;
      if (sparks.length >= limit) sparks.shift();
      sparks.push({ ...pointer, vx: -12, vy: -22, born: time, life: .65, angle: time * 3, image: leaves[frameCount % 4], size: 10 });
      lastPointer = pointer;
    }
    if (!pointer) lastPointer = null;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i], age = time - p.born;
      if (age >= p.life) { sparks.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = (1 - age / p.life) * .9;
      ctx.translate(p.x + p.vx * age, p.y + p.vy * age + 30 * age * age); ctx.rotate(p.angle + age * 2);
      ctx.drawImage(p.image, -p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
    }
    const age = time - celebration;
    if (age >= 0 && age < 1.2) {
      ctx.globalAlpha = (1 - age / 1.2) * .65; ctx.strokeStyle = '#ffe2a1'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(width / 2, height * .42, radius * (.6 + age * 1.7), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function draw(t) {
    ctx.clearRect(0, 0, width, height);
    if (width < 160) return;
    const phase = t % 11.5, gather = smooth((phase - 1.05) / 2.3), release = smooth((phase - 7.35) / 2.2);
    driftX = mix(driftX, pointer ? (pointer.x / width - .5) * 22 : 0, .12);
    driftY = mix(driftY, pointer ? (pointer.y / height - .5) * 14 : 0, .12);
    const hold = gather * (1 - release), x = width / 2 + driftX, y = height * .42 + Math.sin(t * .9) * 3 + driftY;
    const cell = radius / 8.5;
    ctx.drawImage(glow, x - radius * 1.9, y - radius * 1.9, radius * 3.8, radius * 3.8);
    for (let band = 0; band < 3; band++) {
      const offset = band * 2.1 + t * (.9 + .5 * (1 - hold));
      const r = radius * (1.22 + band * .12) * (1 + release * .4);
      ctx.lineWidth = 1.2; ctx.strokeStyle = COLORS[band];
      ctx.globalAlpha = .12 + (1 - hold) * .2;
      ctx.beginPath();
      for (let j = 0; j < 24; j++) {
        const a = offset + j * .08, px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r * .45 + Math.cos(a) * 20;
        if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    for (let i = 0; i < count; i++) {
      const p = particles[i], a = p.angle + (t * .75 + gather * 3.1) * (.8 + p.seed * .35);
      const convergence = smooth((phase - 1.05 - p.seed * .42) / 1.85) * (1 - release);
      const escape = release * release, orbit = radius * p.orbit;
      const px = mix(x + Math.cos(a) * orbit, x + p.target[0] * cell, convergence) + Math.cos(p.angle) * escape * radius * 2.7;
      const py = mix(y + Math.sin(a) * orbit * .64, y + p.target[1] * cell, convergence) + Math.sin(p.angle) * escape * radius * 1.8 - escape * 35;
      const size = mix(7 + (Math.sin(a) + 1) * 4 + p.seed * 3, cell * .92, convergence) * (1 + escape * .6);
      ctx.save();
      ctx.globalAlpha = (.45 + p.seed * .45) * (1 - smooth((phase - 9.1) / 1.4)) * (1 - hold * .25);
      ctx.translate(px, py); ctx.rotate(mix(a, 0, convergence) + release * p.seed * 5);
      ctx.drawImage(p.image, -size / 2, -size / 2, size, size); ctx.restore();
    }
    const alpha = smooth((phase - 2.8) / .7) * (1 - smooth((phase - 7.35) / .85));
    if (alpha > 0) {
      const sweep = phase > 4 && phase < 6.2 ? Math.min(9, 1 + Math.floor((phase - 4) / 2.2 * 9)) : 0;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
      ctx.transform(.96 + Math.sin(t * .7) * .035, Math.sin(t * .55) * .025, 0, 1, 0, 0);
      ctx.drawImage(crests[sweep], -radius, -radius, radius * 2, radius * 2); ctx.restore();
    }
    const wave = (phase - 3.35) / 2.15;
    if (wave > 0 && wave < 1) {
      ctx.globalAlpha = (1 - wave) ** 2 * .64; ctx.strokeStyle = '#ffe2a1'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, radius * (.75 + wave * 1.9), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawPlay();
  }
  function cancel() {
    clearTimeout(timer); cancelAnimationFrame(frameId); timer = frameId = 0; previous = 0;
  }
  function report(state) {
    canvas.dataset.motion = state;
    if (profile) {
      const sorted = [...samples].sort((a, b) => a - b);
      canvas.dataset.performance = JSON.stringify({ frames: frameCount, particles: count, fpsCap: fps,
        meanMs: +(totalMs / (frameCount || 1)).toFixed(2), p95Ms: +(sorted[Math.floor(sorted.length * .95)] || 0).toFixed(2), maxMs: +maxMs.toFixed(2),
        backingWidth: canvas.width, backingHeight: canvas.height, interactionParticles: sparks.length });
    }
  }
  function frame(now) {
    frameId = 0;
    if (!canRun()) { sync(); return; }
    const elapsed = previous ? Math.min((now - previous) / 1000, .1) : 0;
    previous = now; time += elapsed;
    const started = performance.now(); draw(time); const cost = performance.now() - started;
    frameCount++; totalMs += cost; maxMs = Math.max(maxMs, cost);
    if (profile) { samples.push(cost); if (samples.length > 180) samples.shift(); }
    slowFrames = cost > 6 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames >= 12 && count > 72) { count = 72; fps = 24; slowFrames = 0; }
    else if (slowFrames >= 24) { overloaded = true; sync(); return; }
    if (now - lastReport >= 1000) { report('playing'); lastReport = now; }
    timer = setTimeout(() => { timer = 0; frameId = requestAnimationFrame(frame); }, Math.max(0, 1000 / fps - cost));
  }
  function sync() {
    cancel();
    if (disposed) return;
    play.hidden = !canRun(); target.hidden = !playing || !canRun();
    if (!canRun()) { clearPointer(); sparks.length = 0; driftX = driftY = 0; celebration = -10; }
    if (document.hidden || away) report('hidden');
    else if (!inView) report('offscreen');
    else if (canRun()) { report('playing'); frameId = requestAnimationFrame(frame); }
    else { draw(5); report('static'); }
  }
  function layout() {
    layoutId = 0;
    if (disposed) return;
    const box = hero.getBoundingClientRect(), copy = card.getBoundingClientRect();
    // Use only the free area to the right of the unchanged search card. Phones keep their existing layout.
    const left = narrow.matches ? Math.max(0, box.width - 220) : Math.max(0, copy.right - box.left + 12);
    const free = Math.max(0, box.width - left - 12);
    width = Math.min(560, free); height = Math.min(480, box.height);
    canvas.style.left = `${left + (free - width) / 2}px`;
    canvas.style.top = `${Math.max(0, (box.height - height) / 2)}px`;
    canvasLeft = left + (free - width) / 2; canvasTop = Math.max(0, (box.height - height) / 2);
    originX = box.left + window.scrollX + canvasLeft; originY = box.top + window.scrollY + canvasTop;
    play.style.left = `${canvasLeft}px`; play.style.top = `${canvasTop + height * .81}px`; play.style.width = `${width}px`;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const dpr = Math.min(devicePixelRatio || 1, constrained || narrow.matches ? 1 : 1.5);
    canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); radius = Math.min(110, width * .29, height * .23);
    labelGame();
    sync();
  }
  function requestLayout() { if (!layoutId && !disposed) layoutId = requestAnimationFrame(layout); }
  const resize = new ResizeObserver(requestLayout); resize.observe(hero); resize.observe(card);
  const intersection = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, { threshold: 0 });
  intersection.observe(hero);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync); narrow.addEventListener('change', requestLayout);
  const leave = () => { away = true; cancel(); cancelAnimationFrame(layoutId); layoutId = 0; };
  const enter = () => { away = false; requestLayout(); };
  window.addEventListener('pagehide', leave); window.addEventListener('pageshow', enter);
  layout();
  return () => {
    disposed = true; cancel(); cancelAnimationFrame(layoutId);
    resize.disconnect(); intersection.disconnect();
    document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync);
    narrow.removeEventListener('change', requestLayout); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', enter);
    hero.removeEventListener('pointermove', move); hero.removeEventListener('pointerleave', clearPointer);
    toggle.removeEventListener('click', toggleGame); target.removeEventListener('pointerenter', collect); target.removeEventListener('click', collect);
    canvas.remove(); play.remove(); target.remove();
  };
}

if (typeof document !== 'undefined') mountHeroStorm(document.querySelector('.hero'));
