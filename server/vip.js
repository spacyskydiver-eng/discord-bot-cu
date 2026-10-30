// VIP tiers for the game servers.
//
// A Minecraft UUID's tier comes from the Discord account linked to it (minecraft-links.js) and that
// member's roles in our server: VIP+ beats VIP; no link, or not in the server, is "none". Roles are
// read through the bot and trusted for C.cacheSeconds, so a busy server can't hammer Discord.
//
// When a member's tier changes (the bot sees their roles change, they leave, or they link a different
// Minecraft account), every game server is told with POST <server>/api/vip/changed { uuid }, tried
// again a few times if it fails. Every attempt is logged for the control centre.
const crypto = require('crypto');
const db = require('../db');
const C = require('./vip.config');
const links = require('./minecraft-links');

const DISCORD_API = 'https://discord.com/api/v10';
const TIER_NAME = { none: 'None', vip: 'VIP', vip_plus: 'VIP+' };

const ready = (async () => {
  // the tier we last saw for each member, so a change is noticed even when the bot didn't have the
  // member's old roles cached
  await db.query(`CREATE TABLE IF NOT EXISTS vip_state (
    discord_id TEXT PRIMARY KEY,
    discord_name TEXT,
    tier TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.query(`CREATE TABLE IF NOT EXISTS vip_notifications (
    id SERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uuid TEXT NOT NULL,
    discord_id TEXT,
    reason TEXT,
    server TEXT NOT NULL,
    attempt INT NOT NULL,
    ok BOOLEAN NOT NULL,
    status INT,
    response TEXT)`);
})().catch(e => console.error('[vip] setup', e.message));

/* ---------------------------------------------------------------- tiers */
function tierOfRoles(roles) {
  roles = roles || [];
  if (C.roles.vip_plus.some(r => roles.includes(r))) return 'vip_plus';
  if (C.roles.vip.some(r => roles.includes(r))) return 'vip';
  return 'none';
}

// a member's tier: { tier, inServer, cached }. Throws if Discord can't be reached.
const cache = new Map();
async function memberTier(discordId) {
  const hit = cache.get(discordId);
  if (hit && Date.now() - hit.at < C.cacheSeconds * 1000) return { ...hit.v, cached: true };
  const r = await fetch(`${DISCORD_API}/guilds/${C.guildId}/members/${discordId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }, signal: AbortSignal.timeout(6000),
  });
  let v;
  if (r.status === 404) v = { tier: 'none', inServer: false };
  else if (r.ok) v = { tier: tierOfRoles((await r.json()).roles), inServer: true };
  else throw new Error('Discord member lookup failed: ' + r.status);
  cache.set(discordId, { at: Date.now(), v });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return { ...v, cached: false };
}

// what the endpoint answers for a UUID, and how it got there (the "why" is for the control centre only)
async function lookup(uuid) {
  const link = await links.ofUuid(uuid);
  if (!link) return { tier: 'none', expires: null, why: { linked: false } };
  const m = await memberTier(link.discord_id);
  return { tier: m.tier, expires: null, why: { linked: true, discord_id: link.discord_id, discord_name: link.discord_name, mc_name: link.mc_name, inServer: m.inServer, cached: m.cached } };
}

// the signed-in person's own tier, for the site
async function mine(user) {
  const link = await links.ofDiscord(user.id);
  let tier = null;
  try { tier = (await memberTier(user.id)).tier; } catch (e) { /* Discord unreachable: shown as unknown */ }
  return { tier, tierName: tier ? TIER_NAME[tier] : null, linked: !!link, mc_name: link ? link.mc_name : null, active: !!link && !!tier && tier !== 'none' };
}

/* ---------------------------------------------------------------- the shared secret */
function secretOk(given) {
  if (!C.secret || !given) return false;
  const a = Buffer.from(String(given)), b = Buffer.from(C.secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------------------------------------------------------- telling the game servers */
async function logAttempt(row) {
  await ready;
  await db.query(`INSERT INTO vip_notifications (uuid, discord_id, reason, server, attempt, ok, status, response) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [row.uuid, row.discord_id || null, row.reason, row.server, row.attempt, row.ok, row.status || null, String(row.response || '').slice(0, 500)])
    .catch(e => console.error('[vip] log', e.message));
}
async function sendOnce(server, uuid) {
  try {
    const r = await fetch(server + '/api/vip/changed', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CUE-Secret': C.secret },
      body: JSON.stringify({ uuid: links.dashed(uuid) }), signal: AbortSignal.timeout(8000),
    });
    return { ok: r.ok, status: r.status, response: (await r.text().catch(() => '')).slice(0, 500) };
  } catch (e) {
    const code = e.cause && e.cause.code;
    return { ok: false, status: null, response: e.name === 'TimeoutError' ? 'timed out' : code === 'ECONNREFUSED' ? 'connection refused (server down?)' : code === 'ENOTFOUND' ? 'address not found' : code || e.message };
  }
}
// one server, with retries; resolves when it has succeeded or given up
function deliver(server, uuid, meta, attempt = 1) {
  return sendOnce(server, uuid).then(async res => {
    await logAttempt({ ...meta, uuid, server, attempt, ...res });
    if (res.ok || attempt > C.retryAfter.length) return res;
    await new Promise(r => setTimeout(r, C.retryAfter[attempt - 1] * 1000).unref());
    return deliver(server, uuid, meta, attempt + 1);
  });
}
// tell every game server about one UUID (not waited for by callers)
function notify(uuid, meta = {}) {
  if (!C.secret) { console.warn('[vip] VIP_API_SECRET is not set; not notifying the game servers'); return Promise.resolve([]); }
  return Promise.all(C.servers.map(s => deliver(s, links.plainUuid(uuid), meta)));
}
// the control centre's test button: one try per server, answered straight away
async function testNotify(uuid, by) {
  if (!C.secret) return [];
  return Promise.all(C.servers.map(async server => {
    const res = await sendOnce(server, links.plainUuid(uuid));
    await logAttempt({ uuid: links.plainUuid(uuid), reason: 'test by ' + by, server, attempt: 1, ...res });
    return { server, ...res };
  }));
}

/* ---------------------------------------------------------------- noticing changes */
// called with the member's current roles (null when they left the server)
async function memberChanged(discordId, roles, why, name) {
  await ready;
  const tier = roles ? tierOfRoles(roles) : 'none';
  cache.set(discordId, { at: Date.now(), v: { tier, inServer: !!roles } });
  const before = (await db.query(`SELECT tier FROM vip_state WHERE discord_id = $1`, [discordId])).rows[0];
  if ((before ? before.tier : 'none') === tier) return null;
  await db.query(`INSERT INTO vip_state (discord_id, discord_name, tier) VALUES ($1, $3, $2) ON CONFLICT (discord_id) DO UPDATE SET tier = EXCLUDED.tier, discord_name = COALESCE(EXCLUDED.discord_name, vip_state.discord_name), updated_at = NOW()`, [discordId, tier, name || null]);
  const link = await links.ofDiscord(discordId);
  const reason = `${why}: ${TIER_NAME[before ? before.tier : 'none']} to ${TIER_NAME[tier]}`;
  if (link) notify(link.mc_uuid, { discord_id: discordId, reason });
  return { tier, before: before ? before.tier : 'none', notified: !!link };
}
// the bot's events (index.js): only the CUE server counts
function onMemberUpdate(member) {
  if (!member || !member.guild || member.guild.id !== C.guildId) return;
  memberChanged(member.id, [...member.roles.cache.keys()], 'roles changed', member.user && member.user.username).catch(e => console.error('[vip] member update', e.message));
}
function onMemberRemove(member) {
  if (!member || !member.guild || member.guild.id !== C.guildId) return;
  memberChanged(member.id, null, 'left the server', member.user && member.user.username).catch(e => console.error('[vip] member left', e.message));
}
// someone linked a different Minecraft account: the old one loses their tier, the new one gains it
async function linkChanged(discordId, newUuid, oldUuid) {
  let tier = 'none';
  try { tier = (await memberTier(discordId)).tier; } catch (e) { tier = 'unknown'; }
  if (tier === 'none') return;
  if (oldUuid) notify(oldUuid, { discord_id: discordId, reason: 'Minecraft account changed (old account)' });
  if (newUuid) notify(newUuid, { discord_id: discordId, reason: 'Minecraft account linked' });
}

// everyone holding a VIP role, read once at start-up, so changes made while the bot was offline are
// noticed and the first change after start-up is compared against the truth
async function seed(client) {
  try {
    const guild = await client.guilds.fetch(C.guildId);
    const members = await guild.members.fetch();
    await ready;
    const known = new Map((await db.query(`SELECT discord_id, tier FROM vip_state`)).rows.map(r => [r.discord_id, r.tier]));
    let changed = 0;
    for (const m of members.values()) {
      const roles = [...m.roles.cache.keys()];
      if ((known.get(m.id) || 'none') !== tierOfRoles(roles)) { await memberChanged(m.id, roles, 'changed while the bot was offline', m.user.username); changed++; }
    }
    // anyone we had as VIP who has since left
    for (const [id, tier] of known) if (tier !== 'none' && !members.has(id)) { await memberChanged(id, null, 'left while the bot was offline'); changed++; }
    if (changed) console.log(`[vip] ${changed} tier change${changed === 1 ? '' : 's'} found at start-up`);
  } catch (e) { console.error('[vip] seed', e.message); }
}

/* ---------------------------------------------------------------- control centre */
async function recentNotifications(limit = 100) {
  await ready;
  return (await db.query(`SELECT n.*, extract(epoch from n.at)::bigint AS at_ts, l.discord_name, l.mc_name FROM vip_notifications n
    LEFT JOIN minecraft_links l ON l.mc_uuid = n.uuid ORDER BY n.id DESC LIMIT $1`, [limit])).rows.map(r => ({ ...r, at_ts: Number(r.at_ts) }));
}
// everyone we know holds a VIP role, with their link
async function vipMembers() {
  await ready;
  return (await db.query(`SELECT s.discord_id, s.tier, COALESCE(l.discord_name, s.discord_name) AS discord_name, l.mc_name, l.mc_uuid FROM vip_state s
    LEFT JOIN minecraft_links l ON l.discord_id = s.discord_id AND l.mc_uuid IS NOT NULL WHERE s.tier <> 'none' ORDER BY s.tier DESC, 3`)).rows;
}

module.exports = {
  C, TIER_NAME, ready, tierOfRoles, memberTier, lookup, mine, secretOk, notify, testNotify, memberChanged,
  onMemberUpdate, onMemberRemove, linkChanged, seed, recentNotifications, vipMembers,
};
