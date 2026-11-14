// The War Office on your phone (S30). Signed-in players only; everything per player and never cached.
const express = require('express');
const router = express.Router();
const comp = require('../companion');
const { GAME_IDS } = require('../nation-roles');
const NATIONS = require('../nations').NATIONS;

function origin(req, res, next) {
  const o = req.get('origin');
  if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).end();
  next();
}
const wrap = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (e) { next(e); } };

async function page(req, res, error) {
  res.set('Cache-Control', 'private, no-store');
  const user = req.session.user;
  let v = null;
  if (user && (!comp.isLive() || await comp.linked(user.id))) v = await comp.view(user.id);
  const nid = v && v.me ? (GAME_IDS[v.me.nation] || v.me.nation) : null, nation = NATIONS.find(n => n.id === nid) || null;
  const ev = require('../cue-events')().find(e => e.windows) || { windows: [] };
  const next = ev.windows.find(w => w.end > Date.now() / 1000) || null;
  let front = null, standing = null;
  try { const f = await require('../war-feed').front(); front = (f.editions || [])[0] || null; } catch (e) { /* no paper */ }
  try { const r = await require('../war-feed').report(); standing = nation ? (r.nations || []).find(n => n.id === nation.id) || null : null; } catch (e) { /* no report */ }
  res.render('new/war-office', { v, nation, next, front, standing, error: error || null });
}
router.get('/war-office', wrap((req, res) => page(req, res)));
router.post('/war-office/link', origin, wrap(async (req, res) => {
  if (!req.session.user) return res.redirect('/auth/discord?return=/war-office');
  try { await comp.link(req.session.user, req.body.code); res.redirect('/war-office'); }
  catch (e) { if (e instanceof comp.CompanionError) return page(req, res, e.message); throw e; }
}));
router.post('/war-office/unlink', origin, wrap(async (req, res) => {
  if (req.session.user) await comp.unlink(req.session.user.id);
  res.redirect('/war-office');
}));

module.exports = router;
