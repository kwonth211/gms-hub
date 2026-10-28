const input = document.getElementById('site-search');
const main = document.querySelector('.dir-main');
const favSection = document.getElementById('favorites');
const favCards = document.getElementById('fav-cards');
const favToc = document.getElementById('fav-toc');
const empty = document.getElementById('no-results');
const originals = [...document.querySelectorAll('[data-cat] .site-card')];
const FAV_KEY = 'gmshub_favs';
const filterBar = document.getElementById('filter-bar');
let activeCat = null;

// Favorites live only in this browser; storage can be unavailable (private mode), so fail soft.
function loadFavs() {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}
function saveFavs(list) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(list));
  } catch (e) {}
}
let favs = loadFavs();

function syncButtons() {
  document.querySelectorAll('.fav').forEach((btn) => {
    const on = favs.includes(btn.dataset.url);
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '★' : '☆';
    btn.title = on ? main.dataset.favRemove : main.dataset.favAdd;
  });
}

function renderFavs() {
  favCards.innerHTML = '';
  // Keep the order the user starred them in.
  favs.forEach((url) => {
    const card = originals.find((c) => c.dataset.url === url);
    if (card) favCards.appendChild(card.cloneNode(true));
  });
  const n = favCards.children.length;
  favSection.hidden = n === 0;
  favToc.hidden = n === 0;
  document.getElementById('fav-count').textContent = n;
  document.getElementById('fav-count-2').textContent = n;
  syncButtons();
  filter();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.fav');
  if (!btn) return;
  const url = btn.dataset.url;
  favs = favs.includes(url) ? favs.filter((u) => u !== url) : [...favs, url];
  saveFavs(favs);
  renderFavs();
});

function filter() {
  const q = input.value.trim().toLowerCase();
  document.querySelectorAll('.site-card').forEach((c) => (c.hidden = q !== '' && !c.dataset.search.includes(q)));
  let any = false;
  document.querySelectorAll('[data-cat]').forEach((cat) => {
    const visible = (!activeCat || cat.id === activeCat) && [...cat.querySelectorAll('.site-card')].some((c) => !c.hidden);
    cat.hidden = !visible;
    any ||= visible;
  });
  // Favorites stay out of the way while a single category is selected.
  if (favCards.children.length) favSection.hidden = !!activeCat || ![...favCards.children].some((c) => !c.hidden);
  empty.hidden = any;
}

function setCategory(id) {
  activeCat = activeCat === id ? null : id;
  document.querySelectorAll('.purpose').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === activeCat)));
  document.querySelectorAll('.toc a[href^="#"]').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${activeCat}`));
  filterBar.hidden = !activeCat;
  if (activeCat) {
    const name = document.getElementById(activeCat).dataset.name;
    document.getElementById('filter-label').textContent = main.dataset.filtering.replace('{name}', name);
  }
  filter();
  if (activeCat) document.querySelector('.directory').scrollIntoView({ behavior: 'smooth' });
}

document.querySelectorAll('.purpose').forEach((b) => b.addEventListener('click', () => setCategory(b.dataset.filter)));
document.getElementById('filter-clear').addEventListener('click', () => setCategory(activeCat));

input.addEventListener('input', filter);
const q = new URLSearchParams(location.search).get('q');
if (q) input.value = q;
renderFavs();
if (q) document.querySelector('.directory').scrollIntoView();
