const input = document.getElementById('site-search');
const cards = [...document.querySelectorAll('.site-card')];
const cats = [...document.querySelectorAll('[data-cat]')];
const empty = document.getElementById('no-results');

input?.addEventListener('input', () => {
  const q = input.value.trim().toLowerCase();
  cards.forEach((c) => (c.hidden = q !== '' && !c.dataset.search.includes(q)));
  let any = false;
  cats.forEach((cat) => {
    const visible = [...cat.querySelectorAll('.site-card')].some((c) => !c.hidden);
    cat.hidden = !visible;
    any ||= visible;
  });
  empty.hidden = any;
});
