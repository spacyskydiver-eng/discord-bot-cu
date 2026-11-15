// The War Office on your phone (S30): a private, read-only view of a player's own war, through the game's web API
// (greatwar docs/WEB_API.md). The player links once with the 8-character code from /link in game; the site swaps it for
// the player's API token (POST /api/link) and keeps that token encrypted, server side only. Reads use the player's own
// token, so they see exactly what their in-game screens show. Never node values or coordinates (the API returns none).
// Until GAME_API_URL is set, a sample view.
const crypto = require('crypto');
const db = require('../db');

const API = () => process.env.GAME_API_URL ? process.env.GAME_API_URL.replace(/\/$/, '') : null;
// the key that encrypts players' game tokens: never a known fallback (S74 review); without SESSION_SECRET each start gets a
// random key, so stored tokens can't be read after a restart and players link again
const KEY = crypto.createHash('sha256').update('war-office:' + (process.env.SESSION_SECRET
  || (console.error('[war-office] SESSION_SECRET is not set; game tokens use a random key for this run'), crypto.randomBytes(32).toString('hex')))).digest();
class CompanionError extends Error {}

const ready = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS game_tokens (discord_id TEXT PRIMARY KEY, token TEXT NOT NULL, linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
})().catch(e => console.error('[companion] setup', e.message));

const seal = t => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv); const enc = Buffer.concat([c.update(t, 'utf8'), c.final()]); return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.'); };
const open = s => { const [iv, tag, enc] = s.split('.').map(x => Buffer.from(x, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv); d.setAuthTag(tag); return Buffer.concat([d.update(enc), d.final()]).toString('utf8'); };

const call = (path, opts = {}, token) => fetch(API() + path, Object.assign({}, opts, {
  headers: Object.assign({ 'X-Greatwar-Secret': process.env.GAME_API_SECRET || '', 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
  signal: AbortSignal.timeout(6000) }));

async function linked(discordId) { await ready; return !!(await db.query(`SELECT 1 FROM game_tokens WHERE discord_id = $1`, [discordId])).rows.length; }

async function link(user, code) {
  await ready;
  code = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) throw new CompanionError('The code is 8 letters and numbers: type /link in the game to get one.');
  if (!API()) throw new CompanionError('Linking opens when the war server is live.');
  const r = await call('/api/link', { method: 'POST', body: JSON.stringify({ code, label: 'cuevents.xyz' }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.token) throw new CompanionError(d.message || 'That code didn\'t work. Codes last 10 minutes: get a fresh one with /link.');
  await db.query(`INSERT INTO game_tokens (discord_id, token) VALUES ($1, $2) ON CONFLICT (discord_id) DO UPDATE SET token = EXCLUDED.token, linked_at = NOW()`, [user.id, seal(d.token)]);
}

async function unlink(discordId) {
  await ready;
  const row = (await db.query(`SELECT token FROM game_tokens WHERE discord_id = $1`, [discordId])).rows[0];
  if (row && API()) { try { await call('/api/session', { method: 'DELETE' }, open(row.token)); } catch (e) { /* the token is dropped here either way */ } }
  await db.query(`DELETE FROM game_tokens WHERE discord_id = $1`, [discordId]);
}

// the player's own view: { sample, me, inbox, orders, mail } (orders and mail need endpoints the API doesn't have yet)
async function view(discordId) {
  await ready;
  if (!API()) return sample();
  const row = (await db.query(`SELECT token FROM game_tokens WHERE discord_id = $1`, [discordId])).rows[0];
  if (!row) return null;
  const token = open(row.token), get = async p => { const r = await call(p, {}, token); if (r.status === 401) throw new CompanionError('revoked'); return r.ok ? r.json() : null; };
  try {
    const [me, inbox, orders, mail, away] = await Promise.all([get('/api/me'), get('/api/inbox'), get('/api/orders').catch(() => null), get('/api/mail').catch(() => null),
      get('/api/away').catch(() => null)]); // S58: since you were away (a game without it: none)
    return { sample: false, me, inbox: ((inbox && inbox.items) || []).map(n => ({ text: [n.title, n.body].filter(Boolean).join(': '), at: n.time, read: !!n.read })).filter(n => n.text), /* the game's WebStore.Item (S-own-20) */ orders: orders && orders.orders, jobs: orders && orders.jobs, mail: mail && mail.letters,
      away: away && !away.off ? (away.lines || []) : [] };
  } catch (e) {
    if (e.message === 'revoked') { await db.query(`DELETE FROM game_tokens WHERE discord_id = $1`, [discordId]); return null; }
    throw e;
  }
}

function sample() {
  const now = Date.now();
  return { sample: true,
    me: { name: 'YourName', nation: 'france', nationName: 'France', alive: true, rank: 'Corporal', class: 'Rifleman', balance: null },
    orders: [{ text: 'Defend Verdun, 19:00', at: now + 3 * 3600e3 }],
    jobs: [{ title: 'Fortify Verdun', pay: 'paid per block', left: '160 blocks left' }, { title: 'Donate iron to Field Artillery', pay: 'paid per item', left: 'open' }],
    mail: [{ from: 'Germany · Foreign Secretary', subject: 'On the matter of Lorraine', at: now - 2 * 3600e3 }],
    inbox: [{ text: 'You were paid for 40 minutes of service.', at: now - 25 * 60e3 }, { text: 'Germany has marked France as an enemy: war from the next window.', at: now - 5 * 3600e3 }],
    away: ['France took 1 node and lost Verdun to Germany.', 'The Daily Front: Verdun falls at dusk.', '2 letters wait in the War Office.', "Today's orders: 1 of 3 done (War Office, Orders, Daily)."] };
}

// S39: a linked player's own /api/me (nation, uuid), and the web API's public part (the secret alone).
async function me(discordId) {
  await ready;
  if (!API()) return null;
  const row = (await db.query(`SELECT token FROM game_tokens WHERE discord_id = $1`, [discordId])).rows[0];
  if (!row) return null;
  const r = await call('/api/me', {}, open(row.token));
  return r.ok ? r.json() : null;
}
async function publicGet(path) {
  if (!API()) return null;
  const r = await call(path, {});
  if (!r.ok) throw new Error('game API ' + r.status);
  return r.json();
}

// S69: a server-to-server POST with the secret alone (the testers' reports to the staff panel's Feedback page)
async function publicPost(path, body) {
  if (!API()) return null;
  const r = await call(path, { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) throw new Error('game API ' + r.status);
  return r.json();
}

module.exports = { CompanionError, linked, link, unlink, view, me, publicGet, publicPost, isLive: () => !!API() };
