// S87 One person, one account (owner, 21 Nov). Stops one player applying, or answering, for another through a new account.
//  1. Account age: a Discord account younger than `acct_min_age_days` (default 30), or one that joined the CU server less
//     than `acct_min_member_days` (default 7) ago, can't submit an application; existing ones are flagged for staff.
//  2. Minecraft: an application is "verified" only once its Minecraft account is linked in game (/link, then the code on
//     the War Office page; server/companion.js stores the game's own uuid for it) and matches the application's account.
//  3. Shared devices: every sign-in records a keyed hash of the visitor's IP, of a long-lived first-party device cookie and
//     of the browser's headers. Two different accounts that share any of them are listed for staff ("possible same
//     person", with the evidence). Flag only, never a ban. Raw IPs are kept 30 days for staff to check, then erased.
// Nothing here messages anyone.
const crypto = require('crypto');
const db = require('../db');
const access = require('./access');

const GUILD_ID = '1449004906068312189';   // the CU Discord server
const RAW_IP_DAYS = 30;
const DEVICE_COOKIE = 'cue_dev';

const ready = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS signin_evidence (
    id BIGSERIAL PRIMARY KEY,
    discord_id TEXT NOT NULL,
    discord_name TEXT,
    ip_hash TEXT,
    ip_raw TEXT,
    device_hash TEXT,
    browser_hash TEXT,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.query(`CREATE INDEX IF NOT EXISTS signin_evidence_ip ON signin_evidence (ip_hash)`);
  await db.query(`CREATE INDEX IF NOT EXISTS signin_evidence_dev ON signin_evidence (device_hash)`);
  await db.query(`CREATE INDEX IF NOT EXISTS signin_evidence_who ON signin_evidence (discord_id)`);
})().catch(e => console.error('[one-account] setup', e.message));

const num = async (key, d) => { const v = parseInt(await access.getSetting(key), 10); return Number.isFinite(v) && v >= 0 ? v : d; };
const limits = async () => ({ ageDays: await num('acct_min_age_days', 30), memberDays: await num('acct_min_member_days', 7) });

// a Discord id carries its account's creation time
const createdAt = id => { try { return Number((BigInt(id) >> 22n) + 1420070400000n); } catch (e) { return null; } };
const daysSince = ms => ms == null ? null : (Date.now() - ms) / 86400000;

// when they joined the CU server (null: not a member; undefined: Discord couldn't be asked)
const joinCache = new Map();
async function joinedAt(id) {
  const hit = joinCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.v;
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${id}`, { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }, signal: AbortSignal.timeout(5000) });
    const v = r.status === 404 ? null : r.ok ? Date.parse((await r.json()).joined_at) || undefined : undefined;
    if (v !== undefined) joinCache.set(id, { v, at: Date.now() });
    return v;
  } catch (e) { return undefined; }
}

// the account checks for one person: { ok, reason, flags: [...] }
async function check(discordId) {
  const L = await limits();
  const flags = [];
  const age = daysSince(createdAt(discordId));
  if (age != null && age < L.ageDays) flags.push({ kind: 'new_account', text: `Discord account ${Math.floor(age)} days old (under ${L.ageDays})` });
  const joined = await joinedAt(discordId);
  if (joined === null) flags.push({ kind: 'not_member', text: 'not in the CU Discord server' });
  else if (joined !== undefined && daysSince(joined) < L.memberDays) flags.push({ kind: 'new_member', text: `joined the CU server ${Math.floor(daysSince(joined))} days ago (under ${L.memberDays})` });
  let reason = null;
  if (flags.some(f => f.kind === 'new_account')) reason = `Applications need a Discord account at least ${L.ageDays} days old. Use your own, older Discord account. Each player applies with their own account.`;
  else if (flags.some(f => f.kind === 'not_member')) reason = 'Join our Discord server first, then apply with the same Discord account.';
  else if (flags.some(f => f.kind === 'new_member')) reason = `Applications open to members of our Discord server ${L.memberDays} days after they join. Please come back then.`;
  else if (joined === undefined) reason = 'We couldn\'t check your Discord account just now. Please try again in a minute.';
  return { ok: !reason, reason, flags };
}

// ---------------------------------------------------------------- sign-in evidence
let keyCache = null;
async function key() {
  if (keyCache) return keyCache;
  let k = await access.getSetting('evidence_key');
  if (!k || k.length < 32) { k = crypto.randomBytes(32).toString('hex'); await access.setSetting('evidence_key', k); }
  return (keyCache = k);
}
const h = async v => v ? crypto.createHmac('sha256', await key()).update(String(v)).digest('hex').slice(0, 32) : null;

// called at every sign-in (server/routes/auth.js); sets the device cookie if there isn't one
async function recordSignin(req, res, user) {
  try {
    await ready;
    let dev = req.cookies ? req.cookies[DEVICE_COOKIE] : null;
    if (!dev) {
      const m = /(?:^|;\s*)cue_dev=([A-Za-z0-9_-]{16,64})/.exec(req.get('cookie') || '');
      dev = m ? m[1] : null;
    }
    if (!dev) {
      dev = crypto.randomBytes(18).toString('base64url');
      res.cookie(DEVICE_COOKIE, dev, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 2 * 365 * 86400000 });
    }
    const ip = require('./rate-limit').visitor(req);
    const browser = ['user-agent', 'accept-language', 'sec-ch-ua', 'sec-ch-ua-platform'].map(k => req.get(k) || '').join('|');
    await db.query(`INSERT INTO signin_evidence (discord_id, discord_name, ip_hash, ip_raw, device_hash, browser_hash) VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.username, await h('ip:' + ip), ip || null, await h('dev:' + dev), await h('br:' + browser)]);
  } catch (e) { console.error('[one-account] sign-in record', e.message); }
}

// raw IPs go after 30 days (the hashes stay, so a match is still seen)
async function sweep() {
  try { await ready; await db.query(`UPDATE signin_evidence SET ip_raw = NULL WHERE ip_raw IS NOT NULL AND at < NOW() - ($1 || ' days')::interval`, [String(RAW_IP_DAYS)]); }
  catch (e) { console.error('[one-account] sweep', e.message); }
}
function start() { sweep(); setInterval(sweep, 6 * 60 * 60 * 1000); }

// pairs of different accounts sharing a device cookie or an IP (browser headers alone are too common to count; shown as
// extra evidence when the pair already matches): [{ a, b, names, device, ip, browser, lastSeen }]
async function sharedPairs() {
  await ready;
  const rows = (await db.query(`
    WITH pairs AS (
      SELECT LEAST(x.discord_id, y.discord_id) AS a, GREATEST(x.discord_id, y.discord_id) AS b,
             bool_or(x.device_hash = y.device_hash) AS device, bool_or(x.ip_hash = y.ip_hash) AS ip,
             bool_or(x.browser_hash = y.browser_hash) AS browser, GREATEST(max(x.at), max(y.at)) AS last_seen,
             array_agg(DISTINCT x.ip_raw) FILTER (WHERE x.ip_hash = y.ip_hash AND x.ip_raw IS NOT NULL) AS ips
      FROM signin_evidence x JOIN signin_evidence y
        ON x.discord_id < y.discord_id AND (x.device_hash = y.device_hash OR x.ip_hash = y.ip_hash)
      GROUP BY 1, 2)
    SELECT p.*, (SELECT discord_name FROM signin_evidence WHERE discord_id = p.a ORDER BY at DESC LIMIT 1) AS a_name,
                (SELECT discord_name FROM signin_evidence WHERE discord_id = p.b ORDER BY at DESC LIMIT 1) AS b_name
    FROM pairs p ORDER BY p.device DESC, p.last_seen DESC LIMIT 500`)).rows;
  return rows;
}
// the ids each id is paired with, for flags on application lists
async function pairedWith() {
  const map = {};
  for (const p of await sharedPairs()) {
    const ev = [p.device && 'same device', p.ip && 'same IP', p.browser && 'same browser'].filter(Boolean).join(', ');
    (map[p.a] = map[p.a] || []).push({ id: p.b, name: p.b_name, ev });
    (map[p.b] = map[p.b] || []).push({ id: p.a, name: p.a_name, ev });
  }
  return map;
}

// is this application's Minecraft account the one this Discord account linked in game?
async function verifiedMap() {
  try { return Object.fromEntries((await db.query(`SELECT discord_id, mc_uuid FROM game_tokens WHERE mc_uuid IS NOT NULL`)).rows.map(r => [r.discord_id, r.mc_uuid])); }
  catch (e) { return {}; }
}
const plain = u => String(u || '').toLowerCase().replace(/-/g, '');

// flags for a list of applications [{ discord_id, mc_uuid }]: adds `checks` { verified, flags[], same[] } to each
async function annotate(apps) {
  const [verified, paired] = await Promise.all([verifiedMap(), pairedWith().catch(() => ({}))]);
  for (const a of apps) {
    const c = await check(a.discord_id);
    a.checks = {
      verified: !!(a.mc_uuid && verified[a.discord_id] && plain(verified[a.discord_id]) === plain(a.mc_uuid)),
      linkedOther: !!(verified[a.discord_id] && a.mc_uuid && plain(verified[a.discord_id]) !== plain(a.mc_uuid)),
      flags: c.flags, same: paired[a.discord_id] || [],
    };
  }
  return apps;
}

module.exports = { check, limits, recordSignin, start, sweep, sharedPairs, annotate, createdAt, DEVICE_COOKIE };
