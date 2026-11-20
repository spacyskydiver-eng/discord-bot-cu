// The player modpack, served from cuevents.xyz to signed-in testers and staff only (owner, 20 Nov: S85).
// Its details live in site setting `pack_release` (JSON), set when a release is published:
//   { "version": "v0.25", "file": "the-great-war-v0.25.mrpack", "size": 50093262, "sha256": "...", "source": "<storage address>" }
// The storage address is a random, unlisted key that never leaves the server (not in this public repo, not in any page).
//
// Who may download: signed in, and holding the GW Testers role or staff (owner included). Checked on every step.
// How: the pack page's button goes to /pack/get, which checks the role and redirects to /download/t/<token>; the token
// is an HMAC over (user, version, expiry) and lives 2 minutes. /download/t/<token> checks the token, that the same
// person is signed in, and the role again, then streams the file with no-store caching. Any other /download/ URL
// (old versions' links included) is a 404, and nothing else returns the file's address or checksum to anyone else.
const crypto = require('crypto');
const { Readable } = require('stream');
const access = require('./access');
const config = require('./pack.config');

const LINK_TTL_S = 120;

async function current() {
  try { const r = JSON.parse((await access.getSetting('pack_release')) || 'null'); return r && r.file && r.source ? r : null; }
  catch (e) { return null; }
}
const human = n => n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';

// staff, or the GW Testers role (asked of Discord, cached a minute; fails closed)
const roleCache = new Map();
async function allowed(user) {
  if (!user || !user.id) return false;
  if (await access.isStaff(user)) return true;
  const hit = roleCache.get(user.id);
  if (hit && Date.now() - hit.at < 60 * 1000) return hit.ok;
  const s = await require('./testers').memberState(user.id);
  if (!s) return false;   // Discord unreachable: no, and don't cache
  roleCache.set(user.id, { ok: !!s.hasRole, at: Date.now() });
  return !!s.hasRole;
}

// the signing key: random, kept in the site's settings (never in git); made once
let keyCache = null;
async function key() {
  if (keyCache) return keyCache;
  let k = await access.getSetting('pack_link_key');
  if (!k || k.length < 32) { k = crypto.randomBytes(32).toString('hex'); await access.setSetting('pack_link_key', k); }
  return (keyCache = k);
}
const b64 = b => Buffer.from(b).toString('base64url');
async function mint(userId, version) {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_S;
  const body = `${userId}|${version}|${exp}`;
  return b64(body) + '.' + crypto.createHmac('sha256', await key()).update(body).digest('base64url');
}
async function check(token) {   // token = base64url(body) '.' base64url(hmac); body = user|version|expiry
  const [p, sig] = String(token || '').split('.');
  if (!p || !sig) return null;
  const body = Buffer.from(p, 'base64url').toString();
  const want = crypto.createHmac('sha256', await key()).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  const [userId, version, exp] = body.split('|');
  if (!(Number(exp) > Date.now() / 1000)) return null;
  return { userId, version };
}

// what the pages see: the download details only for someone allowed; never the storage address
async function publicInfo(user) {
  const r = await current();
  const base = { lockEnforced: config.lockEnforced, signedIn: !!user };
  if (!r) return Object.assign(base, { version: null, url: null });
  if (!(await allowed(user))) return Object.assign(base, { version: r.version, url: null, locked: true });
  return Object.assign(base, { version: r.version, url: '/pack/get', size: r.size ? human(r.size) : null, sha256: r.sha256 || null });
}

const noStore = res => res.set({ 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });

// GET /pack/get: role check, then a fresh 2-minute link
async function get(req, res) {
  noStore(res);
  const user = req.session && req.session.user;
  if (!user) { req.session.oauthReturnTo = '/pack'; return res.redirect('/auth/discord'); }
  if (!(await allowed(user))) return res.status(403).send('The modpack is for testers and staff only. If you have a place at a test session, make sure you hold the GW Testers role in our Discord.');
  const r = await current();
  if (!r) return res.status(404).send('No pack is out yet.');
  res.redirect(302, '/download/t/' + await mint(user.id, r.version));
}

// GET /download/t/:token
async function serve(req, res) {
  noStore(res);
  const t = await check(req.params.token);
  const user = req.session && req.session.user;
  const r = await current();
  if (!t || !r || t.version !== r.version) return res.status(410).send('This download link has expired. Get a new one from the pack page.');
  if (!user || user.id !== t.userId || !(await allowed(user))) return res.status(403).send('This download link is for someone else. Get your own from the pack page.');
  try {
    const up = await fetch(r.source, { signal: AbortSignal.timeout(60000) });
    if (!up.ok || !up.body) return res.status(502).send('The download is unavailable right now. Please try again in a minute.');
    res.set({ 'Content-Type': 'application/x-modrinth-modpack+zip', 'Content-Disposition': `attachment; filename="${r.file}"` });
    const len = up.headers.get('content-length'); if (len) res.set('Content-Length', len);
    console.log('[pack] download', r.version, 'by', user.id);
    Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
  } catch (e) { console.error('[pack] download', e.message); if (!res.headersSent) res.status(502).send('The download is unavailable right now. Please try again in a minute.'); }
}

module.exports = { current, publicInfo, get, serve, allowed };
