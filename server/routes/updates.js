// /updates (S94, owner 21-22 Nov): only the big updates, under the names players know them by (Closed Alpha 1, Closed
// Alpha 2, Beta, Release 1.0), each written for players with the internal version in small print. Open to anyone,
// signed in or not, but only by its direct address: nothing on the site links to it, it's in no sitemap, and it's
// marked noindex. A post shows only once Alex publishes it (site setting updates_published, a list of post ids, set
// from the control centre); staff also see the drafts, marked. Nothing is posted anywhere else.
// Every small release stays staff-only at /staff/releases (server/data/releases.json); the full record is the vault.
const express = require('express');
const router = express.Router();
const access = require('../access');
const POSTS = require('../data/big-updates.json').posts;
const RELEASES = require('../data/releases.json');

async function published() {
  try { const v = JSON.parse((await access.getSetting('updates_published')) || '[]'); return new Set(Array.isArray(v) ? v : []); }
  catch (e) { return new Set(); }
}

router.get('/updates', async (req, res, next) => {
  try {
    const on = await published(), staff = !!res.locals.isStaff;
    const posts = POSTS.filter(p => on.has(p.id) || staff).map(p => Object.assign({}, p, { draft: !on.has(p.id) }));
    res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': staff ? 'private, no-store' : 'public, max-age=60' });
    res.render('new/updates', { posts, staff });
  } catch (e) { next(e); }
});

router.get('/staff/releases', (req, res, next) => {
  if (!res.locals.isStaff) return next();
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' });
  res.render('new/staff-releases', { sections: RELEASES.sections });
});

module.exports = { router, POSTS, published };
