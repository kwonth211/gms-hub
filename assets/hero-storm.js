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
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-pressed', 'false');
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

  // Direct manipulation of the existing leaves, with no extra particles or animation loop.
  const lang = (document.documentElement.lang || 'en').split('-')[0];
  const words = ({
    ko: ['꾹 누르면 모이고 · 놓으면 흩어져요', '단풍 장난감. 마우스로 흩뜨리고 꾹 눌러 모으세요. 키보드는 스페이스 또는 엔터를 길게 누르세요.'],
    en: ['Hold to gather · release to scatter', 'Maple toy. Stir with your mouse, hold to gather, release to scatter. Keyboard: hold Space or Enter.'],
    ja: ['長押しで集める · 離すと舞い散る', 'もみじのおもちゃ。マウスで散らし、長押しで集めます。キーボードはスペースかエンターを長押し。'],
    zh: ['按住聚攏 · 放開飄散', '楓葉玩具。移動滑鼠撥散，按住聚攏，放開飄散。鍵盤可長按空白鍵或 Enter。'],
  })[lang] || ['Hold to gather · release to scatter', 'Maple toy. Hold Space or Enter to gather, release to scatter.'];
  const hint = document.createElement('span'); hint.className = 'hero-toy-hint'; hint.textContent = words[0];
  hero.append(hint); canvas.setAttribute('aria-label', words[1]);
  let originX = 0, originY = 0, pointer = null, pressed = false, pointerId = null, propPointerId = null;
  let heldProp = null;
  let heldSince = 0, influence = 0, burstAt = -10, burstX = 0, burstY = 0;
  function coordinates(event) {
    return { x: Math.max(20, Math.min(width - 20, event.clientX + window.scrollX - originX)),
      y: Math.max(20, Math.min(height - 20, event.clientY + window.scrollY - originY)) };
  }
  const isControl = event => !event.target?.closest?.('.hero-prop-hit')
    && !!event.target?.closest?.('.hero-card, a, button, input, select, textarea, summary, [contenteditable]');
  function propAt(event, live = false) {
    const x = event.clientX + window.scrollX, y = event.clientY + window.scrollY;
    // Re-read moving sprite bounds on press only. Pointer movement uses cached rectangles.
    return props.find(prop => {
      if (!prop.visible) return false;
      const r = live ? prop.art.getBoundingClientRect() : null;
      const box = r ? { left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height } : prop.box;
      return box && x >= box.left - 5 && x <= box.left + box.width + 5 && y >= box.top - 5 && y <= box.top + box.height + 5;
    });
  }
  function move(event) {
    if (!canRun() || event.pointerType === 'touch' || (pointerId !== null && event.pointerId !== pointerId)) return;
    if (propPointerId !== null) {
      if (event.pointerId !== propPointerId) return;
      if (heldProp) {
        const p = heldProp;
        p.tx = Math.max(p.minX, Math.min(p.maxX, event.clientX + window.scrollX - p.grabX - p.home.left));
        p.ty = Math.max(p.minY, Math.min(0, event.clientY + window.scrollY - p.grabY - p.home.top));
      }
      if (event.buttons === 0) release(event);
      return;
    }
    if (!pressed && (isControl(event) || propAt(event))) { pointer = null; return; }
    pointer = coordinates(event);
    if (pressed && pointerId !== null && event.buttons === 0) release();
  }
  function press(event) {
    if (!canRun() || event.pointerType === 'touch' || event.button !== 0 || pressed || propPointerId !== null || isControl(event)) return;
    event.preventDefault();
    hero.dataset.toyInput = 'pointer';
    const prop = propAt(event, true);
    if (prop) {
      pointer = null; propPointerId = event.pointerId;
      if (prop.kind === 'coin') prop.react(true);
      else {
        startDrag(prop, event);
        canvas.setPointerCapture(propPointerId);
      }
      return;
    }
    canvas.focus({ preventScroll: true });
    // Re-read once on press in case content above the hero shifted after loading.
    const box = canvas.getBoundingClientRect(); originX = box.left + window.scrollX; originY = box.top + window.scrollY;
    pointer = coordinates(event); pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId); pressed = true; heldSince = time;
    canvas.setAttribute('aria-pressed', 'true');
  }
  function release(event) {
    if (propPointerId !== null) {
      if (!event || event.pointerId === propPointerId) {
        const oldId = propPointerId; propPointerId = null; pointer = null;
        if (heldProp) {
          const p = heldProp; heldProp = null;
          p.state = 'falling'; p.released = time; p.bounces = 0;
          // A simple click still gives a playful hop; a dragged monster keeps its measured momentum.
          if (Math.abs(p.dy) < 5 && Math.abs(p.dx - p.tx) < 5) p.vy = -340;
          p.vx = Math.max(-600, Math.min(600, p.vx)); p.vy = Math.max(-500, Math.min(600, p.vy));
          p.art.dataset.dragState = 'falling'; delete hero.dataset.monsterHeld;
        }
        if (canvas.hasPointerCapture(oldId)) canvas.releasePointerCapture(oldId);
      }
      return;
    }
    if (event && pointerId !== null && event.pointerId !== pointerId) return;
    if (!pressed) return;
    const charge = Math.min(1, (time - heldSince) / 1.5);
    burstX = pointer.x; burstY = pointer.y; burstAt = time;
    for (let i = 0; i < count; i++) {
      const p = particles[i], a = p.angle + time * .6;
      p.vx = Math.cos(a) * (210 + charge * 330 + p.seed * 100);
      p.vy = Math.sin(a) * (210 + charge * 330 + p.seed * 100);
    }
    pressed = false; canvas.setAttribute('aria-pressed', 'false');
    const oldId = pointerId; pointerId = null;
    if (oldId !== null && canvas.hasPointerCapture(oldId)) canvas.releasePointerCapture(oldId);
  }
  function resetToy() {
    const oldPropId = propPointerId; propPointerId = null;
    if (heldProp) { heldProp.stop(); heldProp = null; }
    delete hero.dataset.monsterHeld;
    if (oldPropId !== null && canvas.hasPointerCapture(oldPropId)) canvas.releasePointerCapture(oldPropId);
    pressed = false; pointer = null; influence = 0; burstAt = -10;
    canvas.setAttribute('aria-pressed', 'false');
    const oldId = pointerId; pointerId = null;
    if (oldId !== null && canvas.hasPointerCapture(oldId)) canvas.releasePointerCapture(oldId);
    for (const p of particles) { p.x = p.y = undefined; p.vx = p.vy = 0; }
  }
  const exitPointer = () => { if (!pressed) pointer = null; };
  const keyDown = event => {
    if (![' ', 'Enter'].includes(event.key) || !canRun()) return;
    event.preventDefault();
    if (event.repeat || pressed || propPointerId !== null) return;
    pointer = { x: width / 2, y: height * .42 }; pressed = true; heldSince = time;
    canvas.setAttribute('aria-pressed', 'true');
  };
  const keyUp = event => {
    if (![' ', 'Enter'].includes(event.key) || pointerId !== null) return;
    event.preventDefault(); release(); pointer = null;
  };
  hero.addEventListener('pointermove', move, { passive: true });
  hero.addEventListener('pointerdown', press);
  hero.addEventListener('pointerleave', exitPointer);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('keydown', keyDown); canvas.addEventListener('keyup', keyUp);
  canvas.addEventListener('blur', resetToy);
  window.addEventListener('pointerup', release); window.addEventListener('pointercancel', resetToy);
  window.addEventListener('blur', resetToy);
  const keyboardMode = event => { if (['Tab', ' ', 'Enter'].includes(event.key)) hero.dataset.toyInput = 'keyboard'; };
  window.addEventListener('keydown', keyboardMode);

  // The hero routes each pointer gesture to exactly one target: a live sprite, or the leaves.
  // Coins use browser-managed transforms; dragged monsters share the existing capped canvas loop.
  const propNames = ({ ko: ['주황버섯 잡아 끌기 · Enter로 점프', '슬라임 잡아 끌기 · Enter로 점프', '메소 동전 튕기기'],
    en: ['Drag the mushroom · Enter to bounce', 'Drag the slime · Enter to bounce', 'Flip the meso coin'],
    ja: ['キノコをジャンプ', 'スライムをジャンプ', 'メルコインを弾く'],
    zh: ['讓菇菇跳躍', '讓史萊姆跳躍', '彈起楓幣'] })[lang] || ['Bounce the mushroom', 'Bounce the slime', 'Flip the meso coin'];
  const scene = hero.querySelector('.hero-scene');
  const propStage = scene?.cloneNode(false);
  if (propStage) { propStage.setAttribute('class', 'hero-prop-stage'); hero.append(propStage); }
  const props = [...hero.querySelectorAll('[data-hero-prop]')].map(node => {
    const kind = node.dataset.heroProp, art = node.querySelector('.hero-prop-art');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'hero-prop-hit';
    button.setAttribute('aria-label', propNames[['mushroom', 'slime', 'coin'].indexOf(kind)]);
    button.hidden = true; button.dataset.kind = kind; hero.append(button);
    const prop = { node, art, button, kind, parent: node.parentNode, next: node.nextSibling, visible: false, animation: null, state: 'idle', dx: 0, dy: 0, vx: 0, vy: 0 };
    const stop = () => {
      const animation = prop.animation; prop.animation = null; animation?.cancel();
      delete art.dataset.reaction; delete button.dataset.reaction;
      prop.state = 'idle'; prop.dx = prop.dy = prop.vx = prop.vy = 0;
      art.style.transform = ''; art.style.animationPlayState = ''; button.style.transform = '';
      delete art.dataset.dragState;
      if (propStage && node.parentNode === propStage) prop.parent.insertBefore(node, prop.next?.parentNode === prop.parent ? prop.next : null);
    };
    const react = (strong = false) => {
      if (!canRun() || !prop.visible || (!strong && prop.animation)) return;
      stop();
      const coin = kind === 'coin', high = kind === 'slime' ? 16 : 12;
      const frames = !strong ? [
        { transform: 'translateY(0) scale(1)' },
        { transform: coin ? 'translateY(-3px) scaleX(.55)' : 'translateY(-2px) scale(1.12, .88)' },
        { transform: 'translateY(0) scale(1)' },
      ] : coin ? [
        { transform: 'translateY(0) scaleX(1)' },
        { transform: 'translateY(-12px) scaleX(.08)' },
        { transform: 'translateY(-18px) scaleX(1)' },
        { transform: 'translateY(-12px) scaleX(.08)' },
        { transform: 'translateY(0) scaleX(1)' },
      ] : [
        { transform: 'translateY(0) scale(1, 1)', offset: 0 },
        { transform: 'translateY(1px) scale(1.22, .72)', offset: .15 },
        { transform: `translateY(-${high}px) scale(.85, 1.16)`, offset: .44 },
        { transform: 'translateY(0) scale(1.16, .83)', offset: .78 },
        { transform: 'translateY(0) scale(1, 1)', offset: 1 },
      ];
      art.dataset.reaction = button.dataset.reaction = strong ? coin ? 'spin' : 'hop' : 'hello';
      const animation = art.animate(frames, { duration: strong ? 760 : 340, easing: 'ease-in-out' });
      prop.animation = animation;
      animation.onfinish = () => { if (prop.animation === animation) stop(); };
    };
    // Pointer presses are routed once by the hero; native keyboard clicks stay accessible.
    const click = event => { if (!event?.detail && !heldProp) { pointer = null; react(true); } };
    button.addEventListener('click', click);
    prop.react = react;
    prop.stop = stop;
    prop.dispose = () => { stop(); button.removeEventListener('click', click); button.remove(); };
    return prop;
  });
  function layoutProps(box, copy) {
    for (const prop of props) {
      const r = prop.node.getBoundingClientRect(), w = Math.max(44, r.width), h = Math.max(44, r.height);
      const x = r.left + (r.width - w) / 2, y = r.top + (r.height - h) / 2;
      prop.heroBox = { left: box.left + window.scrollX, top: box.top + window.scrollY, width: box.width, height: box.height, safeLeft: copy.right + window.scrollX + 8 };
      const matrix = prop.node.getScreenCTM(); prop.scale = Math.hypot(matrix.a, matrix.b) || 1;
      prop.box = { left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height };
      prop.visible = x >= copy.right + 8 && x >= box.left && x + w <= box.left + box.width
        && y >= box.top && y + h <= box.top + box.height;
      prop.button.style.left = `${x - box.left}px`; prop.button.style.top = `${y - box.top}px`;
      prop.button.style.width = `${w}px`; prop.button.style.height = `${h}px`;
    }
  }
  function startDrag(p, event) {
    if (p.state === 'idle') {
      p.stop();
      p.art.style.animationPlayState = 'paused';
      if (propStage) propStage.append(p.node);
      // Read once when grabbing. All following motion uses cached bounds and transform writes only.
      const r = p.art.getBoundingClientRect();
      p.home = { left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height };
      const b = p.heroBox;
      p.minX = b.safeLeft - p.home.left; p.maxX = b.left + b.width - 12 - p.home.left - r.width;
      p.minY = b.top + 12 - p.home.top;
    }
    p.grabX = event.clientX + window.scrollX - p.home.left - p.dx;
    p.grabY = event.clientY + window.scrollY - p.home.top - p.dy;
    p.tx = p.dx; p.ty = p.dy; p.vx = p.vy = 0; p.state = 'held'; heldProp = p;
    p.art.dataset.dragState = 'held'; hero.dataset.monsterHeld = 'true';
  }
  function stepProps(dt) {
    for (const p of props) {
      if (p.state === 'idle') continue;
      if (p.state === 'held') {
        const x = mix(p.dx, p.tx, Math.min(1, dt * 26)), y = mix(p.dy, p.ty, Math.min(1, dt * 26));
        p.vx = mix(p.vx, (x - p.dx) / dt, .45); p.vy = mix(p.vy, (y - p.dy) / dt, .45);
        p.dx = x; p.dy = y;
      } else if (p.state === 'falling') {
        p.vy += 1450 * dt; p.dx += p.vx * dt; p.dy += p.vy * dt; p.vx *= Math.exp(-1.5 * dt);
        if (p.dx < p.minX || p.dx > p.maxX) { p.dx = Math.max(p.minX, Math.min(p.maxX, p.dx)); p.vx *= -.4; }
        if (p.dy < p.minY) { p.dy = p.minY; p.vy = Math.abs(p.vy) * .35; }
        if (p.dy >= 0 && p.vy > 0) {
          p.dy = 0; p.vy *= p.kind === 'slime' ? -.58 : -.45; p.bounces++;
          if (Math.abs(p.vy) < 75 || p.bounces >= 3) p.state = 'home';
        }
        if (time - p.released > 2.5) p.state = 'home';
      } else {
        p.dx *= Math.exp(-8 * dt); p.dy *= Math.exp(-8 * dt);
        if (Math.abs(p.dx) + Math.abs(p.dy) < .4) { p.stop(); continue; }
      }
      // The node's SVG scale converts CSS screen pixels to local sprite units.
      const tilt = p.state === 'held' ? Math.max(-8, Math.min(8, p.vx / 80)) : 0;
      p.art.style.transform = `translate(${(p.dx / p.scale).toFixed(2)}px, ${(p.dy / p.scale).toFixed(2)}px) rotate(${tilt.toFixed(1)}deg)`;
      p.button.style.transform = `translate(${p.dx.toFixed(2)}px, ${p.dy.toFixed(2)}px)`;
    }
  }
  function syncProps(active) {
    for (const prop of props) {
      prop.button.hidden = !active || !prop.visible;
      if (!active) prop.stop();
    }
  }

  function draw(t, dt = 1 / 30) {
    ctx.clearRect(0, 0, width, height);
    if (width < 160) return;
    const phase = t % 11.5, gather = smooth((phase - 1.05) / 2.3), release = smooth((phase - 7.35) / 2.2);
    const active = canRun(), sinceBurst = t - burstAt;
    if (active) stepProps(dt);
    influence = mix(influence, active && (pointer || sinceBurst < 2) ? 1 : 0, Math.min(1, dt * 9));
    const hold = gather * (1 - release), x = width / 2, y = height * .42 + Math.sin(t * .9) * 3;
    const cell = radius / 8.5;
    ctx.drawImage(glow, x - radius * 1.9, y - radius * 1.9, radius * 3.8, radius * 3.8);
    for (let band = 0; band < 3; band++) {
      const offset = band * 2.1 + t * (.9 + .5 * (1 - hold));
      const r = radius * (1.22 + band * .12) * (1 + release * .4);
      ctx.lineWidth = 1.2; ctx.strokeStyle = COLORS[band];
      ctx.globalAlpha = (.12 + (1 - hold) * .2) * (1 - influence * .8);
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
      if (p.x === undefined || !active) { p.x = px; p.y = py; p.vx = p.vy = 0; }
      if (active) {
        let tx = px, ty = py;
        if (pressed && pointer) {
          const r = (18 + 45 * Math.exp(-(t - heldSince) * 2.5)) * (.3 + p.seed * .7);
          tx = pointer.x + Math.cos(p.angle + t * 3) * r;
          ty = pointer.y + Math.sin(p.angle + t * 3) * r;
        }
        const spring = pressed ? 48 : sinceBurst < 1.15 ? 2.5 : 15;
        const damping = Math.exp(-(pressed ? 10 : sinceBurst < 1.15 ? 1.6 : 6) * dt);
        p.vx = (p.vx + (tx - p.x) * spring * dt) * damping;
        p.vy = (p.vy + (ty - p.y) * spring * dt) * damping;
        if (pointer && !pressed) {
          const dx = p.x - pointer.x, dy = p.y - pointer.y, d = Math.hypot(dx, dy);
          if (d < 105) {
            const force = (1 - d / 105) * 2200 * dt;
            p.vx += (d > 1 ? dx / d : Math.cos(p.angle)) * force;
            p.vy += (d > 1 ? dy / d : Math.sin(p.angle)) * force;
          }
        }
        p.vx = Math.max(-900, Math.min(900, p.vx)); p.vy = Math.max(-900, Math.min(900, p.vy));
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < 8 || p.x > width - 8) { p.x = Math.max(8, Math.min(width - 8, p.x)); p.vx *= -.5; }
        if (p.y < 8 || p.y > height - 8) { p.y = Math.max(8, Math.min(height - 8, p.y)); p.vy *= -.5; }
      }
      ctx.save();
      const idleAlpha = (.45 + p.seed * .45) * (1 - smooth((phase - 9.1) / 1.4)) * (1 - hold * .25);
      ctx.globalAlpha = mix(idleAlpha, .72 + p.seed * .28, influence);
      ctx.translate(mix(px, p.x, influence), mix(py, p.y, influence)); ctx.rotate(mix(a, 0, convergence) + release * p.seed * 5);
      ctx.drawImage(p.image, -size / 2, -size / 2, size, size); ctx.restore();
    }
    const alpha = smooth((phase - 2.8) / .7) * (1 - smooth((phase - 7.35) / .85)) * (1 - influence);
    if (alpha > 0) {
      const sweep = phase > 4 && phase < 6.2 ? Math.min(9, 1 + Math.floor((phase - 4) / 2.2 * 9)) : 0;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
      ctx.transform(.96 + Math.sin(t * .7) * .035, Math.sin(t * .55) * .025, 0, 1, 0, 0);
      ctx.drawImage(crests[sweep], -radius, -radius, radius * 2, radius * 2); ctx.restore();
    }
    const wave = (phase - 3.35) / 2.15;
    if (wave > 0 && wave < 1) {
      ctx.globalAlpha = (1 - wave) ** 2 * .64 * (1 - influence); ctx.strokeStyle = '#ffe2a1'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, radius * (.75 + wave * 1.9), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (pressed && pointer) {
      const size = 45 + Math.min(1, (t - heldSince) / 1.5) * 35;
      ctx.drawImage(glow, pointer.x - size, pointer.y - size, size * 2, size * 2);
    } else if (sinceBurst >= 0 && sinceBurst < .9) {
      ctx.globalAlpha = (1 - sinceBurst / .9) ** 2 * .65;
      ctx.strokeStyle = '#ffe2a1'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(burstX, burstY, 20 + sinceBurst * 230, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
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
        backingWidth: canvas.width, backingHeight: canvas.height,
        interaction: pressed ? 'gathering' : time - burstAt < 2 ? 'scattering' : pointer ? 'stirring' : 'idle',
        spreadPx: +Math.sqrt(particles.slice(0, count).reduce((sum, p) => sum + ((p.x ?? 0) - (pointer?.x ?? burstX)) ** 2 + ((p.y ?? 0) - (pointer?.y ?? burstY)) ** 2, 0) / count).toFixed(1) });
    }
  }
  function frame(now) {
    frameId = 0;
    if (!canRun()) { sync(); return; }
    const elapsed = previous ? Math.min((now - previous) / 1000, .1) : 0;
    previous = now; time += elapsed;
    const started = performance.now(); draw(time, Math.max(.001, Math.min(elapsed, .05))); const cost = performance.now() - started;
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
    syncProps(canRun());
    hint.hidden = !canRun(); canvas.tabIndex = canRun() ? 0 : -1;
    if (!canRun()) resetToy();
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
    const canvasLeft = left + (free - width) / 2, canvasTop = Math.max(0, (box.height - height) / 2);
    originX = box.left + window.scrollX + canvasLeft; originY = box.top + window.scrollY + canvasTop;
    hint.style.left = `${canvasLeft}px`; hint.style.top = `${canvasTop + height * .85}px`; hint.style.width = `${width}px`;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const dpr = Math.min(devicePixelRatio || 1, constrained || narrow.matches ? 1 : 1.5);
    canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); radius = Math.min(110, width * .29, height * .23);
    resetToy();
    props.forEach(prop => prop.stop()); layoutProps(box, copy);
    sync();
  }
  function requestLayout() { if (!layoutId && !disposed) layoutId = requestAnimationFrame(layout); }
  const resize = new ResizeObserver(requestLayout); resize.observe(hero); resize.observe(card);
  const intersection = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, { threshold: 0 });
  intersection.observe(hero);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync); narrow.addEventListener('change', requestLayout);
  const leave = () => { away = true; resetToy(); syncProps(false); cancel(); cancelAnimationFrame(layoutId); layoutId = 0; };
  const enter = () => { away = false; requestLayout(); };
  window.addEventListener('pagehide', leave); window.addEventListener('pageshow', enter);
  layout();
  return () => {
    disposed = true; cancel(); cancelAnimationFrame(layoutId);
    resize.disconnect(); intersection.disconnect();
    document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync);
    narrow.removeEventListener('change', requestLayout); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', enter);
    resetToy();
    hero.removeEventListener('pointermove', move); hero.removeEventListener('pointerdown', press);
    hero.removeEventListener('pointerleave', exitPointer); canvas.removeEventListener('lostpointercapture', release);
    canvas.removeEventListener('keydown', keyDown); canvas.removeEventListener('keyup', keyUp); canvas.removeEventListener('blur', resetToy);
    window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', resetToy); window.removeEventListener('blur', resetToy);
    window.removeEventListener('keydown', keyboardMode);
    delete hero.dataset.toyInput; delete hero.dataset.monsterHeld;
    props.forEach(prop => prop.dispose());
    propStage?.remove();
    canvas.remove(); hint.remove();
  };
}

if (typeof document !== 'undefined') mountHeroStorm(document.querySelector('.hero'));
