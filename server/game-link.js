// S89 Discord sign-in from the game, and the player's settings in the cloud (with Windows' W51). API: docs in
// server/routes/game-link.js. Nothing here messages anyone.
//
// Device-code sign-in (like OAuth's device flow): the game asks for a code, shows it and opens the site; the player signs
// in with Discord there and confirms; the game, polling, receives a per-device token. The game also proves which
// Minecraft account is signed in, with Mojang's own session check (the handshake a server does when you join it): the
// game "joins" a random server id with Mojang, and the site asks Mojang whether that player did. So the Discord account
// is tied to a Minecraft account Mojang vouches for (S87's "verified in game").
//
// Tokens and device codes are stored only as SHA-256 hashes. Settings are one opaque bundle per Discord account
// (whatever the game sends: options, keys, the pack mods' client settings, the server list), capped in size, versioned,
// and the newest (by the time the game says it wrote them) wins, with the device that wrote it recorded.
const crypto = require('crypto');
const db = require('../db');

const CODE_TTL_S = 10 * 60;          // a sign-in code lives 10 minutes
const POLL_INTERVAL_S = 5;
const MAX_BUNDLE = 512 * 1024;       // settings bundle, bytes (decoded)
const MAX_DEVICES = 10;              // per Discord account; the oldest unused goes past this
const USER_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';   // no vowels (no words), no 0/O/1/I

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const rand = n => crypto.randomBytes(n).toString('base64url');
const plainUuid = u => String(u || '').toLowerCase().replace(/-/g, '');
class LinkError extends Error { constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; } }

const ready = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS game_link_requests (
    id BIGSERIAL PRIMARY KEY,
    device_hash TEXT UNIQUE NOT NULL,
    user_code TEXT UNIQUE NOT NULL,
    server_id TEXT NOT NULL,
    label TEXT,
    mc_uuid TEXT, mc_name TEXT,
    discord_id TEXT, discord_name TEXT,
    state TEXT NOT NULL DEFAULT 'pending',          -- pending, approved, denied, used
    last_poll TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL)`);
  await db.query(`CREATE TABLE IF NOT EXISTS game_devices (
    id BIGSERIAL PRIMARY KEY,
    discord_id TEXT NOT NULL,
    discord_name TEXT,
    token_hash TEXT UNIQUE NOT NULL,
    label TEXT,
    mc_uuid TEXT, mc_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ)`);
  await db.query(`CREATE INDEX IF NOT EXISTS game_devices_who ON game_devices (discord_id)`);
  await db.query(`CREATE TABLE IF NOT EXISTS game_settings (
    discord_id TEXT PRIMARY KEY,
    bundle BYTEA NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    format TEXT,
    version INTEGER NOT NULL,
    written_at TIMESTAMPTZ NOT NULL,
    device_id BIGINT,
    device_label TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
})().catch(e => console.error('[game-link] setup', e.message));

// Mojang's session check (replaceable in tests only)
let mojangHasJoined = async (name, serverId) => {
  const r = await fetch(`https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(name)}&serverId=${encodeURIComponent(serverId)}`, { signal: AbortSignal.timeout(8000) });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error('mojang ' + r.status);
  const j = await r.json();
  return j && j.id && j.name ? { uuid: plainUuid(j.id), name: j.name } : null;
};

function userCode() {
  const b = crypto.randomBytes(8);
  const c = Array.from(b, x => USER_ALPHABET[x % USER_ALPHABET.length]).join('');
  return c.slice(0, 4) + '-' + c.slice(4);
}
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2');
const cleanLabel = l => String(l || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || 'Minecraft';

// 1. the game asks for a code
async function start(label) {
  await ready;
  await db.query(`DELETE FROM game_link_requests WHERE expires_at < NOW() - interval '1 day'`);
  const device = rand(32), serverId = crypto.randomBytes(20).toString('hex');
  let code;
  for (let i = 0; i < 5; i++) {
    code = userCode();
    try {
      await db.query(`INSERT INTO game_link_requests (device_hash, user_code, server_id, label, expires_at) VALUES ($1, $2, $3, $4, NOW() + ($5 || ' seconds')::interval)`,
        [sha(device), code, serverId, cleanLabel(label), String(CODE_TTL_S)]);
      return { device_code: device, user_code: code, server_id: serverId, expires_in: CODE_TTL_S, interval: POLL_INTERVAL_S };
    } catch (e) { if (e.code !== '23505') throw e; }
  }
  throw new Error('could not make a unique code');
}

async function byDevice(device) {
  const r = (await db.query(`SELECT * FROM game_link_requests WHERE device_hash = $1`, [sha(device)])).rows[0];
  if (!r) throw new LinkError('invalid_grant', 'Unknown sign-in request.');
  if (new Date(r.expires_at) < new Date() && r.state !== 'used') throw new LinkError('expired_token', 'This sign-in code has expired. Start again from the game.');
  return r;
}

// 2. the game proves its Minecraft account (after calling Mojang's join with server_id)
async function verifyMinecraft(device, name) {
  await ready;
  const r = await byDevice(device);
  if (r.state !== 'pending') throw new LinkError('invalid_grant', 'This sign-in request is already finished.');
  if (!/^[A-Za-z0-9_]{3,16}$/.test(String(name || ''))) throw new LinkError('invalid_request', 'That is not a Minecraft username.');
  let who;
  try { who = await mojangHasJoined(name, r.server_id); } catch (e) { throw new LinkError('temporarily_unavailable', 'Mojang could not be asked just now. Try again in a minute.', 503); }
  if (!who) throw new LinkError('mc_not_verified', 'Mojang did not confirm that account. Sign in to Minecraft and try again.');
  await db.query(`UPDATE game_link_requests SET mc_uuid = $2, mc_name = $3 WHERE id = $1`, [r.id, who.uuid, who.name]);
  return who;
}

// 3. the site: the signed-in player looks at a code, then approves or denies it
async function lookup(code) {
  await ready;
  const r = (await db.query(`SELECT id, user_code, label, mc_name, mc_uuid, state, expires_at FROM game_link_requests WHERE user_code = $1`, [normCode(code)])).rows[0];
  if (!r || new Date(r.expires_at) < new Date() || r.state !== 'pending') return null;
  return r;
}
async function decide(code, user, approve) {
  await ready;
  const r = await lookup(code);
  if (!r) throw new LinkError('invalid_grant', 'That code is unknown, used or expired. Start again from the game.');
  if (approve && !r.mc_uuid) throw new LinkError('mc_not_verified', 'The game hasn\'t confirmed its Minecraft account yet. Wait a few seconds and try again.');
  const done = await db.query(`UPDATE game_link_requests SET state = $2, discord_id = $3, discord_name = $4 WHERE id = $1 AND state = 'pending' RETURNING id`,
    [r.id, approve ? 'approved' : 'denied', user.id, user.username]);
  if (!done.rows.length) throw new LinkError('invalid_grant', 'That code was just used.');
  return r;
}

// 4. the game polls; on approval it gets its token once
async function poll(device) {
  await ready;
  const r = await byDevice(device);
  if (r.last_poll && Date.now() - new Date(r.last_poll).getTime() < (POLL_INTERVAL_S - 1) * 1000) {
    await db.query(`UPDATE game_link_requests SET last_poll = NOW() WHERE id = $1`, [r.id]);
    throw new LinkError('slow_down', 'Poll every ' + POLL_INTERVAL_S + ' seconds.');
  }
  await db.query(`UPDATE game_link_requests SET last_poll = NOW() WHERE id = $1`, [r.id]);
  if (r.state === 'pending') throw new LinkError('authorization_pending', 'Waiting for the player to confirm on the site.');
  if (r.state === 'denied') throw new LinkError('access_denied', 'The sign-in was refused on the site.');
  if (r.state === 'used') throw new LinkError('invalid_grant', 'This sign-in request was already used.');
  // approved: issue the device token once
  const claimed = await db.query(`UPDATE game_link_requests SET state = 'used' WHERE id = $1 AND state = 'approved' RETURNING id`, [r.id]);
  if (!claimed.rows.length) throw new LinkError('invalid_grant', 'This sign-in request was already used.');
  const token = rand(32);
  await db.query(`INSERT INTO game_devices (discord_id, discord_name, token_hash, label, mc_uuid, mc_name) VALUES ($1, $2, $3, $4, $5, $6)`,
    [r.discord_id, r.discord_name, sha(token), r.label, r.mc_uuid, r.mc_name]);
  // keep at most MAX_DEVICES live devices per account: revoke the least recently used beyond that
  await db.query(`UPDATE game_devices SET revoked_at = NOW() WHERE id IN (
      SELECT id FROM game_devices WHERE discord_id = $1 AND revoked_at IS NULL ORDER BY COALESCE(last_used_at, created_at) DESC OFFSET $2)`, [r.discord_id, MAX_DEVICES]);
  return { access_token: token, token_type: 'Bearer', discord: { id: r.discord_id, name: r.discord_name }, minecraft: { uuid: r.mc_uuid, name: r.mc_name } };
}

// the game's token -> its device row (null if unknown or revoked)
async function device(token) {
  await ready;
  if (!token || token.length < 20) return null;
  const d = (await db.query(`UPDATE game_devices SET last_used_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL RETURNING *`, [sha(token)])).rows[0];
  return d || null;
}

async function getSettings(discordId) {
  await ready;
  return (await db.query(`SELECT bundle, size, sha256, format, version, written_at, device_id, device_label, updated_at FROM game_settings WHERE discord_id = $1`, [discordId])).rows[0] || null;
}
// newest wins: a bundle written (by the game's clock) before the stored one is refused, with the current version
async function putSettings(dev, buf, writtenAt, format) {
  await ready;
  if (!Buffer.isBuffer(buf) || !buf.length) throw new LinkError('invalid_request', 'The settings bundle is empty.');
  if (buf.length > MAX_BUNDLE) throw new LinkError('too_large', `The settings bundle is over ${MAX_BUNDLE / 1024} KB.`, 413);
  const at = new Date(writtenAt);
  if (isNaN(at)) throw new LinkError('invalid_request', 'written_at must be a time (ISO 8601 or epoch ms).');
  const when = new Date(Math.min(at.getTime(), Date.now() + 5 * 60 * 1000));   // a clock far ahead can't pin it
  const r = await db.query(
    `INSERT INTO game_settings (discord_id, bundle, size, sha256, format, version, written_at, device_id, device_label)
     VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8)
     ON CONFLICT (discord_id) DO UPDATE SET bundle = EXCLUDED.bundle, size = EXCLUDED.size, sha256 = EXCLUDED.sha256, format = EXCLUDED.format,
       version = game_settings.version + 1, written_at = EXCLUDED.written_at, device_id = EXCLUDED.device_id, device_label = EXCLUDED.device_label, updated_at = NOW()
     WHERE game_settings.written_at < EXCLUDED.written_at
     RETURNING version, written_at`,
    [dev.discord_id, buf, buf.length, crypto.createHash('sha256').update(buf).digest('hex'), String(format || '').slice(0, 40) || null, when, dev.id, dev.label]);
  if (!r.rows.length) { const cur = await getSettings(dev.discord_id); throw Object.assign(new LinkError('stale', 'Newer settings are already stored.', 409), { current: cur }); }
  return r.rows[0];
}
async function deleteSettings(discordId) { await ready; await db.query(`DELETE FROM game_settings WHERE discord_id = $1`, [discordId]); }

// the account page
async function devices(discordId) {
  await ready;
  return (await db.query(`SELECT id, label, mc_name, created_at, last_used_at FROM game_devices WHERE discord_id = $1 AND revoked_at IS NULL ORDER BY COALESCE(last_used_at, created_at) DESC`, [discordId])).rows;
}
async function revoke(discordId, id) {
  await ready;
  return (await db.query(`UPDATE game_devices SET revoked_at = NOW() WHERE discord_id = $1 AND id = $2 AND revoked_at IS NULL RETURNING id`, [discordId, id])).rows.length > 0;
}
async function revokeToken(token) { await ready; await db.query(`UPDATE game_devices SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`, [sha(token)]); }

// for S87: Minecraft accounts Mojang vouched for, per Discord account (newest device first)
async function verifiedAccounts() {
  try {
    await ready;
    const rows = (await db.query(`SELECT DISTINCT ON (discord_id) discord_id, mc_uuid FROM game_devices WHERE mc_uuid IS NOT NULL ORDER BY discord_id, created_at DESC`)).rows;
    return Object.fromEntries(rows.map(r => [r.discord_id, r.mc_uuid]));
  } catch (e) { return {}; }
}

module.exports = {
  LinkError, start, verifyMinecraft, lookup, decide, poll, device, getSettings, putSettings, deleteSettings, devices, revoke, revokeToken,
  verifiedAccounts, normCode, MAX_BUNDLE, CODE_TTL_S, POLL_INTERVAL_S, _setMojang: f => { mojangHasJoined = f; },
};
