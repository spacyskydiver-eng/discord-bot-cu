// VIP for the game servers, and the signed-in person's own Minecraft link and tier.
//   GET  /api/vip/:uuid        game servers only (X-CUE-Secret): { tier, expires }
//   GET  /api/me/minecraft     the signed-in person's link and tier
//   POST /api/me/minecraft     link or change their Minecraft account
// The control centre's tester for all of this is in routes/admin.js (/admin/vip).
const express = require('express');
const router = express.Router();
const vip = require('../vip');
const links = require('../minecraft-links');

router.get('/api/vip/:uuid', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!vip.secretOk(req.get('x-cue-secret'))) return res.status(401).json({ error: 'unauthorized' });
  if (!links.isUuid(req.params.uuid)) return res.status(400).json({ error: 'not a Minecraft UUID' });
  try {
    const r = await vip.lookup(req.params.uuid);
    res.json({ tier: r.tier, expires: r.expires });
  } catch (e) {
    // Discord unreachable: the server keeps what it had and asks again later
    console.error('[vip] lookup', e.message);
    res.status(503).set('Retry-After', '30').json({ error: 'discord unavailable' });
  }
});

function signedIn(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Sign in with Discord first.' });
  next();
}
function origin(req, res, next) {
  const o = req.get('origin');
  if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).json({ error: 'Forbidden' });
  next();
}

router.get('/api/me/minecraft', signedIn, async (req, res, next) => {
  try { res.set('Cache-Control', 'private, no-store').json(await vip.mine(req.session.user)); } catch (e) { next(e); }
});
router.post('/api/me/minecraft', origin, signedIn, async (req, res, next) => {
  try {
    const { link, previousUuid } = await links.link(req.session.user, (req.body || {}).name);
    vip.linkChanged(req.session.user.id, link.mc_uuid, previousUuid).catch(e => console.error('[vip] link changed', e.message));
    res.json(await vip.mine(req.session.user));
  } catch (e) {
    if (e instanceof links.LinkError) return res.status(400).json({ error: e.message });
    next(e);
  }
});

module.exports = router;
