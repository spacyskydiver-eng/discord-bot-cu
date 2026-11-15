// Owner page for the Daily Front on Discord (S28): the switch, the channel, what's due and what was posted.
const express = require('express');
const router = express.Router();
const access = require('../access');
const fp = require('../front-poster');

function origin(req, res, next) {
  const o = req.get('origin');
  if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).end();
  next();
}
const wrap = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (e) { next(e); } };

router.get('/', wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  let due = [];
  try { due = await fp.due(); } catch (e) { due = [{ key: 'error', embed: { title: e.message } }]; }
  res.render('new/admin-front-posts', { mode: await fp.mode(), channel: (await access.getSetting('front_post_channel')) || '', due, posted: await fp.recent(), ctl: (await access.getSetting('call_to_line')) || 'off', msg: req.query.msg || null });
}));
router.post('/', origin, wrap(async (req, res) => {
  const m = ['off', 'dry', 'on'].includes(req.body.mode) ? req.body.mode : null;
  if (m) await access.setSetting('front_post', m === 'off' ? null : m);
  // S39: call to the line's switch lives here too (off / dry / on).
  const c2 = ['off', 'dry', 'on'].includes(req.body.ctl) ? req.body.ctl : null;
  if (c2) await access.setSetting('call_to_line', c2 === 'off' ? null : c2);
  if (req.body.channel !== undefined) { const c = String(req.body.channel).trim(); await access.setSetting('front_post_channel', /^\d{17,20}$/.test(c) ? c : null); }
  res.redirect('/admin/front-posts?msg=Saved.');
}));

module.exports = router;
