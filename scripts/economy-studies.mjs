// Dated editorial calculations: keep the inputs frozen, and publish aggregate tables only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { median, latestListings } from './work-gloves-study.mjs';

export function priceSummary(rows) {
  const list = latestListings(rows);
  return { listings: list.length, sellers: new Set(list.map(r => r.shop)).size,
    low: list.length ? Math.min(...list.map(r => r.price)) : null, median: median(list.map(r => r.price)) };
}
export function recovery(spec, maxMP, missingMP) {
  return Math.min(Math.max(0, missingMP), Math.floor(spec.mp ?? maxMP * spec.mpR / 100));
}
export function costPer1000(price, restored) { return restored > 0 ? price * 1000 / restored : null; }
export function breakEvenMP(price, spec, bluePrice, blueMP) {
  for (let mp = 1; mp <= 100000; mp++) {
    const restored = recovery(spec, mp, mp);
    if (restored > 0 && price / restored <= bluePrice / blueMP) return mp;
  }
  return null;
}
export function saleBands(rows, edges) {
  const unique = latestListings(rows);
  return edges.map((lo, i) => {
    const hi = edges[i + 1] ?? null;
    const list = unique.filter(r => r.price >= lo && (hi === null || r.price < hi));
    const sold = list.filter(r => r.sold).length;
    return { lo, hi, listings: list.length, sold, share: list.length ? sold / list.length : null };
  });
}
export function studies(input) {
  const get = id => input.items.find(x => x.id === id);
  const common = { date: input.date, capturedFrom: input.items.map(x => x.asOf).sort()[0], capturedTo: input.items.map(x => x.asOf).sort().at(-1) };
  const stars = [2070001, 2070002, 2070009, 2070003, 2070010, 2070004, 2070005].map(id => {
    const item = get(id), client = item.client;
    const attack = Number(client.description.en.match(/Weapon Attack \+(\d+)/)[1]);
    return { id, name: client.name, attack, baseCapacity: client.stats.slotMax, ...priceSummary(item.open) };
  });
  const star = id => stars.find(x => x.id === id);
  const upgrades = [[2070001,2070002],[2070002,2070003],[2070003,2070004],[2070004,2070005]].map(([from,to]) => ({ from, to, attackGain: star(to).attack-star(from).attack,
    oneSetDifference: star(to).median-star(from).median, fiveSetsDifference: 5*(star(to).median-star(from).median) }));
  const budgets = [[2070003,5],[2070004,2],[2070004,5],[2070005,1]].map(([id,sets]) => ({id,sets,cost:star(id).median*sets,baseCapacity:star(id).baseCapacity*sets}));
  const potions = [2000003,2000004,2000006,2000005].map(id => ({ id, name:get(id).client.name, spec:get(id).client.consumeSpec, ...priceSummary(get(id).open) }));
  const blue = potions[0];
  const mpCosts = [1500,2500,4000,6000].map(maxMP => ({ maxMP, potions:potions.map(p => ({id:p.id,restored:recovery(p.spec,maxMP,maxMP),costPer1000:costPer1000(p.median,recovery(p.spec,maxMP,maxMP))})) }));
  const thresholds = potions.slice(1).map(p=>({id:p.id,maxMP:breakEvenMP(p.median,p.spec,blue.median,blue.spec.mp)}));
  const partial = potions.map(p=>({id:p.id,restored:recovery(p.spec,4000,500),costPer1000:costPer1000(p.median,recovery(p.spec,4000,500))}));
  const scroll=get(2040801), hist=latestListings(scroll.history), open=latestListings(scroll.open);
  const ranks=[1550000,1600000,1700000,1800000,1900000,2000000].map(price=>({price,cheaper:open.filter(r=>r.price<price).length,samePrice:open.filter(r=>r.price===price).length}));
  return {
    stars:{...common,stars,upgrades,budgets,mixedBasket:{tobi:1,kumbi:4,cost:star(2070004).median+4*star(2070003).median,baseCapacity:star(2070004).baseCapacity+4*star(2070003).baseCapacity}},
    potions:{...common,potions,mpCosts,thresholds,partial},
    selling:{...common,item:2040801,open:priceSummary(open),historyListings:hist.length,markedSold:hist.filter(r=>r.sold).length,bands:saleBands(hist,[0,1600000,1800000,2000000]),ranks}
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = new URL('../',import.meta.url);
  const result=studies(JSON.parse(fs.readFileSync(new URL('data/editorial/economy-2026-11-28.json',root))));
  for(const [key,report] of Object.entries(result)) {
    fs.writeFileSync(new URL(`assets/research/${key}-2026-11-28.json`,root),JSON.stringify(report,null,2)+'\n');
    const rows = key==='selling' ? [['lower_inclusive','upper_exclusive','listings','marked_sold','share'],...report.bands.map(r=>[r.lo,r.hi,r.listings,r.sold,r.share])]
      : [['item_id','open_listings','sellers','lowest_mesos','median_mesos'],...report[key].map(r=>[r.id,r.listings,r.sellers,r.low,r.median])];
    fs.writeFileSync(new URL(`assets/research/${key}-2026-11-28.csv`,root),rows.map(r=>r.join(',')).join('\n')+'\n');
  }
  console.log(JSON.stringify(result,null,2));
}
