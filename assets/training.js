const data = JSON.parse(document.getElementById('training-data').textContent);
const i18n = JSON.parse(document.getElementById('i18n').textContent);
const form = document.getElementById('tr-form');
const result = document.getElementById('tr-result');
const nf = new Intl.NumberFormat(i18n.lang);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const tooHigh = (spot, lv) => spot.monsters.filter((m) => m.level - lv >= 5).length;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function show(lv) {
  const matches = data.spots
    .map((s) => ({ s, recs: s.recs.filter((r) => lv >= r.min && lv <= r.max) }))
    .filter((m) => m.recs.length)
    // Maps more sources agree on first, then maps with fewer monsters far above the player.
    .sort((a, b) => b.recs.length - a.recs.length || tooHigh(a.s, lv) - tooHigh(b.s, lv) || (b.s.meowdbExpHr || 0) - (a.s.meowdbExpHr || 0));

  if (!matches.length) {
    result.innerHTML = `<p class="empty">${i18n.trNone}</p>`;
    return;
  }
  const top = matches[0].recs.length;
  result.innerHTML = `<h2>${fill(i18n.trResultTitle, { lv })}</h2><div class="spot-list">${matches
    .map(({ s, recs }) => {
      const caution = data.cautions.find((c) => c.map === s.map);
      const mobs = s.monsters
        .map((m) => {
          const d = m.level - lv;
          return `<span class="mob${d >= 5 ? ' hi' : ''}">${esc(m.name)} Lv.${m.level}${d >= 5 ? `<em>${fill(i18n.higher, { d })}</em>` : ''}</span>`;
        })
        .join('');
      return `<article class="spot${recs.length === top && top > 1 ? ' top' : ''}">
<div class="spot-head"><strong>${esc(s.map)}</strong><span class="agree">${fill(i18n.agree, { n: recs.length })}</span></div>
<div class="mobs">${mobs}</div>
<div class="recs">${s.recs.map((r) => `<span class="rec ${r.source}${recs.includes(r) ? '' : ' off'}">${esc(data.sources[r.source].name)} ${r.min}–${r.max}</span>`).join('')}</div>
${s.meowdbExpHr ? `<span class="exp">${i18n.expHr} (NiaMeowDB): ${nf.format(s.meowdbExpHr)}</span>` : ''}
${caution ? `<div class="caution">⚠ ${i18n.caution}: ${esc(caution.text[i18n.lang])}</div>` : ''}
</article>`;
    })
    .join('')}</div>`;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const lv = Math.max(1, Math.min(100, parseInt(form.lv.value, 10) || 1));
  history.replaceState(null, '', `?lv=${lv}`);
  show(lv);
});

const fromUrl = parseInt(new URLSearchParams(location.search).get('lv'), 10);
if (fromUrl) form.lv.value = fromUrl;
show(parseInt(form.lv.value, 10));
