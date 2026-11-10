// Machine-assisted locales (zh, ja, …) are derived from the finished English pages instead of new templates.
// Each English text run is masked (tags → {t0}, numbers → {n0}, game names → {e0}) and looked up in a
// translation memory i18n/<locale>.json keyed by the masked English. Anything missing stays English and is
// listed in i18n/.missing/<locale>.json for scripts/i18n-translate.mjs (or a person) to fill.
import fs from 'node:fs';
import path from 'node:path';

// Inline tags stay inside one translatable run; any other tag ends it.
const INLINE = new Set(['a', 'abbr', 'b', 'br', 'code', 'em', 'i', 'kbd', 'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'wbr']);
const SKIP = new Set(['script', 'style', 'svg', 'textarea', 'template']);
const ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];
// Values under these JSON keys are data, never prose.
const JSON_KEEP = new Set(['lang', 'api', 'itemsUrl', 'glyphsUrl', 'url', 'href', 'id', 'ko', 'basis', 'icon', 'cat', 'sub', 'type', 'kind', 'path', 'mobs', 'items']);

const LETTER = /[A-Za-z]{2}/;
const ws = (s) => s.replace(/\s+/g, ' ');

export function loadLocales(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'locales.json'), 'utf8')).locales;
}

export function loadMemory(root, code) {
  const file = path.join(root, 'i18n', `${code}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

// Longest names first so "Zombie Mushroom" wins over "Mushroom".
export function entityMatcher(names) {
  const htmlName = (n) => n.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  names = names.flatMap((n) => (n ? [n, htmlName(n)] : []));
  const list = [...new Set(names.filter((n) => n && n.length >= 4 && /[A-Za-z]/.test(n)))].sort((a, b) => b.length - a.length);
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return list.length ? new RegExp(`(?<![A-Za-z])(?:${list.map(escRe).join('|')})(?![A-Za-z])`, 'g') : null;
}

export function mask(text, entities) {
  const slots = { t: [], n: [], e: [] };
  const put = (kind, v) => `{${kind}${slots[kind].push(v) - 1}}`;
  let s = text.replace(/<[^>]+>/g, (m) => put('t', m));
  if (entities) s = s.replace(entities, (m) => put('e', m));
  s = s.replace(NUM, (m) => put('n', m));
  return { key: ws(s).trim(), slots };
}

const TOKEN = /\{([tne])(\d+)\}/g;
const tokens = (s) => (s.match(TOKEN) || []).sort().join();

// A translation is only usable when it keeps every placeholder exactly once.
export const validTranslation = (key, value) => typeof value === 'string' && value.trim() && tokens(key) === tokens(value);

function unmask(value, slots) {
  return value.replace(TOKEN, (m, kind, i) => slots[kind][Number(i)] ?? m);
}

// Whether a masked key still has words a reader needs translated (not just names, numbers and tags).
const needsWords = (key) => LETTER.test(key.replace(TOKEN, ''));

function translateText(text, ctx) {
  const lead = text.match(/^\s*/)[0];
  const tail = text.match(/\s*$/)[0];
  // Korean names shown on English pages and the language names themselves are never translated.
  if (/[가-힣]/.test(text) || ctx.keep?.has(text.trim())) return text;
  const { key, slots } = mask(text.trim(), ctx.entities);
  if (!needsWords(key)) return text;
  const hit = ctx.memory[key];
  if (validTranslation(key, hit)) return lead + unmask(hit, slots) + tail;
  ctx.missing.add(key);
  return text;
}

// Split body HTML into runs of text + inline tags, translating each run as a whole sentence.
function translateMarkup(html, ctx) {
  const parts = html.split(/(<!--[\s\S]*?-->|<[^>]+>)/);
  const outParts = [];
  let run = [];
  let skip = null;
  const flush = () => {
    if (!run.length) return;
    // Tags back to back (card titles, chips, table-like spans) are separate labels, not one sentence.
    for (const piece of run.join('').split(/(?<=>)(?=\s*<)/)) translateRun(piece);
    run = [];
  };
  const translateRun = (joined) => {
    // Leading/trailing tags stay outside the sentence so an opening <a> before a block is not split.
    const m = joined.match(/^((?:\s|<[^>]+>)*)([\s\S]*?)((?:\s|<[^>]+>)*)$/);
    const [, pre, mid, post] = m;
    outParts.push(pre + (mid && /[A-Za-z]/.test(mid.replace(/<[^>]+>/g, '')) ? translateText(mid, ctx) : mid) + post);
  };
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('<!--')) { flush(); outParts.push(part); continue; }
    const tag = part.match(/^<\/?([a-zA-Z][\w-]*)/);
    if (skip) {
      outParts.push(part);
      if (tag && part.startsWith('</') && tag[1].toLowerCase() === skip) skip = null;
      continue;
    }
    if (!tag) { run.push(part); continue; }
    const name = tag[1].toLowerCase();
    const translated = translateAttrs(part, ctx);
    // translate="no": proper names with no translation (map names) stay as they are.
    if (/\stranslate="no"/.test(part) && !part.startsWith('</') && !part.endsWith('/>')) {
      flush();
      skip = name;
      outParts.push(part);
      continue;
    }
    if (SKIP.has(name) && !part.startsWith('</')) {
      flush();
      if (name === 'script') {
        skip = name;
        outParts.push(translated);
        continue;
      }
      skip = part.endsWith('/>') ? null : name;
      outParts.push(translated);
      continue;
    }
    if (INLINE.has(name)) run.push(translated);
    else { flush(); outParts.push(translated); }
  }
  flush();
  return outParts.join('');
}

function translateAttrs(tag, ctx) {
  return tag
    .replace(new RegExp(`\\s(${ATTRS.join('|')})="([^"]*)"`, 'g'), (m, attr, v) => (LETTER.test(v) ? ` ${attr}="${translateText(v, ctx)}"` : m))
    // UI copy handed to scripts as a JSON attribute (home live market).
    .replace(/\sdata-text="([^"]*)"/, (m, v) => {
      const data = JSON.parse(v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      return ` data-text="${JSON.stringify(translateJson(data, ctx)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`;
    });
}

function translateJson(value, ctx, key = '', onlyEn = false) {
  if (typeof value === 'string') {
    if (JSON_KEEP.has(key) || (onlyEn && key !== 'en') || !/\s|[A-Z]/.test(value) || !LETTER.test(value) || /^(https?:)?\//.test(value)) return value;
    return translateText(value, ctx);
  }
  if (Array.isArray(value)) return value.map((v) => translateJson(v, ctx, key, onlyEn));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, JSON_KEEP.has(k) ? v : translateJson(v, ctx, k, onlyEn)]));
  return value;
}

// JSON-LD: only human-facing fields.
const LD_FIELDS = new Set(['name', 'description', 'headline', 'text']);
function translateLd(value, ctx, key = '') {
  if (typeof value === 'string') return LD_FIELDS.has(key) && LETTER.test(value) ? translateText(value, ctx) : value;
  if (Array.isArray(value)) return value.map((v) => translateLd(v, ctx, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, translateLd(v, ctx, k)]));
  return value;
}

const jsonText = (data) => JSON.stringify(data).replace(/</g, '\\u003c');
// Blobs that are pure data (item tables, admin config) are never translated.
const JSON_SKIP = new Set(['admin-config', 'scroll-data']);

/**
 * Turn a finished English page into `loc`.
 * ctx: { memory, missing:Set, keep:Set, entities, baseUrl, basePath, clientSrc }
 */
export function localizePage(html, loc, ctx) {
  const from = `${ctx.basePath}/en/`;
  const to = `${ctx.basePath}/${loc.code}/`;
  // Paths: every same-site /en/ link except the language links themselves (they carry hreflang).
  let s = html.replace(/<[^>]+>/g, (tag) => (/\shreflang=/.test(tag) ? tag : tag.replaceAll(`"${from}`, `"${to}`).replaceAll(`"${ctx.baseUrl}${from}`, `"${ctx.baseUrl}${to}`)));
  s = s
    .replace(/<html lang="en">/, `<html lang="${loc.hreflang}">`)
    .replace(/<meta property="og:locale" content="[^"]*">/, `<meta property="og:locale" content="${loc.og}">`)
    .replace(/(<a class="lang-opt"[^>]*)( aria-current="true")/g, '$1')
    .replace(new RegExp(`(<a class="lang-opt"[^>]*data-lang="${loc.code}")`), '$1 aria-current="true"')
    .replace(/(<summary class="lang-current"[^>]*>)[^<]*/, `$1${loc.name}`);
  const [headPart, ...rest] = s.split('</head>');
  let headOut = headPart
    .replace(/<title>([^<]*)<\/title>/, (m, v) => `<title>${translateText(v, ctx)}</title>`)
    .replace(/(<meta (?:name="description"|property="og:title"|property="og:description") content=")([^"]*)(">)/g, (m, a, v, b) => a + translateText(v, ctx) + b)
    .replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (m, a, v, b) => {
      const data = JSON.parse(v);
      const fixed = JSON.parse(JSON.stringify(data).replaceAll(`${ctx.baseUrl}${from}`, `${ctx.baseUrl}${to}`));
      if (fixed.inLanguage) fixed.inLanguage = loc.hreflang;
      return a + jsonText(translateLd(fixed, ctx)) + b;
    });
  // The browser-side dictionary must load before any deferred script or module calls tx().
  if (ctx.clientSrc) headOut = headOut.replace('<script>window.tx=', `<script src="${ctx.clientSrc}"></script>\n<script>window.tx=`);
  let body = rest.join('</head>');
  body = body.replace(/(<script id="([^"]+)" type="application\/json">)([\s\S]*?)(<\/script>)/g, (m, a, id, v, b) =>
    JSON_SKIP.has(id) ? m : a + jsonText(translateJson(JSON.parse(v.replaceAll(`"${from}`, `"${to}`)), ctx, '', id === 'training-data')) + b
  );
  body = body.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (m, a, v, b) => a + jsonText(translateLd(JSON.parse(v.replaceAll(`${ctx.baseUrl}${from}`, `${ctx.baseUrl}${to}`)), ctx)) + b);
  return `${headOut}</head>${translateMarkup(body, ctx)}`;
}

// Numbers inside a runtime string are masked the same way in the browser (see TX_RUNTIME) and here.
export const NUM = /(?<![{A-Za-z#\d])\d(?:[\d,.]*\d)?/g;
const maskNumbers = (s) => {
  let i = 0;
  return s.replace(NUM, () => `{n${i++}}`);
};

// Read one JS string literal starting at src[i] (quote char). Template ${…} parts become a number slot.
function readLiteral(src, i) {
  const q = src[i];
  if (!`'"\``.includes(q)) return null;
  let out = '';
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') { out += src[j + 1]; j++; continue; }
    if (c === q) return { text: out, end: j + 1 };
    if (q === '`' && c === '$' && src[j + 1] === '{') {
      let depth = 1;
      j += 2;
      for (; j < src.length && depth; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        else if (`'"\``.includes(src[j])) j = (readLiteral(src, j)?.end ?? j + 1) - 1;
      }
      j--;
      out += '0';
      continue;
    }
    out += c;
  }
  return null;
}

// Strings the browser renders itself: the first argument of tx(…) and the English (second) argument of tr(ko, en)
// in assets/*.js. Collected statically, so a new UI string is picked up by the next build.
export function clientKeys(root) {
  const keys = new Set();
  for (const f of fs.readdirSync(path.join(root, 'assets')).filter((n) => n.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(root, 'assets', f), 'utf8');
    for (const m of src.matchAll(/\b(tx|tr)\(\s*/g)) {
      let lit = readLiteral(src, m.index + m[0].length);
      if (!lit) continue;
      if (m[1] === 'tr') {
        const rest = src.slice(lit.end).match(/^\s*,\s*/);
        if (!rest) continue;
        lit = readLiteral(src, lit.end + rest[0].length);
        if (!lit) continue;
      }
      if (/[A-Za-z]{2}/.test(lit.text)) keys.add(maskNumbers(lit.text.replace(/\s+/g, ' ').trim()));
    }
  }
  return [...keys].sort();
}

// Defined inline in every page's <head>, before any module runs. window.I18N comes from /assets/i18n/<code>.js.
export const TX_RUNTIME = `window.tx=function(s,v){var d=window.I18N||{},r=d[s];if(r==null){var n=[],k=String(s).replace(/\\s+/g,' ').trim().replace(${NUM.toString()},function(m){return'{n'+(n.push(m)-1)+'}'});r=d[k];r=r==null?s:r.replace(/\\{n(\\d+)\\}/g,function(m,i){return n[i]})}return v?r.replace(/\\{(\\w+)\\}/g,function(m,k){return k in v?v[k]:m}):r}`;
