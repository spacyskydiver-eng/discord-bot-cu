// S89 Discord sign-in from the game + cloud settings (with Windows' W51). The API the game calls, and the two pages.
//
// The game (no cookies, no Origin; JSON in and out; errors are { error, message } with the status shown):
//   POST /api/game/link/start      { label }                      -> { device_code, user_code, server_id, verification_uri,
//                                                                     verification_uri_complete, expires_in, interval }
//        then the game calls Mojang's session join with server_id (POST https://sessionserver.mojang.com/session/minecraft/join
//        { accessToken, selectedProfile, serverId }), shows user_code and opens verification_uri_complete in the browser
//   POST /api/game/link/minecraft  { device_code, name }           -> { uuid, name }   (the site asks Mojang hasJoined)
//        errors: mc_not_verified 400, temporarily_unavailable 503, expired_token 400, invalid_grant 400
//   POST /api/game/link/poll       { device_code }                 -> 200 { access_token, token_type, discord, minecraft }
//        until then 400 { error: authorization_pending | slow_down | access_denied | expired_token | invalid_grant }
//   with  Authorization: Bearer <access_token>:
//   GET    /api/game/me            -> { discord: { id, name }, minecraft: { uuid, name }, device: { id, label } }
//   GET    /api/game/settings      -> 200 the bundle bytes (application/octet-stream) with headers X-Settings-Version,
//                                     X-Written-At (ISO), X-Settings-Device, X-Settings-Format, ETag = sha256; 204 if none
//   PUT    /api/game/settings      body: the bundle bytes (application/octet-stream, max 512 KB), headers X-Written-At
//                                     (ISO 8601 or epoch ms, when the game wrote it) and optional X-Settings-Format
//                                     -> 200 { version, written_at }; 409 { error: stale, version, written_at } if newer
//                                     ones are stored (newest wins); 413 too_large
//   DELETE /api/game/link          -> 204, this device's token revoked (unlink)
//   401 { error: invalid_token } for an unknown or revoked token.
// The player (signed in with Discord):
//   GET  /link-game?code=XXXX-XXXX  confirm or refuse the game's sign-in
//   GET  /account/game              linked devices (revoke each), the stored settings (delete)
const express = require('express');
const router = express.Router();
const gl = require('../game-link');
const { limit } = require('../rate-limit');

const SITE = 'https://cuevents.xyz';
const wrap = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (e) { next(e); } };
const fail = (res, e) => {
  if (e instanceof gl.LinkError) {
    const body = { error: e.code, message: e.message };
    if (e.current) Object.assign(body, { version: e.current.version, written_at: e.current.written_at });
    return res.status(e.status).json(body);
  }
  throw e;
};
const api = fn => wrap(async (req, res) => { res.set('Cache-Control', 'no-store'); try { await fn(req, res); } catch (e) { fail(res, e); } });
async function bearer(req, res, next) {
  try {
    const m = /^Bearer\s+([A-Za-z0-9_-]{20,})$/.exec(req.get('authorization') || '');
    const d = m ? await gl.device(m[1]) : null;
    if (!d) return res.status(401).set('Cache-Control', 'no-store').json({ error: 'invalid_token', message: 'Sign in again from the game.' });
    req.gameDevice = d; req.gameToken = m[1];
    next();
  } catch (e) { next(e); }
}

// ---------------------------------------------------------------- the game
router.post('/api/game/link/start', limit({ perMinute: 6 }), api(async (req, res) => {
  const s = await gl.start((req.body || {}).label);
  res.json(Object.assign(s, { verification_uri: SITE + '/link-game', verification_uri_complete: SITE + '/link-game?code=' + s.user_code }));
}));
router.post('/api/game/link/minecraft', limit({ perMinute: 12 }), api(async (req, res) => {
  const b = req.body || {};
  res.json(await gl.verifyMinecraft(String(b.device_code || ''), String(b.name || '')));
}));
router.post('/api/game/link/poll', limit({ perMinute: 30 }), api(async (req, res) => {
  res.json(await gl.poll(String((req.body || {}).device_code || '')));
}));
router.get('/api/game/me', limit({ perMinute: 30 }), bearer, api(async (req, res) => {
  const d = req.gameDevice;
  res.json({ discord: { id: d.discord_id, name: d.discord_name }, minecraft: { uuid: d.mc_uuid, name: d.mc_name }, device: { id: String(d.id), label: d.label } });
}));
router.get('/api/game/settings', limit({ perMinute: 20 }), bearer, api(async (req, res) => {
  const s = await gl.getSettings(req.gameDevice.discord_id);
  if (!s) return res.status(204).end();
  res.set({ 'Content-Type': 'application/octet-stream', 'X-Settings-Version': String(s.version), 'X-Written-At': new Date(s.written_at).toISOString(),
    'X-Settings-Device': encodeURIComponent(s.device_label || ''), 'X-Settings-Format': s.format || '', ETag: '"' + s.sha256 + '"' });
  if (req.get('if-none-match') === '"' + s.sha256 + '"') return res.status(304).end();
  res.send(s.bundle);
}));
router.put('/api/game/settings', limit({ perMinute: 12 }), bearer, express.raw({ type: () => true, limit: gl.MAX_BUNDLE + 1 }),
  api(async (req, res) => {
    const raw = req.get('x-written-at'), at = /^\d{10,}$/.test(raw || '') ? Number(raw) : raw;
    const r = await gl.putSettings(req.gameDevice, req.body, at, req.get('x-settings-format'));
    res.json({ version: r.version, written_at: new Date(r.written_at).toISOString() });
  }));
router.delete('/api/game/link', bearer, api(async (req, res) => { await gl.revokeToken(req.gameToken); res.status(204).end(); }));
// a body over the cap
router.use('/api/game', (err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: `The settings bundle is over ${gl.MAX_BUNDLE / 1024} KB.` });
  if (err && err.type === 'entity.parse.failed') return res.status(400).set('Cache-Control', 'no-store').json({ error: 'invalid_request', message: 'The body is not valid JSON.' });
  next(err);
});

// ---------------------------------------------------------------- the player
router.get('/link-game', wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const code = gl.normCode(req.query.code || '');
  if (!req.session.user) { req.session.oauthReturnTo = '/link-game' + (code ? '?code=' + encodeURIComponent(code) : ''); return res.render('new/link-game', { step: 'signin', code, req: null, msg: null }); }
  const r = code ? await gl.lookup(code) : null;
  res.render('new/link-game', { step: r ? 'confirm' : 'enter', code, req: r, msg: code && !r ? 'That code is unknown, used or expired. Start again from the game.' : null });
}));
router.post('/link-game', limit({ perMinute: 20 }), wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.session.user) return res.redirect('/link-game');
  const b = req.body || {}, code = gl.normCode(b.code);
  if (b.action !== 'approve' && b.action !== 'deny') return res.redirect('/link-game?code=' + encodeURIComponent(code));
  try {
    await gl.decide(code, req.session.user, b.action === 'approve');
    res.render('new/link-game', { step: b.action === 'approve' ? 'done' : 'denied', code, req: null, msg: null });
  } catch (e) {
    if (!(e instanceof gl.LinkError)) throw e;
    res.render('new/link-game', { step: 'enter', code, req: await gl.lookup(code), msg: e.message });
  }
}));
router.get('/account/game', wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.session.user) { req.session.oauthReturnTo = '/account/game'; return res.redirect('/auth/discord'); }
  const id = req.session.user.id, s = await gl.getSettings(id);
  res.render('new/account-game', { devices: await gl.devices(id), settings: s ? { size: s.size, version: s.version, written_at: s.written_at, device_label: s.device_label } : null, msg: req.query.msg || null });
}));
router.post('/account/game/revoke', wrap(async (req, res) => {
  if (!req.session.user) return res.redirect('/account/game');
  const ok = await gl.revoke(req.session.user.id, parseInt((req.body || {}).id, 10) || 0);
  res.redirect('/account/game?msg=' + encodeURIComponent(ok ? 'That game is signed out.' : 'Nothing to sign out.'));
}));
router.post('/account/game/settings/delete', wrap(async (req, res) => {
  if (!req.session.user) return res.redirect('/account/game');
  await gl.deleteSettings(req.session.user.id);
  res.redirect('/account/game?msg=' + encodeURIComponent('Your saved settings are deleted.'));
}));

module.exports = router;
