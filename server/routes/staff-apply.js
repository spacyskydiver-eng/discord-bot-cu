// Staff applications: the applicant's own application, their optional voice note and their portfolio
// images. Nothing here returns another applicant's details, or the reasons staff gave for a decision.
// The review queue is in the control centre (routes/admin-staff-apps.js).
const express = require('express');
const router = express.Router();
const staffApply = require('../staff-apply');
const { StaffAppError, C } = staffApply;

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
const wrap = fn => async (req, res, next) => {
  try { await fn(req, res, next); } catch (e) {
    if (e instanceof StaffAppError) return res.status(400).json({ error: e.message, fields: e.fields });
    next(e);
  }
};

// a stored recording, with Range support so the player can seek
function stream(req, res, rec) {
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
// an uploaded image: only the image types we recognised on upload, and never run as a page
function image(res, f) {
  if (!f) return res.status(404).end();
  res.set({ 'Content-Type': f.mime, 'Content-Length': f.size, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline' });
  res.end(f.data);
}

router.get('/api/staff-apply', wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const me = req.session.user ? await staffApply.mine(req.session.user) : null;
  res.json({ info: staffApply.publicInfo(), signedIn: !!req.session.user, user: req.session.user ? { username: req.session.user.username } : null, me });
}));
router.post('/api/staff-apply/submit', origin, json, signedIn, wrap(async (req, res) => res.json(await staffApply.submit(req.session.user, req.body || {}))));
router.post('/api/staff-apply/withdraw', origin, json, signedIn, wrap(async (req, res) => res.json(await staffApply.withdraw(req.session.user))));

// the Operator's voice note, recorded in the browser: the raw audio as the body
router.post('/api/staff-apply/recording', origin, signedIn,
  express.raw({ type: () => true, limit: C.voiceNote.maxBytes + 1024 }),
  wrap(async (req, res) => res.json(await staffApply.saveRecording(req.session.user, req.body, req.get('content-type'), req.get('x-duration')))));
router.post('/api/staff-apply/recording/delete', origin, signedIn, wrap(async (req, res) => res.json(await staffApply.deleteRecording(req.session.user))));
router.get('/api/staff-apply/recording', signedIn, wrap(async (req, res) => stream(req, res, await staffApply.recordingOf(req.session.user.id))));

// the Event Creator's portfolio images: the raw image as the body, its name in X-Filename
router.post('/api/staff-apply/files', origin, signedIn,
  express.raw({ type: () => true, limit: C.portfolio.maxFileBytes + 1024 }),
  wrap(async (req, res) => {
    let name = '';
    try { name = decodeURIComponent(req.get('x-filename') || ''); } catch (e) { name = ''; }
    res.json(await staffApply.saveFile(req.session.user, req.body, name));
  }));
router.post('/api/staff-apply/files/:id(\\d+)/delete', origin, signedIn, wrap(async (req, res) => res.json(await staffApply.deleteFile(req.session.user, parseInt(req.params.id, 10)))));
router.get('/api/staff-apply/files/:id(\\d+)', signedIn, wrap(async (req, res) => image(res, await staffApply.file(parseInt(req.params.id, 10), req.session.user.id))));

// too large for the body limit
router.use('/api/staff-apply', (err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large.' });
  next(err);
});

module.exports = router;
module.exports.stream = stream;
module.exports.image = image;
