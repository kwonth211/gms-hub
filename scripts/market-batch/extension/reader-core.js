(function (root) {
  const get = (node, selector) => node.querySelector(selector)?.textContent.trim() || '';
  function readShop(doc, capturedAt = new Date().toISOString()) {
    const modal = doc.querySelector('#sv-modal');
    if (!modal || modal.closest('[hidden]')) throw new Error('상점 상세가 열려 있지 않습니다.');
    return {
      capturedAt, world: get(doc, '#world'), step: get(modal, '.sv-count'),
      seller: get(modal, '.sv-tag'), channel: get(modal, '.sv-ch'), room: get(modal, '.sv-fm'),
      items: [...modal.querySelectorAll('.sv-item')].map(e => ({
        classes: e.className, name: get(e, 'b'), icon: e.querySelector('img')?.getAttribute('src'), line: get(e, 'small')
      })),
      listingRows: [...doc.querySelectorAll('.buy-row[data-sv]')].map(e => ({
        index: e.getAttribute('data-sv'), title: e.getAttribute('title'),
        seller: e.querySelector('[data-sv-btn]')?.getAttribute('aria-label')?.replace(/^View shop: /, ''),
        channel: get(e, '.ch-chip'), room: get(e, '.buy-where'), status: get(e, '.visually-hidden'),
        price: e.querySelector('.meso')?.getAttribute('title')
      }))
    };
  }
  function validate(shop, catalog) {
    const check = (condition, reason) => { if (!condition) throw new Error(reason); };
    try {
      check(shop.world === 'Windia', 'world');
      const step = /^Shop (\d+) of (\d+) selling (.+)$/.exec(shop.step);
      check(step, 'shop_step');
      const matches = shop.listingRows.filter(x => x.index === String(Number(step[1]) - 1));
      check(matches.length === 1, 'listing_index');
      const listing = matches[0];
      check(listing.seller === shop.seller, 'seller_changed');
      check(/^[A-Za-z0-9]{2,13}$/.test(shop.seller), 'seller');
      check(listing.status === 'Likely still up', 'not_currently_listed');
      const ch = /^CH (\d+)$/.exec(shop.channel), fm = /^FM(\d+)$/.exec(shop.room);
      check(ch && fm, 'location');
      check(listing.channel === shop.channel && listing.room === shop.room, 'location_changed');
      check(+ch[1] >= 1 && +ch[1] <= 40 && +fm[1] >= 1 && +fm[1] <= 40, 'location_range');
      const targets = shop.items.filter(x => x.classes.split(/\s+/).includes('sv-here'));
      check(targets.length === 1, 'target_quantity');
      const target = targets[0], icon = /^data\/icons\/(\d+)\.png$/.exec(target.icon || '');
      check(icon && catalog[Number(icon[1])] === target.name && target.name === step[3], 'catalog');
      const priceMatch = /^1 for ([\d,]+)$/.exec(target.line);
      check(priceMatch, 'quantity_or_set_price');
      const price = Number(priceMatch[1].replaceAll(',', ''));
      check(Number.isSafeInteger(price) && price >= 1 && price <= 10_000_000_000, 'price');
      check(listing.price === `${price.toLocaleString('en-US')} mesos`, 'price_changed');
      const stamp = /(\d+)월 (\d+)일 (오전|오후) (\d+):(\d+)/.exec(listing.title || '');
      check(stamp, 'absolute_time');
      const captured = new Date(shop.capturedAt), kst = new Date(+captured + 9 * 3600000);
      const month = Number(stamp[1]), day = Number(stamp[2]), hour = Number(stamp[4]), minute = Number(stamp[5]);
      check(month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour >= 1 && hour <= 12 && minute <= 59, 'time_range');
      // A periodic run crossing New Year can still see listings from December 31.
      const year = kst.getUTCFullYear() - (kst.getUTCMonth() === 0 && month === 12 ? 1 : 0);
      const seen = new Date(Date.UTC(year, month - 1, day, hour % 12 + (stamp[3] === '오후' ? 12 : 0) - 9, minute));
      check(Number.isFinite(+captured) && +seen <= +captured && +captured - +seen <= 3 * 3600000, 'stale_or_future');
      return { ok: true, row: { item: Number(icon[1]), price, qty: 1, sold: false, seller: shop.seller,
        channel: +ch[1], room: +fm[1], seen: seen.toISOString().replace('T', ' ').slice(0, 19) } };
    } catch (error) { return { ok: false, reason: error.message }; }
  }
  const api = { readShop, validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GmsBatchReader = api;
})(globalThis);
