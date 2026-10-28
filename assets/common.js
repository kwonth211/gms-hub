// Remember the language a visitor picks so the root page sends them back to it.
document.querySelectorAll('[data-lang]').forEach((a) => {
  a.addEventListener('click', () => {
    try {
      localStorage.setItem('cb_lang', a.dataset.lang);
    } catch (e) {}
  });
});
