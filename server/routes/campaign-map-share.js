// The campaign map's private share link: /campaign-map/s/<token> shows the board read-only to anyone who has the
// link (made and switched off by the owner on /admin/campaign-map). A wrong or switched-off token is a plain 404.
const express = require('express');
const campaignMap = require('../campaign-map');
const router = express.Router();

async function check(req, res, next) {
  try { if (await campaignMap.shareOk(req.params.token)) return next(); } catch (e) { console.error('[campaign-map share]', e.message); }
  res.status(404).type('text').send('Not found');
}
// a private link stays out of search engines and isn't passed on to other sites
const quiet = (req, res, next) => { res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }); next(); };

router.get('/campaign-map/s/:token', quiet, check, (req, res) => {
  res.render('new/admin-campaign-map', { viewer: true, dataUrl: `/campaign-map/s/${req.params.token}/data.json`, shareUrl: '', current: {}, msg: '', bad: false });
});
router.get('/campaign-map/s/:token/data.json', quiet, check, async (req, res) => {
  try { res.type('application/json').send(await campaignMap.load()); }
  catch (e) { res.status(500).json({ error: 'Could not load the campaign map.' }); }
});

module.exports = router;
