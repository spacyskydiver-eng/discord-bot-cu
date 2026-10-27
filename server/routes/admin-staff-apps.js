// The staff application review queue, in the control centre. Mounted by routes/admin.js behind
// requireOwner, so only the owner reaches it; everyone else gets the control centre's 401/403.
const express = require('express');
const router = express.Router();
const staffApply = require('../staff-apply');
const { stream, image } = require('./staff-apply');
const { StaffAppError, C } = staffApply;

function origin(req, res, next) {
  const o = req.get('origin');
  if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).end();
  next();
}
const wrap = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (e) { next(e); } };
const back = (id, msg) => `/admin/staff-applications/${id}${msg ? '?msg=' + encodeURIComponent(msg) : ''}`;
const view = (res, data) => res.render('new/admin-staff-apps', { C, TRACK: staffApply.TRACK, Q: staffApply.QUESTIONS, OP_TOOLS: staffApply.OP_TOOLS, CRAFTS: staffApply.CRAFTS, TOOLS: staffApply.TOOLS, msg: null, apps: [], counts: null, filters: {}, d: null, ...data });

router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

router.get('/', wrap(async (req, res) => {
  const filters = { track: staffApply.TRACK[req.query.track] ? req.query.track : '', first: req.query.first === '1', status: ['review', 'accepted', 'rejected', 'withdrawn'].includes(req.query.status) ? req.query.status : '' };
  view(res, { mode: 'list', apps: await staffApply.queue(filters), counts: await staffApply.counts(), filters, msg: req.query.msg || null });
}));
router.get('/:id(\\d+)', wrap(async (req, res) => {
  const d = await staffApply.detail(parseInt(req.params.id, 10));
  if (!d) return res.redirect('/admin/staff-applications');
  view(res, { mode: 'detail', d, msg: req.query.msg || null });
}));
router.get('/:id(\\d+)/recording', wrap(async (req, res) => stream(req, res, await staffApply.adminRecording(parseInt(req.params.id, 10)))));
router.get('/:id(\\d+)/files/:fileId(\\d+)', wrap(async (req, res) => image(res, await staffApply.adminFile(parseInt(req.params.id, 10), parseInt(req.params.fileId, 10)))));

router.post('/:id(\\d+)/decide', origin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  const accept = b.decision === 'accept';
  if (!accept && b.decision !== 'reject') return res.redirect(back(id, 'Choose accept or reject.'));
  try {
    const { results, dm } = await staffApply.decide(id, String(b.track || ''), accept, b.reason, req.session.user);
    const name = staffApply.TRACK[b.track].name;
    const missing = results.filter(r => !r.ok);
    const msg = accept
      ? `Accepted as ${name}.` + (missing.length ? ' Roles not given: ' + missing.map(r => r.role + (r.note ? ' (' + r.note + ')' : '')).join('; ') + '.' : ' Roles given.')
      : `Rejected for ${name}.`;
    res.redirect(back(id, msg + (dm ? ' The bot has messaged them.' : " The bot couldn't message them (DMs closed or not in the server).")));
  } catch (e) {
    if (e instanceof StaffAppError) return res.redirect(back(id, e.message));
    throw e;
  }
}));

module.exports = router;
