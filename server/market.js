// The market board (S45): every open player stall by nation, the node it stands in, what it sells and for how much. From
// the game's GET /api/public/market (never coordinates); until the web API is live, a sample under a banner.
const companion = require('./companion');
const NATIONS = require('./nations').NATIONS;
const { GAME_IDS } = require('./nation-roles');

let cache = null, failed = null;
const SAMPLE_GOODS = [['Bread', 3], ['Oak Planks', 1], ['Sandbag', 4], ['Iron Ingot', 9], ['Cooked Beef', 4], ['Webley Revolver', 160], ['.455 Rounds', 20], ['Coal', 2]];
const SAMPLE_NODES = ['Verdun', 'Ypres', 'Lille', 'Arras', 'Liège', 'Namur', 'Mons', 'Reims'];
const SELLERS = ['Tommy_1914', 'Poilu42', 'Fritz_W', 'Ivan_K', 'Hans_M', 'Marco_R', 'Ahmet_B', 'Georgi_D'];

function sample() {
  return { sample: true, nations: NATIONS.slice(0, 6).map((n, i) => ({ nation: n.id, stalls: [0, 1].slice(0, i % 2 + 1).map(j => ({
    seller: SELLERS[(i + j) % SELLERS.length], node: SAMPLE_NODES[(i * 2 + j) % SAMPLE_NODES.length],
    lots: SAMPLE_GOODS.filter((g, k) => (k + i + j) % 3 === 0).map(([name, price], k) => ({ name, price, stock: (k * 7 + i * 3) % 40 + 1 })) })) })) };
}

async function board() {
  if (!companion.isLive()) return sample();
  if (cache && Date.now() - cache.at < 60 * 1000) return cache.body;
  if (failed && Date.now() - failed.at < 15 * 1000) throw failed.error; // S82: a failure is remembered 15 seconds
  let body;
  try { body = await companion.publicGet('/api/public/market'); } catch (e) { failed = { at: Date.now(), error: e }; throw e; }
  cache = { at: Date.now(), body };
  return body;
}

/** The board for the page: site nations (flag, name, slug), sellers and lots. */
async function view() {
  const b = await board();
  const nations = (b.nations || []).map(n => {
    const nid = GAME_IDS[n.nation] || n.nation, nat = NATIONS.find(x => x.id === nid);
    return { id: nid, name: nat ? nat.name.replace(/^The /, '') : n.nation, flag: nat ? nat.flag : null, slug: nat ? nat.slug : null,
      stalls: (n.stalls || []).filter(s => (s.lots || []).length) };
  }).filter(n => n.stalls.length);
  return { sample: !!b.sample, nations, lots: nations.reduce((t, n) => t + n.stalls.reduce((u, s) => u + s.lots.length, 0), 0) };
}

module.exports = { view };
