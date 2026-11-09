const data = JSON.parse(document.getElementById('training-data').textContent);
const i18n = JSON.parse(document.getElementById('i18n').textContent);
const form = document.getElementById('tr-form');
const result = document.getElementById('tr-result');
const nf = new Intl.NumberFormat(i18n.lang);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const tooHigh = (spot, lv) => spot.monsters.filter((m) => m.level - lv >= 5).length;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ko = i18n.lang === 'ko';
const spotName = (s) => (ko && s.ko ? `${esc(s.ko)} <small class="en-name">${esc(s.map)}</small>` : esc(s.map));
const mobName = (m) => esc(ko && m.ko ? m.ko : m.name);
// Weaknesses (client code 3) and undead decide which maps suit a mage's element or a cleric's Heal.
const mobTags = (m) =>
  [...(m.el || '').matchAll(/([FILSH])3/g)].map(([, e]) => `<i class="mob-tag weak">${i18n.weak[e]} ${i18n.weakWord}</i>`).join('') +
  (m.undead ? `<i class="mob-tag undead">${i18n.undead}</i>` : '');
// Players click the source and monster chips on a spot, so they lead somewhere: the source's own article (MS-Classic splits
// its guide by level band) and the hits-to-kill calculator for that monster.
const sourceUrl = (r) => {
  const src = data.sources[r.source];
  return (src.urls || []).find((u) => {
    const [a, b] = (u.match(/level-(\d+)-(\d+)/) || []).slice(1).map(Number);
    return a <= r.min && r.min < b;
  }) || src.url;
};

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
          return `<a class="mob${d >= 5 ? ' hi' : ''}" href="${i18n.damageUrl}?mob=${encodeURIComponent(m.name)}" title="${esc(i18n.mobTitle)}">${mobName(m)} Lv.${m.level}${mobTags(m)}${d >= 5 ? `<em>${fill(i18n.higher, { d })}</em>` : ''}</a>`;
        })
        .join('');
      return `<article class="spot${recs.length === top && top > 1 ? ' top' : ''}">
<div class="spot-head"><strong>${spotName(s)}</strong><span class="agree">${fill(i18n.agree, { n: recs.length })}</span></div>
<div class="mobs">${mobs}</div>
<div class="recs">${s.recs.map((r) => `<a class="rec ${r.source}${recs.includes(r) ? '' : ' off'}" href="${esc(sourceUrl(r))}" target="_blank" rel="noopener" title="${esc(i18n.srcTitle)}">${esc(data.sources[r.source].name)} ${r.min}–${r.max}</a>`).join('')}</div>
${s.meowdbExpHr ? `<span class="exp">${i18n.expHr} (NiaMeowDB): ${nf.format(s.meowdbExpHr)}</span>` : ''}
${caution ? `<div class="caution">⚠ ${i18n.caution}: ${esc(caution.text[i18n.lang])}</div>` : ''}
</article>`;
    })
    .join('')}</div>`;
}

result.addEventListener('click', (e) => {
  const a = e.target.closest('a.rec, a.mob');
  if (a) track(a.classList.contains('rec') ? 'training_source' : 'training_mob', { level: parseInt(form.lv.value, 10) });
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const lv = Math.max(1, Math.min(100, parseInt(form.lv.value, 10) || 1));
  history.replaceState(null, '', `?lv=${lv}`);
  show(lv);
  track('training_search', { level: lv });
});

const fromUrl = parseInt(new URLSearchParams(location.search).get('lv'), 10);
if (fromUrl) form.lv.value = fromUrl;
show(parseInt(form.lv.value, 10));
