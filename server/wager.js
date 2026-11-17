// The front-line wager (S52): the fallen call who holds each contested node when a war window closes; the season's table
// and the last window's results from the game's GET /api/public/wager (nobody's calls, no positions). Until the web API is
// live, a sample under a banner.
const companion = require('./companion');
const NATIONS = require('./nations').NATIONS;
const { GAME_IDS } = require('./nation-roles');

let cache = null;
const NAMES = ['Tommy_1914', 'Poilu42', 'Fritz_W', 'Ivan_K', 'Hans_M', 'Marco_R', 'Ahmet_B', 'Georgi_D', 'Jules_P', 'Otto_S'];
const NODES = ['Verdun', 'Ypres', 'Lille', 'Arras', 'Mons'];

function sample() {
  const ids = ['british_empire', 'france', 'germany', 'russia', 'austria_hungary', 'italy', 'ottoman_empire', 'bulgaria'];
  return { sample: true, season: 1, locked: false, nodes: 7,
    table: NAMES.map((name, i) => ({ name, nation: ids[i % ids.length], points: 23 - i * 2 - (i % 3), rounds: 6 - (i % 3), right: 9 - i })),
    last: NODES.map((node, i) => ({ node, before: ids[i % 4], after: i === 1 ? ids[2] : ids[i % 4] })) };
}

async function board() {
  if (!companion.isLive()) return sample();
  if (cache && Date.now() - cache.at < 60 * 1000) return cache.body;
  let body;
  try {
    body = await companion.publicGet('/api/public/wager');
  } catch (e) {
    body = { season: 1, table: [], last: [], nodes: 0 }; // a game build without the wager yet: an empty table, not an error page
  }
  cache = { at: Date.now(), body };
  return body;
}

const nation = id => {
  const nid = GAME_IDS[id] || id, n = NATIONS.find(x => x.id === nid);
  return { id: nid, name: n ? n.name.replace(/^The /, '') : (id || 'Nobody'), flag: n ? n.flag : null, slug: n ? n.slug : null };
};

async function view() {
  let b = await board();
  // S82: the board changes when a window closes (the last window's results): it shows 10 minutes later (server/hold.js)
  if (!b.sample) b = await require('./hold').holdValue('wager', b, { season: b.season || 1, table: [], last: [], nodes: 0 });
  return { sample: !!b.sample, season: b.season || 1, locked: !!b.locked, nodes: b.nodes || 0,
    table: (b.table || []).map(t => ({ ...t, nation: nation(t.nation) })),
    last: (b.last || []).map(l => ({ node: l.node, before: nation(l.before), after: nation(l.after), held: l.before === l.after })) };
}

module.exports = { view };
