(() => {
  const localPause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const key = r => JSON.stringify([r.item, r.price, r.seller, r.channel, r.room]);
  const failure = (code, message) => Object.assign(new Error(message), { code });
  // "1.49M" → 1490000, "40.6K" → 40600, "9,999" → 9999; "+6%" / "−11%" → 6 / -11; blanks → null.
  const amount = text => { const m = /^([\d.,]+)\s*([KMB])?$/i.exec((text || '').trim()); if (!m) return null;
    const n = Number(m[1].replace(/,/g, '')) * ({ K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1); return Number.isFinite(n) ? Math.round(n) : null; };
  const percent = text => { const m = /^([+\-\u2212]?)([\d.]+)%$/.exec((text || '').trim()); return m ? Number(m[2]) * (m[1] && m[1] !== '+' ? -1 : 1) : null; };
  // Every list row whose name matches our catalogue: the typical price, its 24-hour and 7-day change and the sales count.
  function readSummary(selector) {
    const out = [];
    for (const tr of document.querySelectorAll(selector)) {
      const item = Number((tr.getAttribute('data-id') || '').split(':')[1]);
      const name = tr.querySelector('.item-select')?.getAttribute('title');
      const cell = col => tr.querySelector(`td[data-col="${col}"]`)?.textContent.trim();
      const typical = amount(cell('price'));
      if (!item || GmsBatchCatalog[item] !== name || !typical) continue;
      const sales = amount(cell('sales'));
      out.push({ item, typical, day: percent(cell('day')), week: percent((cell('trend') || '').split(/\s+/).pop()), sales });
    }
    return out;
  }
  async function collect(options, progress = async () => {}, cancelled = () => false, pause = localPause) {
    const maxRows = options.mode === 'test' ? 40 : Math.min(150, Math.max(1, Number(options.maxRows) || 150));
    const maxShops = options.mode === 'test' ? 40 : Math.min(600, Number(options.maxShops) || 360);
    const maxItems = options.mode === 'test' ? 2 : Math.min(60, Number(options.maxItems) || 12);
    const perItem = Math.min(50, Number(options.shopsPerItem) || 20);
    const report = { version: '0.6.0', runId: options.runId, world: 'Windia', startedAt: new Date().toISOString(),
      status: 'running', rows: [], shops: 0, rejected: {}, queue: [], skippedItems: [], aiCalls: 0 };
    const rows = new Map();
    const openModal = () => { const el = document.querySelector('#sv-modal'); return el && !el.closest('[hidden]') ? el : null; };
    const button = name => openModal()?.querySelector(`button[aria-label="${name}"]`);
    function guard() {
      if (cancelled()) throw failure('CANCELLED', '사용자 중지');
      if (/just a moment|verify you are human|access denied/i.test(document.title)) throw failure('ACCESS_REQUIRED', '접근 확인 필요');
      if (Date.now() - Date.parse(report.startedAt) > 12 * 60000) throw failure('RUN_TIMEOUT', '12분 수집 제한 초과');
    }
    async function until(read, phase) {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) { guard(); const value = read(); if (value) return value; await pause(250); }
      guard(); throw failure('LOAD_TIMEOUT', `화면 구조 또는 로딩 확인 필요: ${phase}`);
    }
    try {
      guard();
      if (openModal()) throw new Error('전용 탭의 상점 상세가 이미 열려 있습니다.');
      await until(() => document.querySelector('tr[data-id] .item-select'), '아이템 목록');
      // The collector tab keeps meso.watch's own filters between runs (a search word, a class, a category tab), which once
      // left it cycling through the same 8 of 1,500 items. Reset them so every run draws from the full list.
      const search = document.querySelector('#search');
      if (search && search.value) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); await pause(800); }
      const cls = document.querySelector('#class-filter');
      if (cls && cls.value !== 'All') { cls.value = 'All'; cls.dispatchEvent(new Event('change', { bubbles: true })); await pause(800); }
      const allTab = [...document.querySelectorAll('#market button.tab')].find(b => /^ALL/i.test(b.textContent.trim()));
      if (allTab && allTab.getAttribute('aria-pressed') === 'false') { allTab.click(); await pause(800); }
      // The list draws 60 rows and adds 60 more each time its own box is scrolled to the end, but only while the window is
      // actually painted: a collector window hidden behind others never loads more. So, when the server is due a summary
      // (every few hours), the extension brings this window forward for the scroll and hands focus back right after.
      if (options.summaryDue && options.focus) {
        const wrap = document.querySelector('#rows')?.closest('.table-wrap');
        await options.focus(true);
        try {
          for (let i = 0, idle = 0, before = 0; wrap && i < 120 && idle < 6; i++) {
            wrap.scrollTop = wrap.scrollHeight; await pause(400); guard();
            const now = document.querySelectorAll('#rows tr[data-id]').length;
            idle = now === before ? idle + 1 : 0; before = now;
          }
        } finally { await options.focus(false); }
        if (wrap) wrap.scrollTop = 0;
        report.summary = readSummary('#rows tr[data-id]');
      }
      const listRows = document.querySelectorAll('#rows tr[data-id]').length ? '#rows tr[data-id]' : 'tr[data-id]';
      const shown = [...document.querySelectorAll(listRows)].map(tr => ({ id: tr.getAttribute('data-id'), name: tr.querySelector('.item-select')?.getAttribute('title') || tr.querySelector('.item-select')?.textContent.trim() }))
        .filter(x => GmsBatchCatalog[Number(x.id.split(':')[1])] === x.name);
      // Rotate through every traded item from the last full list read (passed in by the extension), not just the rows on
      // screen; an item off screen is brought up with the site's own search box.
      const prefix = (shown[0]?.id || 'basil:').split(':')[0];
      const all = (options.itemIds || []).filter(id => GmsBatchCatalog[id])
        .map(id => ({ id: `${prefix}:${String(id).padStart(8, '0')}`, name: GmsBatchCatalog[id] }));
      if (all.length < 2) all.splice(0, all.length, ...shown);
      if (all.length < 2) throw new Error('검증 가능한 아이템 목록 부족');
      report.listSize = all.length;
      // Rotate the starting item to avoid permanently ignoring the lower half of the visible catalogue.
      const offset = options.mode === 'test' ? 0 : (options.cursor || 0) % all.length;
      const queue = [...all.slice(offset), ...all.slice(0, offset)].slice(0, maxItems);
      for (const item of queue) {
        // Stop opening new items well before the 12-minute limit, so a long run still uploads what it read.
        if (Date.now() - Date.parse(report.startedAt) > 9.5 * 60000) break;
        guard(); report.queue.push(item);
        await progress({ shops: report.shops, rows: rows.size, item: item.name });
        let tr = [...document.querySelectorAll('tr[data-id]')].find(tr => tr.getAttribute('data-id') === item.id);
        if (!tr && search) {
          search.value = item.name; search.dispatchEvent(new Event('input', { bubbles: true }));
          try { tr = await until(() => [...document.querySelectorAll('tr[data-id]')].find(tr => tr.getAttribute('data-id') === item.id), `${item.name} 검색`); }
          catch (e) { if (e.code !== 'LOAD_TIMEOUT') throw e; }
        }
        if (!tr) { report.skippedItems.push({ ...item, reason: 'NOT_LISTED' }); continue; }
        let newest;
        for (let attempt = 0; attempt < 2; attempt++) {
          tr.querySelector('.item-select').click();
          try {
            // The heading can appear before asynchronous shop controls.
            newest = await until(() => document.querySelector('#detail-body h2')?.textContent.trim() === item.name &&
              [...document.querySelectorAll('#detail button')].find(b => b.textContent.trim() === 'Newest'), `${item.name} 상점 목록`);
            break;
          } catch (e) {
            if (e.code !== 'LOAD_TIMEOUT') throw e;
            if (attempt === 1) report.skippedItems.push({ ...item, reason: e.code });
          }
        }
        // Only skip before opening a shop; every accepted row still passes full validation.
        if (!newest) continue;
        newest.click(); await pause(500);
        const first = document.querySelector('#detail-body .buy-row[data-sv] [data-sv-btn]');
        if (!first) { report.rejected.no_shops = (report.rejected.no_shops || 0) + 1; continue; }
        first.click();
        for (let n = 1; n <= perItem; n++) {
          await until(() => {
            const modal = openModal(), step = modal?.querySelector('.sv-count')?.textContent;
            return step?.startsWith(`Shop ${n} of `) && step.endsWith(`selling ${item.name}`) && modal.querySelector('.sv-tag');
          }, `${item.name} 상점 ${n}`);
          await pause(options.mode === 'test' ? 400 : 1000); guard();
          const shop = GmsBatchReader.readShop(document), checked = GmsBatchReader.validate(shop, GmsBatchCatalog);
          report.shops++;
          if (checked.ok) {
            const old = rows.get(key(checked.row));
            if (!old || checked.row.seen > old.seen) rows.set(key(checked.row), checked.row);
          } else report.rejected[checked.reason] = (report.rejected[checked.reason] || 0) + 1;
          if (n % 5 === 0) await progress({ shops: report.shops, rows: rows.size, item: item.name });
          const step = /^Shop (\d+) of (\d+)/.exec(shop.step);
          if (rows.size >= maxRows || report.shops >= maxShops || !step || +step[1] >= +step[2] || n === perItem) break;
          const next = button('Next shop'); if (!next || next.disabled) break; next.click();
        }
        button('Close')?.click(); await until(() => !openModal(), '상점 상세 닫기');
        if (rows.size >= maxRows || report.shops >= maxShops) break;
      }
      if (search?.value) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
      report.rows = [...rows.values()]; report.nextCursor = (offset + report.queue.length) % all.length;
      if (!report.rows.length) throw failure('NO_VALID_ROWS', '검증 통과 매물 없음');
      report.status = 'completed';
    } catch (e) {
      report.status = cancelled() ? 'cancelled' : 'failed'; report.error = e.message; report.errorCode = e.code || 'UNEXPECTED';
      report.rows = [];
      button('Close')?.click(); // Failed/partial runs are never uploaded.
    }
    report.finishedAt = new Date().toISOString(); return report;
  }
  globalThis.GmsCollector = { collect };
})();
