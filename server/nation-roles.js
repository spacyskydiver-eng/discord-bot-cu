// Nations on Discord (S24): the bot gives each player their nation's role (which opens that nation's channels), plus a
// Leader and a Seat role, following the game's own membership feed, and takes them away when the game does (a wiped
// nation's players lose theirs). OFF until the owner switches it on (site setting nation_roles: off | dry | on).
//
// Safety, because this acts on the main CU server:
// - It only removes roles it gave itself (nation_role_grants). Roles given by hand or elsewhere are never touched.
// - It only looks at players in the game's feed who have linked their Minecraft account, plus people it granted before.
//   Never the whole server.
// - At most MAX_CHANGES role changes a run, one at a time, PACE ms apart.
// - If the feed fails, is empty, or has shrunk by more than 20% since the last run, it changes nothing.
// - "dry" logs what it would do and changes nothing. Every change (and every dry one) is in nation_role_log.
// Role ids live in site setting nation_roles_config (JSON), set on the owner page; nothing is created automatically.
const db = require('../db');
const access = require('./access');
const links = require('./minecraft-links');

const GUILD_ID = '1449004906068312189';
const MAX_CHANGES = 40, PACE = 750;
// the game's long nation ids -> the site's short ones
const GAME_IDS = { british_empire: 'gb', france: 'fr', germany: 'de', austria_hungary: 'ah', russia: 'ru', italy: 'it', ottoman_empire: 'ot', bulgaria: 'bg' };
const short = id => GAME_IDS[id] || id;
const FEED = () => process.env.NATIONS_FEED_URL ? process.env.NATIONS_FEED_URL.replace(/\/$/, '') : null;

const ready = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS nation_role_grants (
    discord_id TEXT NOT NULL, role_id TEXT NOT NULL, kind TEXT NOT NULL, granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (discord_id, role_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS nation_role_log (
    id SERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT NOW(), mode TEXT NOT NULL, action TEXT NOT NULL,
    discord_id TEXT, role_id TEXT, kind TEXT, note TEXT)`);
})().catch(e => console.error('[nation-roles] setup', e.message));

const mode = async () => { const m = await access.getSetting('nation_roles'); return m === 'on' || m === 'dry' ? m : 'off'; };
async function config() {
  try { return Object.assign({ nations: {}, voice: {}, leader: null, seat: null }, JSON.parse((await access.getSetting('nation_roles_config')) || '{}')); }
  catch (e) { return { nations: {}, voice: {}, leader: null, seat: null }; }
}

// the game's feed (requested from Windows): GET /api/public/nations with the shared secret ->
// { ok, version, nations: [{ id, wiped, leader, regent, seats: [{ n, name, holder }], members: [{ uuid, alive }] }] }
async function feed() {
  if (!FEED()) throw new Error('no feed configured (NATIONS_FEED_URL)');
  const r = await fetch(FEED() + '/api/public/nations', { headers: { 'X-Greatwar-Secret': process.env.WAR_FEED_SECRET || '' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('feed ' + r.status);
  const d = await r.json();
  if (!d || !Array.isArray(d.nations)) throw new Error('feed has no nations');
  return d;
}

// what each linked player should hold: discord_id -> Set(role ids), from the feed and the role config
async function wanted(d, cfg) {
  const out = new Map(), add = (uuid, role, kind) => { if (!uuid || !role) return; out.set(uuid, (out.get(uuid) || []).concat([[role, kind]])); };
  for (const n of d.nations) {
    if (n.wiped) continue;
    const role = cfg.nations[short(n.id)];
    (n.members || []).forEach(m => add(links.plainUuid(m.uuid), role, 'nation'));
    if (n.leader) add(links.plainUuid(n.leader), cfg.leader, 'leader');
    (n.seats || []).forEach(s => s.holder && add(links.plainUuid(s.holder), cfg.seat, 'seat'));
  }
  const byDiscord = new Map();
  for (const [uuid, roles] of out) {
    const l = await links.ofUuid(uuid);
    if (!l || !l.mc_uuid) continue;   // not linked on the site: the bot can't know who they are
    byDiscord.set(l.discord_id, new Map(roles.map(([r, k]) => [r, k])));
  }
  return { byDiscord, members: d.nations.reduce((s, n) => s + (n.wiped ? 0 : (n.members || []).length), 0) };
}

// the plan: grants to give and grants to take back (only ever the bot's own)
async function plan() {
  await ready;
  const cfg = await config(), d = await feed();
  const { byDiscord, members } = await wanted(d, cfg);
  const last = Number(await access.getSetting('nation_roles_last_members')) || 0;
  if (!members) throw new Error('the feed lists no members: changing nothing');
  if (last && members < last * 0.8) throw new Error(`the feed shrank from ${last} to ${members} members: changing nothing until it's checked`);
  const grants = (await db.query(`SELECT discord_id, role_id, kind FROM nation_role_grants`)).rows;
  const has = new Set(grants.map(g => g.discord_id + '|' + g.role_id));
  const give = [], take = [];
  for (const [id, roles] of byDiscord) for (const [role, kind] of roles) if (!has.has(id + '|' + role)) give.push({ discord_id: id, role_id: role, kind });
  for (const g of grants) { const roles = byDiscord.get(g.discord_id); if (!roles || !roles.has(g.role_id)) take.push(g); }
  return { give, take, members, linked: byDiscord.size, version: d.version };
}

const bot = (method, path) => fetch('https://discord.com/api/v10' + path, { method, headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'X-Audit-Log-Reason': 'Great War nation roles' }, signal: AbortSignal.timeout(8000) });
const log = (m, action, x, note) => db.query(`INSERT INTO nation_role_log (mode, action, discord_id, role_id, kind, note) VALUES ($1, $2, $3, $4, $5, $6)`, [m, action, x && x.discord_id, x && x.role_id, x && x.kind, note || null]);

// one run. Returns a summary; never throws into the caller's timer.
async function run() {
  const m = await mode();
  if (m === 'off') return { mode: m, skipped: true };
  let p;
  try { p = await plan(); } catch (e) { await log(m, 'stopped', null, e.message).catch(() => {}); return { mode: m, error: e.message }; }
  const todo = [...p.take.map(x => ['remove', x]), ...p.give.map(x => ['add', x])].slice(0, MAX_CHANGES);
  let done = 0, failed = 0;
  for (const [action, x] of todo) {
    if (m === 'dry') { await log(m, 'would ' + action, x); continue; }
    const r = await bot(action === 'add' ? 'PUT' : 'DELETE', `/guilds/${GUILD_ID}/members/${x.discord_id}/roles/${x.role_id}`).catch(e => ({ ok: false, status: e.message }));
    if (r.status === 429) { await log(m, 'rate limited', x); break; }
    // a member who left the server (404) is fine: the grant is still updated
    if (r.ok || r.status === 404) {
      done++;
      if (action === 'add') {
        const fresh = (await db.query(`INSERT INTO nation_role_grants (discord_id, role_id, kind) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [x.discord_id, x.role_id, x.kind])).rowCount;
        if (fresh && x.kind === 'nation') await welcome(x).catch(e => log(m, 'welcome failed', x, e.message));
      }
      else await db.query(`DELETE FROM nation_role_grants WHERE discord_id = $1 AND role_id = $2`, [x.discord_id, x.role_id]);
      await log(m, action, x, r.status === 404 ? 'not in the server' : null);
    } else { failed++; await log(m, action + ' failed', x, String(r.status)); }
    await new Promise(z => setTimeout(z, PACE));
  }
  if (m === 'on') await access.setSetting('nation_roles_last_members', String(p.members));
  return { mode: m, give: p.give.length, take: p.take.length, done, failed, left: p.give.length + p.take.length - todo.length };
}

// the welcome DM (meeting 2), when a player first gets a nation's role; its own switch, site setting nation_welcome = on
async function welcome(x) {
  if ((await access.getSetting('nation_welcome')) !== 'on') return;
  const cfg = await config(), id = Object.keys(cfg.nations).find(k => cfg.nations[k] === x.role_id);
  const n = require('./nations').NATIONS.find(y => y.id === id);
  if (!n) return;
  const ch = await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient_id: x.discord_id }), signal: AbortSignal.timeout(8000) });
  if (!ch.ok) return;
  const content = `Welcome to **${n.name}**. Your Leader, your nation's voice channel, the next war window in your time and three things to do tonight: https://cuevents.xyz/welcome/${n.slug}`;
  await fetch(`https://discord.com/api/v10/channels/${(await ch.json()).id}/messages`, { method: 'POST', headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content }), signal: AbortSignal.timeout(8000) });
  await log('on', 'welcomed', x);
}
// the Leader's Minecraft name, from the feed (null until the feed exists)
let leaders = { at: 0, by: {} };
async function leaderName(nationId) {
  if (!FEED()) return null;
  if (Date.now() - leaders.at > 5 * 60 * 1000) {
    const d = await feed(), by = {};
    for (const n of d.nations) if (n.leader) { const l = await links.ofUuid(links.plainUuid(n.leader)); by[short(n.id)] = l ? l.mc_name : null; }
    leaders = { at: Date.now(), by };
  }
  return leaders.by[nationId] || null;
}

function start() {
  const tick = () => run().then(s => { if (!s.skipped) console.log('[nation-roles]', JSON.stringify(s)); }).catch(e => console.error('[nation-roles]', e.message));
  setTimeout(tick, 90 * 1000);
  setInterval(tick, 5 * 60 * 1000);
}
async function recentLog(n = 100) { await ready; return (await db.query(`SELECT *, extract(epoch from at)::bigint AS ts FROM nation_role_log ORDER BY id DESC LIMIT $1`, [n])).rows; }

module.exports = { mode, config, plan, run, start, recentLog, leaderName, GAME_IDS, MAX_CHANGES, ready };
