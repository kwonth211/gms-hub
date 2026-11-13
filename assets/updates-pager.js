// Update news pages (home #updates): show one page of the list at a time; the full list stays in the HTML.
{
  const list = document.querySelector('.upd-list[data-per-page]');
  const pager = document.querySelector('.upd-pager');
  if (list && pager) {
    const items = [...list.children];
    const total = Math.max(...items.map((li) => Number(li.dataset.updPage)));
    let page = 1;
    const show = (p, focus) => {
      page = Math.min(total, Math.max(1, p));
      for (const li of items) li.hidden = Number(li.dataset.updPage) !== page;
      for (const b of pager.querySelectorAll('[data-upd-page]')) b.toggleAttribute('aria-current', Number(b.dataset.updPage) === page);
      pager.querySelector('.upd-prev').disabled = page === 1;
      pager.querySelector('.upd-next').disabled = page === total;
      if (focus) list.closest('section')?.scrollIntoView({ block: 'nearest' });
    };
    pager.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      show(b.dataset.updPage ? Number(b.dataset.updPage) : page + Number(b.dataset.updStep), true);
    });
    pager.hidden = false;
    show(1);
  }
}
