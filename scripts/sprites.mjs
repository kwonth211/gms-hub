// Original pixel-art sprites drawn for GMS Hub. Each row is a string; '.' is transparent.
const PALETTES = {
  mushroom: { o: '#ff8a1f', O: '#d9620b', w: '#fff3e0', s: '#f5deb3', S: '#d7b98a', k: '#2b1d14' },
  slime: { g: '#1f6b2a', G: '#5cc46a', l: '#c8f2cf', k: '#14301a', m: '#1f6b2a' },
  scroll: { b: '#6d4c2f', P: '#e8c98f', p: '#fbeccc', k: '#8a6a45' },
  coin: { y: '#9c6b00', Y: '#ffcf3f', h: '#fff1b3' },
  clock: { k: '#33404d', w: '#eef2f6', r: '#ff5a4f' },
  hammer: { k: '#2b333b', G: '#9fb2bf', H: '#d4dee5', b: '#8d6040' },
  book: { k: '#1c2340', R: '#4f7cff', w: '#eef2ff', l: '#9fb4ff' },
  chat: { k: '#1c2340', w: '#f2f4ff', B: '#5865f2' },
  crown: { k: '#5a3d00', Y: '#ffcf3f', R: '#ff4f6d' },
  megaphone: { k: '#2a2f3a', R: '#ff6b4a', Y: '#ffe08a' },
  sword: { k: '#22303b', w: '#dfe9f1', Y: '#ffcf3f', b: '#8d6040' },
  bag: { k: '#3b2a1f', b: '#b0805a', Y: '#ffcf3f' },
  tree: { k: '#123d22', G: '#2f9e4f', g: '#5cc46a', b: '#6d4c2f' }
};

const GRIDS = {
  mushroom: [
    '.....oooooo.....',
    '...oooooooooo...',
    '..oowwoooooooo..',
    '.oowwwooooowwoo.',
    '.ooowooooooowwo.',
    'oooooooooooooooo',
    'oooooooooooooooo',
    '.OOOOOOOOOOOOOO.',
    '...ssssssssss...',
    '...sskssssksss..',
    '...sskssssksss..',
    '...ssssssssss...',
    '....sSssssSs....',
    '.....ssssss.....'
  ],
  slime: [
    '.......gg.......',
    '......gGGg......',
    '.....gGGGGg.....',
    '....gGGGGGGg....',
    '...gGlGGGGGGg...',
    '..gGllGGGGGGGg..',
    '..gGGGkGGGkGGg..',
    '.gGGGGkGGGkGGGg.',
    '.gGGGGGGGGGGGGg.',
    '.gGGGGGmmGGGGGg.',
    '.gGGGGGGGGGGGGg.',
    '..gggggggggggg..'
  ],
  scroll: [
    '..bbbbbbbbbbbb..',
    '.bPPPPPPPPPPPPb.',
    '.bPbbbbbbbbbbPb.',
    '..bpppppppppb...',
    '..bpkkkkkkkpb...',
    '..bpppppppppb...',
    '..bpkkkkkpppb...',
    '..bpppppppppb...',
    '..bpkkkkkkkpb...',
    '..bpppppppppb...',
    '.bPbbbbbbbbbbPb.',
    '.bPPPPPPPPPPPPb.',
    '..bbbbbbbbbbbb..'
  ],
  coin: [
    '.....yyyyyy.....',
    '...yyYYYYYYyy...',
    '..yYhYYYYYYYYy..',
    '.yYhYyyyyyYYYYy.',
    '.yYYyYYYYYYYYYy.',
    'yYYYyYYYYYYYYYYy',
    'yYYYYyyyyyYYYYYy',
    'yYYYYYYYYYyYYYYy',
    'yYYYYYYYYYyYYYYy',
    '.yYYyyyyyyYYYYy.',
    '.yYYYYYYYYYYYYy.',
    '..yYYYYYYYYYYy..',
    '...yyYYYYYYyy...',
    '.....yyyyyy.....'
  ],
  clock: [
    '.....kkkkkk.....',
    '...kkwwwwwwkk...',
    '..kwwwwrwwwwwk..',
    '.kwwwwwrwwwwwwk.',
    '.kwwwwwrwwwwwwk.',
    'kwwwwwwrwwwwwwwk',
    'kwwwwwwkkkkkwwwk',
    'kwwwwwwwwwwwwwwk',
    'kwwwwwwwwwwwwwwk',
    '.kwwwwwwwwwwwwk.',
    '.kwwwwwwwwwwwwk.',
    '..kwwwwwwwwwwk..',
    '...kkwwwwwwkk...',
    '.....kkkkkk.....'
  ],
  hammer: [
    '.kkkkkkkkkk.....',
    'kHHHHHHHHHGk....',
    'kHGGGGGGGGGk....',
    'kGGGGGGGGGGk....',
    '.kkkkbbkkkk.....',
    '.....bb.........',
    '.....bb.........',
    '.....bb.........',
    '.....bb.........',
    '.....bb.........',
    '....kbbk........',
    '....kkkk........'
  ],
  book: [
    '.kkkkkkkkkkkk...',
    '.kRRRRRRRRRRkk..',
    '.kRwwwwwwwwRklk.',
    '.kRwkkkkkkwRklk.',
    '.kRwwwwwwwwRklk.',
    '.kRwkkkkwwwRklk.',
    '.kRwwwwwwwwRklk.',
    '.kRRRRRRRRRRklk.',
    '.kkkkkkkkkkkklk.',
    '..klllllllllllk.',
    '...kkkkkkkkkkkk.'
  ],
  chat: [
    '..kkkkkkkkkkkk..',
    '.kwwwwwwwwwwwwk.',
    'kwwwwwwwwwwwwwwk',
    'kwwBBwwBBwwBBwwk',
    'kwwBBwwBBwwBBwwk',
    'kwwwwwwwwwwwwwwk',
    '.kwwwwwwwwwwwwk.',
    '..kkkwkkkkkkkk..',
    '....kwk.........',
    '....kk..........'
  ],
  crown: [
    'k......k......k.',
    'kYk...kYk...kYk.',
    'kYYk.kYYYk.kYYk.',
    'kYYYkYYYYYkYYYk.',
    'kYYYYYYRYYYYYYk.',
    'kYYYYYRRRYYYYYk.',
    'kYYYYYYRYYYYYYk.',
    'kkkkkkkkkkkkkkk.'
  ],
  megaphone: [
    '...........kk...',
    '.........kkYk...',
    '.......kkYYYk...',
    '.kkkkkkYYYYYk...',
    '.kRRRRkYYYYYk.k.',
    '.kRRRRkYYYYYkk..',
    '.kRRRRkYYYYYk.k.',
    '.kkkkkkYYYYYk...',
    '...kk..kkYYYk...',
    '...kk....kkYk...',
    '...kk......kk...'
  ],
  sword: [
    '.............kk',
    '............kwk',
    '...........kwwk',
    '..........kwwk.',
    '.........kwwk..',
    '........kwwk...',
    '...kk..kwwk....',
    '...kYkkwwk.....',
    '....kYYwk......',
    '.....kYYk......',
    '....kkkYYk.....',
    '...kbbk.kYk....',
    '..kbbk...kk....',
    '..kbk..........',
    '..kk...........'
  ],
  bag: [
    '.....kkkk.....',
    '....kbbbbk....',
    '.....kbbk.....',
    '....kkkkkk....',
    '...kbbbbbbk...',
    '..kbbYYYbbbk..',
    '.kbbYbbbbbbbk.',
    '.kbbbYYbbbbbk.',
    '.kbbbbbYbbbbk.',
    '.kbbYYYbbbbbk.',
    '..kbbbbbbbbk..',
    '...kkkkkkkk...'
  ],
  tree: [
    '......kkkk......',
    '....kkggggkk....',
    '...kgggGGgggk...',
    '..kggGGGGGGggk..',
    '.kgGGGGGGGGGGgk.',
    '.kGGGGGGGGGGGGk.',
    'kGGGGGGGGGGGGGGk',
    'kGGGGGGGGGGGGGGk',
    '.kGGGGGGGGGGGGk.',
    '..kkkGGGGGGkkk..',
    '.....kkbbkk.....',
    '......kbbk......',
    '......kbbk......',
    '.....kbbbbk.....'
  ]
};

// Returns <g> content of 1x1 rects plus the sprite's width and height.
export function spriteRects(name) {
  const grid = GRIDS[name];
  const pal = PALETTES[name];
  const w = Math.max(...grid.map((r) => r.length));
  let rects = '';
  grid.forEach((row, y) => {
    // Merge horizontal runs of the same color to keep the SVG small.
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === c) run++;
      if (c !== '.' && pal[c]) rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${pal[c]}"/>`;
      x += run;
    }
  });
  return { rects, w, h: grid.length };
}

export function spriteSvg(name, size = 32, extra = '') {
  const { rects, w, h } = spriteRects(name);
  const side = Math.max(w, h);
  return `<svg class="sprite" ${extra} width="${size}" height="${size}" viewBox="${-(side - w) / 2} ${-(side - h) / 2} ${side} ${side}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

// Pixel landscape for the home hero, built from the sprites above.
export function heroScene() {
  const place = (name, x, y, scale, cls = '') => {
    const { rects } = spriteRects(name);
    return `<g class="${cls}" transform="translate(${x} ${y}) scale(${scale})">${rects}</g>`;
  };
  const cloud = (x, y, s) =>
    `<g transform="translate(${x} ${y}) scale(${s})" fill="#ffffff" opacity=".85"><rect x="2" y="0" width="6" height="1"/><rect x="1" y="1" width="10" height="1"/><rect x="0" y="2" width="14" height="2"/><rect x="1" y="4" width="12" height="1"/></g>`;
  return `<svg class="hero-scene" viewBox="0 0 320 120" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges" aria-hidden="true">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b6fd1"/><stop offset=".7" stop-color="#8fc3ff"/><stop offset="1" stop-color="#c9e6ff"/></linearGradient></defs>
<rect width="320" height="120" fill="url(#sky)"/>
${cloud(20, 12, 2)}${cloud(150, 6, 1.5)}${cloud(250, 18, 2.2)}${cloud(95, 30, 1)}
<path d="M0 86 L30 70 L60 80 L95 62 L130 78 L170 60 L210 76 L250 64 L290 74 L320 66 L320 120 L0 120Z" fill="#4c8f5a"/>
<path d="M0 96 L40 86 L80 94 L120 84 L160 92 L200 82 L240 92 L280 86 L320 92 L320 120 L0 120Z" fill="#3a7a47"/>
${place('tree', 8, 66, 2)}${place('tree', 276, 62, 2.4)}${place('tree', 236, 74, 1.6)}
<rect y="104" width="320" height="16" fill="#8a5a33"/><rect y="104" width="320" height="3" fill="#5cc46a"/>
${place('mushroom', 150, 88, 1.15, 'bob')}${place('slime', 186, 92, 1, 'bob2')}${place('mushroom', 214, 90, 1, 'bob3')}${place('slime', 120, 93, 0.9, 'bob3')}
${place('coin', 172, 70, 0.7, 'float')}${place('coin', 200, 66, 0.6, 'float2')}
</svg>`;
}
