// /updates: what has changed in the modpack, one entry per official release to players (newest first), each listing
// what changed since the release before. Test events aren't recorded here. Open to anyone by its direct address only
// (linked from nowhere, no sitemap, noindex). An entry shows only once Alex publishes it from the control centre (site
// setting updates_published: the versions shown); until then it's seen only in the control centre's preview.
// Every pack Windows builds stays on the staff-only /staff/releases (server/data/releases.json); the full record is the
// vault's Changelog.
const express = require('express');
const router = express.Router();
const access = require('../access');
const RELEASES = () => require('../data/official-releases.json').releases;
const ALL = require('../data/releases.json');

async function published() {
  try { const v = JSON.parse((await access.getSetting('updates_published')) || '[]'); return new Set(Array.isArray(v) ? v : []); }
  catch (e) { return new Set(); }
}
const render = (res, releases) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.render('new/updates', { releases });
};

router.get('/updates', async (req, res, next) => {
  try {
    const on = await published();
    res.set('Cache-Control', 'public, max-age=60');
    render(res, RELEASES().filter(r => on.has(r.version)));
  } catch (e) { next(e); }
});

// the control centre's preview: the page exactly as players would see it with every entry published
router.get('/updates/preview', (req, res, next) => {
  if (!res.locals.isOwner) return next();
  res.set('Cache-Control', 'private, no-store');
  render(res, RELEASES());
});

router.get('/staff/releases', (req, res, next) => {
  if (!res.locals.isStaff) return next();
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' });
  res.render('new/staff-releases', { sections: ALL.sections });
});

module.exports = { router, RELEASES, published };
