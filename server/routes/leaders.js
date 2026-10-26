// Leader applications: the applicant's own application, teammates' invitations, the voice recording, the
// Leader's cabinet, and the staff review pages (GW Staff role or the owner; anyone else gets a 404).
// Nothing an applicant can reach returns another applicant's details, scores or notes.
const express = require('express');
const router = express.Router();
const leaders = require('../leaders');
const { LeaderError } = leaders;

function origin(req, res, next) {
  const o = req.get('origin');
  if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).json({ error: 'Forbidden' });
  next();
}
function json(req, res, next) {
  if (!req.is('application/json')) return res.status(415).json({ error: 'Expected JSON' });
  next();
}
function signedIn(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Sign in with Discord first.' });
  next();
}
const fail = (res, e, next) => {
  if (e instanceof LeaderError) return res.status(400).json({ error: e.message, fields: e.fields });
  next(e);
};
const wrap = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (e) { fail(res, e, next); } };

/* ---------------------------------------------------------------- applicants and teammates */
router.get('/api/leaders', wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const me = req.session.user ? await leaders.mine(req.session.user) : null;
  res.json({ info: leaders.publicInfo(), signedIn: !!req.session.user, user: req.session.user ? { username: req.session.user.username } : null, me });
}));
router.post('/api/leaders/team', origin, json, signedIn, wrap(async (req, res) => res.json(await leaders.saveTeam(req.session.user, req.body || {}))));
router.post('/api/leaders/respond', origin, json, signedIn, wrap(async (req, res) => {
  const b = req.body || {};
  res.json(await leaders.respond(req.session.user, parseInt(b.id, 10), b.accept === true, b.agree === true));
}));
router.post('/api/leaders/submit', origin, json, signedIn, wrap(async (req, res) => res.json(await leaders.submit(req.session.user, req.body || {}))));
router.post('/api/leaders/end', origin, json, signedIn, wrap(async (req, res) => res.json(await leaders.end(req.session.user, String((req.body || {}).reason || 'unavailable').slice(0, 200)))));

// the pitch, recorded in the browser: the raw audio as the body
router.post('/api/leaders/recording', origin, signedIn,
  express.raw({ type: () => true, limit: leaders.C.recording.maxBytes + 1024 }),
  wrap(async (req, res) => res.json(await leaders.saveRecording(req.session.user, req.body, req.get('content-type'), req.get('x-duration')))));

// play a stored recording, with Range support so the player can seek
async function stream(req, res, rec) {
  if (!rec) return res.status(404).end();
  const size = rec.data.length;
  res.set({ 'Content-Type': rec.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.get('range') || '');
  if (m) {
    let start = m[1] === '' ? size - parseInt(m[2], 10) : parseInt(m[1], 10);
    let end = m[1] !== '' && m[2] !== '' ? parseInt(m[2], 10) : size - 1;
    if (!(start >= 0) || start >= size || end < start) return res.status(416).set('Content-Range', `bytes */${size}`).end();
    end = Math.min(end, size - 1);
    res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return res.end(rec.data.subarray(start, end + 1));
  }
  res.set('Content-Length', size).end(rec.data);
}
router.get('/api/leaders/recording', signedIn, wrap(async (req, res) => stream(req, res, await leaders.myRecording(req.session.user.id))));

// the cabinet (accepted Leaders only)
router.get('/api/leaders/cabinet/players', signedIn, wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await leaders.assignedPlayers(req.session.user));
}));
router.post('/api/leaders/cabinet/add', origin, json, signedIn, wrap(async (req, res) => { await leaders.cabinetAdd(req.session.user, String(req.body.discord_id || ''), String(req.body.mc_name || '')); res.json(await leaders.mine(req.session.user)); }));
router.post('/api/leaders/cabinet/remove', origin, json, signedIn, wrap(async (req, res) => { await leaders.cabinetRemove(req.session.user, String(req.body.discord_id || '')); res.json(await leaders.mine(req.session.user)); }));
router.post('/api/leaders/cabinet/order', origin, json, signedIn, wrap(async (req, res) => { await leaders.cabinetOrder(req.session.user, (req.body.order || []).map(String)); res.json(await leaders.mine(req.session.user)); }));

/* ---------------------------------------------------------------- staff review */
// staff only; everyone else gets the same 404 as an unknown address
function staff(req, res, next) {
  if (!res.locals.isStaff) return next('router');
  next();
}
const back = (req, id, msg) => `/staff/leaders/${id}${msg ? '?msg=' + encodeURIComponent(msg) : ''}`;

router.get('/staff/leaders', staff, wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const filters = { nation: req.query.nation || '', rank: req.query.rank || '1', status: req.query.status || '' };
  const apps = await leaders.list(filters);
  res.render('new/staff-leaders', { mode: 'list', apps, hiddenIncomplete: apps.hiddenIncomplete || 0, filters, C: leaders.C, NATION: leaders.NATION, exports: await leaders.exports(), msg: req.query.msg || null, d: null, isOwner: res.locals.isOwner });
}));
router.get('/staff/leaders/:id(\\d+)', staff, wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const d = await leaders.detail(parseInt(req.params.id, 10), req.session.user.id);
  if (!d) return res.redirect('/staff/leaders');
  res.render('new/staff-leaders', { mode: 'detail', d, apps: [], filters: {}, C: leaders.C, NATION: leaders.NATION, exports: [], msg: req.query.msg || null, isOwner: res.locals.isOwner });
}));
router.get('/staff/leaders/:id(\\d+)/recording', staff, wrap(async (req, res) => stream(req, res, await leaders.recording(parseInt(req.params.id, 10)))));

const act = fn => [staff, origin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try { const m = await fn(id, req); res.redirect(back(req, id, m || 'Saved.')); }
  catch (e) { if (e instanceof LeaderError) return res.redirect(back(req, id, e.message)); throw e; }
})];
router.post('/staff/leaders/:id(\\d+)/score', ...act(async (id, req) => { await leaders.score(id, req.session.user, req.body); return 'Your scores are saved.'; }));
router.post('/staff/leaders/:id(\\d+)/shortlist', ...act(async (id, req) => { await leaders.shortlist(id, req.body.on === '1'); }));
router.post('/staff/leaders/:id(\\d+)/brief', ...act(async (id, req) => { await leaders.briefAttendance(id, req.body.attended === '1'); }));
router.post('/staff/leaders/:id(\\d+)/accept', ...act(async (id, req) => {
  const { results } = await leaders.accept(id, String(req.body.nation || ''), req.session.user);
  const missing = results.filter(r => !r.ok);
  return 'Accepted.' + (missing.length ? ' Roles not given: ' + missing.map(r => `${r.role} to ${r.who}${r.note ? ' (' + r.note + ')' : ''}`).join('; ') + '.' : ' All roles given.');
}));
router.post('/staff/leaders/:id(\\d+)/decline', ...act(async (id, req) => { await leaders.decline(id, req.session.user); return 'Declined; the applicant and their team have been told.'; }));
router.post('/staff/leaders/export', staff, origin, wrap(async (req, res) => {
  const r = await leaders.exportToGame(req.session.user.username);
  const bad = r.filter(x => !x.appoint.ok || !x.seatsResult.ok).length;
  res.redirect('/staff/leaders?msg=' + encodeURIComponent(`Exported ${r.length} nation${r.length === 1 ? '' : 's'} to the game server` + (bad ? `; ${bad} refused (see the export log).` : '.')));
}));

module.exports = router;
