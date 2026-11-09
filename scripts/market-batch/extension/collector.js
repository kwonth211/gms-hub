(() => {
  const localPause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const key = r => JSON.stringify([r.item, r.price, r.seller, r.channel, r.room]);
  const failure = (code, message) => Object.assign(new Error(message), { code });
  async function collect(options, progress = async () => {}, cancelled = () => false, pause = localPause) {
    const report = { version: '0.2.3', runId: options.runId, world: 'Windia', startedAt: new Date().toISOString(),
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
      const all = [...document.querySelectorAll('tr[data-id]')].map(tr => ({ id: tr.getAttribute('data-id'), name: tr.querySelector('.item-select')?.getAttribute('title') || tr.querySelector('.item-select')?.textContent.trim() }))
        .filter(x => GmsBatchCatalog[Number(x.id.split(':')[1])] === x.name);
      if (all.length < 2) throw new Error('검증 가능한 아이템 목록 부족');
      // Rotate the starting item to avoid permanently ignoring the lower half of the visible catalogue.
      const offset = options.mode === 'test' ? 0 : (options.cursor || 0) % all.length;
      const queue = [...all.slice(offset), ...all.slice(0, offset)].slice(0, options.mode === 'test' ? 2 : 60);
      for (const item of queue) {
        guard(); report.queue.push(item);
        await progress({ shops: report.shops, rows: rows.size, item: item.name });
        const tr = [...document.querySelectorAll('tr[data-id]')].find(tr => tr.getAttribute('data-id') === item.id);
        if (!tr) throw new Error('아이템 목록 변경');
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
        for (let n = 1; n <= 20; n++) {
          await until(() => {
            const modal = openModal(), step = modal?.querySelector('.sv-count')?.textContent;
            return step?.startsWith(`Shop ${n} of `) && step.endsWith(`selling ${item.name}`) && modal.querySelector('.sv-tag');
          }, `${item.name} 상점 ${n}`);
          await pause(400); guard();
          const shop = GmsBatchReader.readShop(document), checked = GmsBatchReader.validate(shop, GmsBatchCatalog);
          report.shops++;
          if (checked.ok) {
            const old = rows.get(key(checked.row));
            if (!old || checked.row.seen > old.seen) rows.set(key(checked.row), checked.row);
          } else report.rejected[checked.reason] = (report.rejected[checked.reason] || 0) + 1;
          if (n % 5 === 0) await progress({ shops: report.shops, rows: rows.size, item: item.name });
          const step = /^Shop (\d+) of (\d+)/.exec(shop.step);
          if (rows.size >= 500 || report.shops >= 800 || !step || +step[1] >= +step[2] || n === 20) break;
          const next = button('Next shop'); if (!next || next.disabled) break; next.click();
        }
        button('Close')?.click(); await until(() => !openModal(), '상점 상세 닫기');
        if (rows.size >= 500 || report.shops >= 800) break;
      }
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
