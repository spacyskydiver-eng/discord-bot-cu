// The Great War's player application: the form (shown at /apply while open), and the staff page.
const express = require('express');
const router = express.Router();
const gw = require('../gw-apply');

function origin(req, res, next) {
  const o = req.get('origin');
  if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).end();
  next();
}
// staff only; everyone else gets the same 404 as an unknown address
function staff(req, res, next) { if (!res.locals.isStaff) return next('router'); next(); }
const wrap = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (e) { next(e); } };

// the form (or the applicant's own application); called from /apply while applications are open
async function form(req, res, extra = {}) {
  const me = req.session.user ? await gw.mine(req.session.user.id) : null;
  res.set('Cache-Control', 'private, no-store');
  res.render('new/gw-apply', Object.assign({ me, f: me || {}, error: null, field: null, saved: req.query.saved === '1', S: gw }, extra));
}

router.post('/apply/great-war', origin, wrap(async (req, res) => {
  if (!req.session.user) return res.redirect('/auth/discord?return=/apply');
  try { await gw.submit(req.session.user, req.body || {}); res.redirect('/apply?saved=1'); }
  catch (e) {
    if (!(e instanceof gw.GwApplyError)) throw e;
    const b = req.body || {}, arr = v => (Array.isArray(v) ? v : v ? [v] : []);
    await form(req, res, { error: e.message, field: e.field, f: Object.assign({}, b, { times: arr(b.times), styles: arr(b.styles), new_to_modded: b.new_to_modded === 'yes' ? true : b.new_to_modded === 'no' ? false : null }) });
  }
}));

router.get('/staff/great-war-applications', staff, wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.render('new/staff-gw-apps', { o: await gw.overview(), open: await gw.isOpen(), S: gw, isOwner: res.locals.isOwner, msg: req.query.msg || null });
}));
router.get('/staff/great-war-applications.csv', staff, wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store').set('Content-Disposition', 'attachment; filename="great-war-applications.csv"').type('text/csv');
  res.send(gw.csv((await gw.overview()).apps));
}));
// opening and closing it is the owner's call
router.post('/staff/great-war-applications/open', staff, origin, wrap(async (req, res) => {
  if (!res.locals.isOwner) return res.status(403).end();
  await gw.setOpen(req.body.open === 'yes');
  res.redirect('/staff/great-war-applications?msg=' + encodeURIComponent(req.body.open === 'yes' ? 'Applications are open.' : 'Applications are closed.'));
}));

module.exports = { router, form };
