// The 10-minute rule (S81 review, S82): no free intel during a war window. Everything the site shows from the live game
// that a battle can change (captures and the owners and counts they move, capitals, wipes, battle results, the Daily
// Front, soldiers' records, night cards, the wager and the rallies) is shown only once it is 10 minutes old. This module
// is the only place that rule lives: every page, the Discord poster and the War Office go through it.
//
// Two kinds of hold:
// - things the game dates (events' `at`, the report's `now`): compared on the game's own clock;
// - things the game sends without a time (articles, editions, battles, results, records): "first seen" by the site,
//   shown 10 minutes after that. First-seen times are kept in the site database (hold_seen, hold_versions), so a restart
//   doesn't release everything at once; anything the site hasn't seen before a restart counts as seen now (held).
// Records and other values that change in place are kept as versions: the page shows the newest version the site first
// saw at least 10 minutes ago (what was true 10 minutes ago), or nothing yet.
const crypto = require('crypto');

const HOLD_MS = 10 * 60 * 1000;
const HOLD_KINDS = new Set(['capture', 'capital_lost', 'capital_retaken', 'wiped']);

// ---------------------------------------------------------------- clocks
let clock = () => Date.now();
let gameOffset = 0; // the game's clock minus the site's, learned from the report's `now` when it's fetched
const gameNow = () => clock() + gameOffset;
function noteGameClock(gameMs) { if (typeof gameMs === 'number' && isFinite(gameMs)) gameOffset = gameMs - clock(); }

const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);
const isTime = v => typeof v === 'number' && isFinite(v);

// ---------------------------------------------------------------- persistence (the site database; swappable for tests)
// Every query has 2 seconds (the pool has no timeout of its own); a slow or down database fails closed: what isn't
// known counts as seen now, so it is held.
const QUERY_MS = 2000;
function timed(p) {
  let t;
  return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error('hold store timed out')), QUERY_MS); })]).finally(() => clearTimeout(t));
}
/** The store on a database (`db` with query(), default the site's pool); `prefix` names the tables (tests use their own). */
function makePgStore({ db = null, prefix = '' } = {}) {
  const q = (sql, params) => timed((db || require('../db')).query(sql, params));
  const SEEN = prefix + 'hold_seen', VERS = prefix + 'hold_versions';
  return {
    async init() {
      await q(`CREATE TABLE IF NOT EXISTS ${SEEN} (key TEXT PRIMARY KEY, first_seen BIGINT NOT NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS ${VERS} (name TEXT NOT NULL, first_seen BIGINT NOT NULL, hash TEXT NOT NULL, value JSONB,
        PRIMARY KEY (name, first_seen))`);
      await q(`DELETE FROM ${SEEN} WHERE first_seen < $1`, [clock() - 30 * 86400 * 1000]);
      return (await q(`SELECT key, first_seen FROM ${SEEN}`)).rows.map(r => [r.key, Number(r.first_seen)]);
    },
    async saveSeen(key, at) { await q(`INSERT INTO ${SEEN} (key, first_seen) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`, [key, at]); },
    async loadVersions(name) {
      return (await q(`SELECT first_seen, hash, value FROM ${VERS} WHERE name = $1 ORDER BY first_seen`, [name])).rows
        .map(r => ({ first: Number(r.first_seen), hash: r.hash, value: r.value }));
    },
    async saveVersion(name, v) { await q(`INSERT INTO ${VERS} (name, first_seen, hash, value) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [name, v.first, v.hash, JSON.stringify(v.value)]); },
    async dropVersions(name, before) { await q(`DELETE FROM ${VERS} WHERE name = $1 AND first_seen < $2`, [name, before]); },
  };
}
let store = makePgStore();
let seen = new Map(), versions = new Map(), ready = null, retryAt = 0;
// Loaded once; a failure is retried a minute later (meanwhile everything new counts as seen now, i.e. held). Times read
// later from the database win over the "now" given meanwhile: they are when the site really first saw those things.
function init() {
  if (!ready || (retryAt && clock() >= retryAt)) {
    retryAt = 0;
    ready = (async () => {
      try { for (const [k, at] of await store.init()) { const m = seen.get(k); seen.set(k, m == null ? at : Math.min(m, at)); } }
      catch (e) { retryAt = clock() + 60 * 1000; console.error('[hold] first-seen store not loaded (retrying in a minute); everything new counts as seen now:', e.message); }
    })();
  }
  return ready;
}
const quiet = p => Promise.resolve(p).catch(e => console.error('[hold] store', e.message));

/** When the site first saw this key (now, if never). */
async function firstSeen(key) {
  await init();
  let at = seen.get(key);
  if (at == null) { at = clock(); seen.set(key, at); quiet(store.saveSeen(key, at)); }
  return at;
}
/** True once the site first saw this key at least 10 minutes ago. */
async function released(key) { return clock() - await firstSeen(key) >= HOLD_MS; }

/** Record this value as the latest version of `name` and return the newest version first seen at least 10 minutes
 *  ago ({ value, first }), or null when there is none yet. */
async function heldVersion(name, value) {
  await init();
  let list = versions.get(name);
  if (!list) {
    list = await store.loadVersions(name).catch(e => { console.error('[hold] versions', e.message); return []; });
    if (versions.has(name)) list = versions.get(name); // another request loaded it meanwhile
    versions.set(name, list);
  }
  const now = clock(), h = hash(value), last = list[list.length - 1];
  if (!last || last.hash !== h) { const v = { first: now, hash: h, value }; list.push(v); quiet(store.saveVersion(name, v)); }
  let pick = -1;
  for (let i = 0; i < list.length; i++) if (now - list[i].first >= HOLD_MS) pick = i;
  if (pick > 0) { const before = list[pick].first; list.splice(0, pick); quiet(store.dropVersions(name, before)); pick = 0; }
  return pick < 0 ? null : { value: list[pick].value, first: list[pick].first };
}

// ---------------------------------------------------------------- the war schedule (for windows the game doesn't date)
let windowsOf = () => { const ev = require('./cue-events')().find(e => e.windows); return ev ? ev.windows : []; };
/** A scheduled war window is open now, or closed less than 10 minutes ago. */
function windowHot(now = clock()) {
  return windowsOf().some(w => now >= w.start * 1000 && now < w.end * 1000 + HOLD_MS);
}

// ---------------------------------------------------------------- undated events
// The game dates every event; should one come without a time, the site works out which undated events are new since it
// last looked. The feed lists newest first and drops what is older than 7 days, so the new list is some new events, then
// the start of the old list. The site keeps the undated events it saw ({ k: what it says, id, first: first seen }) and
// lines the new list up with the old: what doesn't line up is new (first seen now). When more than one line-up fits
// (repeats of the same capture), it takes the one that counts the most as new, so a drop-off can never release a new event.
let undated = null; // { list: [{ k, id, first }], sig: the nations' counts when last seen }
function align(oldKeys, newKeys, sameCounts) {
  const fits = [];
  for (let n = 0; n < newKeys.length; n++) {
    const rest = newKeys.length - n;
    if (rest > oldKeys.length) continue;
    let same = true;
    for (let i = 0; i < rest && same; i++) same = newKeys[n + i] === oldKeys[i];
    if (same) fits.push(n);
  }
  if (!fits.length) return newKeys.length; // nothing lines up: all new
  // the very same list as before, and the nations' counts unchanged: nothing new. (Repeats can make a list that gained
  // and lost events look the same; the counts, which move with every capture, tell those apart.)
  if (fits[0] === 0 && newKeys.length === oldKeys.length && sameCounts) return 0;
  return fits[fits.length - 1];
}
async function undatedEntries(list, sig) {
  await init();
  if (!undated) {
    const rows = await store.loadVersions('state:undated').catch(e => { console.error('[hold] undated events', e.message); return []; });
    const v = rows.length ? rows[rows.length - 1].value : null;
    if (!undated) undated = v && Array.isArray(v.list) ? v : { list: [], sig: null };
  }
  const keys = list.map(e => ['ev', e.kind, e.node, e.from, e.to, e.a, e.b].join(':'));
  const old = undated.list, n = align(old.map(x => x.k), keys, undated.sig === sig), now = clock();
  const next = { list: keys.map((k, i) => i < n ? { k, id: 'u:' + now + ':' + i + ':' + crypto.randomBytes(3).toString('hex'), first: now } : old[i - n]), sig };
  if (hash(next) !== hash(undated)) {
    undated = next;
    quiet(store.saveVersion('state:undated', { first: now, hash: hash(next), value: next }).then(() => store.dropVersions('state:undated', now)));
  }
  return next.list;
}

// which hold key an event has (dated: what it says and when; undated: the id the site gave it), for the Discord poster
const eventKeys = new WeakMap();
const eventKey = e => eventKeys.get(e) || ['d', e.kind, e.at, e.node, e.from, e.to, e.a, e.b].join(':');

// ---------------------------------------------------------------- the War Report
/** The report as it was 10 minutes ago, as far as anyone can tell: held events removed, the owners, counts, capitals and
 *  wipes they changed put back; events with no time count as first seen by the site; battles and after-action reports
 *  only 10 minutes after the site first saw them (so a window's results wait until at least 10 minutes after it closed). */
async function holdReport(report) {
  if (!report || report.sample) return report;
  const now = isTime(report.now) ? report.now : gameNow(), cutoff = now - HOLD_MS;
  const r = Object.assign({}, report), events = Array.isArray(report.events) ? report.events : [];
  const held = new Set(), list = [];
  for (const e of events) {
    if (!e || !HOLD_KINDS.has(e.kind)) continue;
    if (isTime(e.at)) { eventKeys.set(e, eventKey(e)); if (e.at > cutoff) held.add(e); }
    else list.push(e);
  }
  if (list.length || (undated && undated.list.length)) {
    const sig = hash((report.nations || []).map(n => [n.id, n.nodes, n.captured24h, n.lost24h, n.capitalHeld, n.wiped]));
    const entries = await undatedEntries(list, sig), siteNow = clock();
    list.forEach((e, i) => { eventKeys.set(e, entries[i].id); if (siteNow - entries[i].first < HOLD_MS) held.add(e); });
  }
  if (held.size) {
    r.events = events.filter(e => !held.has(e));
    r.owners = Object.assign({}, report.owners || {});
    r.nations = (report.nations || []).map(n => Object.assign({}, n));
    const byId = Object.fromEntries(r.nations.map(n => [n.id, n]));
    // undo newest first (an undated event counts as the newest), so the end state is the one before the oldest held event
    const order = events.map((e, i) => [e, i]).filter(([e]) => held.has(e))
      .sort(([a, i], [b, j]) => ((isTime(b.at) ? b.at : Infinity) - (isTime(a.at) ? a.at : Infinity)) || (i - j) || 0);
    for (const [e] of order) {
      if (e.kind === 'capture') {
        if (e.node && e.from != null) r.owners[e.node] = e.from;
        if (byId[e.to]) { byId[e.to].nodes = (byId[e.to].nodes || 0) - 1; byId[e.to].captured24h = Math.max(0, (byId[e.to].captured24h || 0) - 1); }
        if (byId[e.from]) { byId[e.from].nodes = (byId[e.from].nodes || 0) + 1; byId[e.from].lost24h = Math.max(0, (byId[e.from].lost24h || 0) - 1); }
      } else if (e.kind === 'capital_lost') { if (byId[e.from]) byId[e.from].capitalHeld = true; }
      else if (e.kind === 'capital_retaken') { const n = byId[e.to] || byId[e.nation]; if (n) n.capitalHeld = false; }
      else if (e.kind === 'wiped') { if (byId[e.a]) byId[e.a].wiped = false; }
    }
  }
  // the biggest fights (closed windows only, from the game) as one table: the version first seen 10+ minutes ago, so a
  // window's results show 10 minutes after the site first saw them (at or after its close) and the table never shrinks
  if (Array.isArray(report.battles)) r.battles = await holdValue('battles', report.battles, []);
  if (Array.isArray(report.reports)) {
    const out = [];
    for (const x of report.reports) if (await released('aar:' + (x && x.window) + ':' + hash(x))) out.push(x);
    r.reports = out;
  }
  return r;
}

// ---------------------------------------------------------------- the Daily Front
/** The paper without anything newer than 10 minutes: dated articles by the game's clock, undated ones by when the site
 *  first saw them (by id, or by what they say). An edition whose headline is still held shows under its first visible
 *  article's title, and an edition with nothing visible yet isn't shown. */
async function holdFront(front) {
  if (!front || front.sample || !Array.isArray(front.editions)) return front;
  const cutoff = (isTime(front.now) ? front.now : gameNow()) - HOLD_MS;
  const ok = async (x, key) => isTime(x.at) ? x.at <= cutoff : released(key);
  const editions = [];
  for (const ed of front.editions) {
    if (!ed) continue;
    const articles = [];
    for (const a of (Array.isArray(ed.articles) ? ed.articles : [])) {
      if (!a) continue;
      if (await ok(a, 'art:' + (a.id != null ? 'id:' + a.id : hash([ed.day, ed.date, a.kind, a.nation, a.author, a.title, a.body])))) articles.push(a);
    }
    const headOk = await ok(ed, 'ed:' + (ed.id != null ? 'id:' + ed.id : hash([ed.day, ed.date, ed.headline])));
    if (headOk) editions.push(Object.assign({}, ed, { articles }));
    else if (articles.length) editions.push(Object.assign({}, ed, { headline: articles[0].title, articles }));
  }
  return Object.assign({}, front, { editions });
}

// ---------------------------------------------------------------- soldiers
/** A soldier's record as it was 10 minutes ago: { record } with the newest version first seen at least 10 minutes ago,
 *  or { pending: true } when the site has none that old yet. */
async function holdRecord(uuid, record) {
  if (!record || record.sample) return { record };
  const v = await heldVersion('rec:' + uuid, record);
  return v ? { record: v.value } : { pending: true };
}

/** A night card only once its window has ended and 10 minutes have passed (null until then). With the window's end
 *  (`to`, the game's clock), exactly that; without it, never while a scheduled window is open or just closed, and only
 *  the version of the card first seen at least 10 minutes ago. */
async function holdNight(uuid, card) {
  if (!card || card.sample) return card;
  if (isTime(card.to)) return gameNow() >= card.to + HOLD_MS ? card : null;
  if (windowHot()) return null;
  const v = await heldVersion('night:' + uuid + ':' + card.window, card);
  return v ? v.value : null;
}

/** Any other value the game changes when a window closes (the wager board, the rallies): the version first seen at
 *  least 10 minutes ago, or `empty` until there is one. */
async function holdValue(name, value, empty) {
  const v = await heldVersion('val:' + name, value);
  return v ? v.value : empty;
}

module.exports = {
  HOLD_MS, holdReport, holdFront, eventKey, makePgStore, align, holdRecord, holdNight, holdValue, released, noteGameClock, gameNow, windowHot,
  // tests: swap the store, the clock and the schedule; forget memory (a restart)
  _test: {
    useStore(s) { store = s; seen = new Map(); versions = new Map(); ready = null; undated = null; retryAt = 0; },
    restart() { seen = new Map(); versions = new Map(); ready = null; undated = null; },
    setClock(fn) { clock = fn; },
    setWindows(fn) { windowsOf = fn; },
    setGameOffset(ms) { gameOffset = ms; },
    memoryStore() {
      const s = new Map(), v = new Map();
      return { seenRows: s, versionRows: v,
        async init() { return [...s.entries()]; },
        async saveSeen(k, at) { if (!s.has(k)) s.set(k, at); },
        async loadVersions(n) { return (v.get(n) || []).map(x => Object.assign({}, x)); },
        async saveVersion(n, x) { const l = v.get(n) || []; l.push(Object.assign({}, x)); v.set(n, l); },
        async dropVersions(n, before) { v.set(n, (v.get(n) || []).filter(x => x.first >= before)); } };
    },
  },
};
