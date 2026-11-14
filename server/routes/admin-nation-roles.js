// Owner page for nations on Discord (S24): the switch, the role ids, a preview, the log. Mounted under the owner-only
// control centre router.
const express = require('express');
const router = express.Router();
const access = require('../access');
const nr = require('../nation-roles');
const { NATIONS } = require('../nations');

function origin(req, res, next) {
  const o = req.get('origin');
  if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).end();
  next();
}
const wrap = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (e) { next(e); } };
const snowflake = v => /^\d{17,20}$/.test(String(v || '').trim()) ? String(v).trim() : null;

router.get('/', wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  let preview = null;
  if (req.query.preview === '1') { try { preview = await nr.plan(); } catch (e) { preview = { error: e.message }; } }
  res.render('new/admin-nation-roles', { mode: await nr.mode(), cfg: await nr.config(), NATIONS, log: await nr.recentLog(80), preview, msg: req.query.msg || null, feed: !!process.env.NATIONS_FEED_URL, MAX: nr.MAX_CHANGES });
}));
router.post('/mode', origin, wrap(async (req, res) => {
  const m = ['off', 'dry', 'on'].includes(req.body.mode) ? req.body.mode : 'off';
  await access.setSetting('nation_roles', m === 'off' ? null : m);
  res.redirect('/admin/nation-roles?msg=' + encodeURIComponent('Nation roles: ' + m));
}));
router.post('/config', origin, wrap(async (req, res) => {
  const b = req.body || {}, nations = {};
  const voice = {};
  NATIONS.forEach(n => { const v = snowflake(b['role_' + n.id]); if (v) nations[n.id] = v; const c = snowflake(b['voice_' + n.id]); if (c) voice[n.id] = c; });
  await access.setSetting('nation_roles_config', JSON.stringify({ nations, voice, leader: snowflake(b.role_leader), seat: snowflake(b.role_seat) }));
  res.redirect('/admin/nation-roles?msg=' + encodeURIComponent('Role ids saved.'));
}));

module.exports = router;
