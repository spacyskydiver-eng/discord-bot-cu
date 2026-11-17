// Public service records (/soldier/<name>): a player's record from the game's public profile (greatwar PublicProfile,
// GET /profile/<uuid>), looked up by Minecraft name. Until the game's profile address is set (PROFILE_URL), a sample
// record built from the name, under a banner. Never money, node values or coordinates.
const crypto = require('crypto');
const { javaAccount } = require('./minecraft');
const NATIONS = require('./nations').NATIONS;
const companion = require('./companion');
const { GAME_IDS } = require('./nation-roles');

// read when needed, not at load: the address may be filled from site settings at start (server/game-conn.js)
const liveBase = () => process.env.PROFILE_URL ? process.env.PROFILE_URL.replace(/\/$/, '') : null;
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
  const r = await fetch(`${liveBase()}/profile/${dashed(uuid)}`, { signal: AbortSignal.timeout(5000) });
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
// Deaths go public on the same 10-minute hold as the maps and the War Report (head's ruling, 17 Nov): a soldier who died
// in the last 10 minutes still shows as they were. The game's diedAt (ms) is used when the record has it; otherwise the
// time this site first saw them dead. The last view of each soldier taken while alive is kept to show meanwhile.
const HOLD_MS = 10 * 60 * 1000;
const lastAlive = new Map(), firstSeenDead = new Map();
function holdDeath(uuid, record) {
  if (!record || record.sample) return record;
  const now = Date.now();
  if (record.alive !== false) {
    lastAlive.set(uuid, { at: now, record });
    firstSeenDead.delete(uuid);
    return record;
  }
  if (!firstSeenDead.has(uuid)) firstSeenDead.set(uuid, now);
  const died = typeof record.diedAt === 'number' ? record.diedAt : firstSeenDead.get(uuid);
  if (now - died >= HOLD_MS) return record;
  const prev = lastAlive.get(uuid);
  // without an earlier view, show the record as alive with what can't have changed (name, nation, medals so far)
  return prev ? prev.record : Object.assign({}, record, { alive: true, deaths: Math.max(0, (record.deaths || 0) - 1) });
}

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
    record = holdDeath(uuid, record);
  } else {
    record = liveBase() ? await live(uuid) : sample(acc.name);
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
  try { const r = await companion.publicGet(`/api/public/records?q=${encodeURIComponent(q.slice(0, 16))}&limit=20`); return ((r && r.players) || []).map(p => ({ name: p.name, uuid: p.uuid, nation: p.nation })); } // no rank: the game sends none for the dead, which would show a death at once
  catch (e) { return []; }
}

module.exports = { lookup, search, isLive: () => !!liveBase() || companion.isLive(), MEDALS, RANKS };
