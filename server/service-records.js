// Public service records (/soldier/<name>): a player's record from the game's public profile (greatwar PublicProfile,
// GET /profile/<uuid>), looked up by Minecraft name. Until the game's profile address is set (PROFILE_URL), a sample
// record built from the name, under a banner. Never money, node values or coordinates.
const crypto = require('crypto');
const { javaAccount } = require('./minecraft');
const NATIONS = require('./nations').NATIONS;
const companion = require('./companion');
const { GAME_IDS } = require('./nation-roles');

const LIVE = process.env.PROFILE_URL ? process.env.PROFILE_URL.replace(/\/$/, '') : null;
const RANKS = ['Private', 'Corporal', 'Sergeant', 'Lieutenant', 'Captain'];
// A medal shows its icon only when the art exists (gallantry has none yet), never a broken image.
const fs = require('fs'), path = require('path');
const hasIcon = id => fs.existsSync(path.join(__dirname, '..', 'public', 'img', 'career', 'medal_' + id + '.png'));
// Progress.MEDALS: id -> name, and what each is for
const MEDALS = [
  ['first_in', 'First In', 'First into a captured node'],
  ['held_outnumbered', 'Held the Line', 'Held a node while outnumbered'],
  ['ten_kills', 'Ten in One Battle', 'Ten kills in one war window'],
  ['longest_survivor', 'Longest Survivor', 'The longest-lived soldier of a nation'],
  ['gallantry', 'Gallantry Medal', 'Awarded by the nation\'s Leader, with a citation'],
  ['mentor', 'Mentor\'s Ribbon', 'Brought a new soldier up to Corporal'],
  ['old_sweat', 'Old Sweat\'s Ribbon', 'The best caller of a season\'s front-line wager'],
];
const GALLANTRY_NAMES = ['Military Cross', 'Croix de Guerre', 'Cross of St. George', 'Medal for Military Valour', 'Iron Cross', 'Bravery Medal', 'War Medal', 'Order of Bravery'];
const medalOf = nameOrId => MEDALS.find(m => m[0] === nameOrId || m[1] === nameOrId) || (GALLANTRY_NAMES.includes(nameOrId) ? ['gallantry', nameOrId, MEDALS.find(m => m[0] === 'gallantry')[2]] : null);
const dashed = u => u.replace(/-/g, '').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

const cache = new Map();
async function live(uuid) {
  const hit = cache.get(uuid);
  if (hit && Date.now() - hit.at < 60 * 1000) return hit.body;
  const r = await fetch(`${LIVE}/profile/${dashed(uuid)}`, { signal: AbortSignal.timeout(5000) });
  const body = r.status === 404 ? null : r.ok ? await r.json() : Promise.reject(new Error('profile ' + r.status));
  cache.set(uuid, { at: Date.now(), body });
  return body;
}

// a believable record, the same every time for the same name
function sample(name) {
  const h = crypto.createHash('sha256').update(name.toLowerCase()).digest();
  const n = NATIONS[h[0] % NATIONS.length], rank = Math.min(4, h[1] % 6), alive = h[2] % 5 !== 0;
  const medals = MEDALS.filter((m, i) => (h[3] >> i) & 1 && rank >= i).map(m => m[1]);
  return { sample: true, name, nation: n.id, nationName: n.name.replace(/^The /, ''), alive, rank: alive ? RANKS[rank] : null,
    class: alive ? ['Rifleman', 'Marksman', 'Assault', 'Machine Gunner', 'Medic'][h[4] % 5] : null,
    specialisation: alive && h[5] % 2 ? ['Miner', 'Farmer', 'Builder'][h[6] % 3] : null,
    medals, kills: h[7] % 40, captures: h[8] % 6, daysSurvived: 1 + h[9] % 12 };
}

// the record for a Minecraft name: { account, record } or null when the name isn't a Java account
async function lookup(name) {
  const acc = await javaAccount(name);
  if (!acc) return null;
  const uuid = acc.uuid.replace(/-/g, '').toLowerCase();
  // S-own-12: the game's career export when the web API is set (deaths, medal ids, regiment); else the profile address; else a sample
  let record;
  if (companion.isLive()) {
    try {
      record = await companion.publicGet(`/api/public/records/${dashed(uuid)}`);
    } catch (e) {
      if (!/ 404$/.test(e.message)) throw e;
      record = null; // no record yet
    }
    if (record && Array.isArray(record.medalIds)) record = Object.assign({}, record, { medals: record.medalIds });
  } else {
    record = LIVE ? await live(uuid) : sample(acc.name);
  }
  if (record) {
    const nid = GAME_IDS[record.nation] || record.nation;
    const n = NATIONS.find(x => x.id === nid);
    record = Object.assign({}, record, {
      nationPage: n ? n.slug : null, flag: n ? n.flag : null, nationName: record.nationName || (n ? n.name.replace(/^The /, '') : null),
      rankIcon: record.rank && RANKS.includes(record.rank) ? 'rank_' + record.rank.toLowerCase() : null,
      medalList: (record.medals || []).map(x => medalOf(x)).filter(Boolean).map(([id, title, why]) => ({ id, title, why, icon: hasIcon(id) })),
    });
  }
  return { account: { name: acc.name, uuid }, record };
}

/** S-own-12: soldiers whose name starts with q, from the game's export (empty until the web API is set). */
async function search(q) {
  if (!companion.isLive() || !q) return [];
  try { const r = await companion.publicGet(`/api/public/records?q=${encodeURIComponent(q.slice(0, 16))}&limit=20`); return (r && r.players) || []; }
  catch (e) { return []; }
}

module.exports = { lookup, search, isLive: () => !!LIVE || companion.isLive(), MEDALS, RANKS };
