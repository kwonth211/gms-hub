const i18n = JSON.parse(document.getElementById('i18n').textContent);
const form = document.getElementById('tr-form');
const result = document.getElementById('tr-result');
const brackets = [...document.querySelectorAll('.bracket')];
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

function show(level) {
  result.innerHTML = '';
  const idx = brackets.findIndex((b) => level >= +b.dataset.min && level <= +b.dataset.max);
  if (idx === -1) {
    result.innerHTML = `<p class="warn">${i18n.trNone}</p>`;
    return;
  }
  const add = (b, title) => {
    const box = document.createElement('div');
    box.className = 'highlight';
    box.innerHTML = `<h3>${title}</h3>`;
    box.appendChild(b.querySelector('.table-wrap').cloneNode(true));
    result.appendChild(box);
  };
  const cur = brackets[idx];
  add(cur, fill(i18n.trBracket, { min: cur.dataset.min, max: cur.dataset.max }));
  const next = brackets[idx + 1];
  if (next) add(next, fill(i18n.trNext, { min: next.dataset.min, max: next.dataset.max }));
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
