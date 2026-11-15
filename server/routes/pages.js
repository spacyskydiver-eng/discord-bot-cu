const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const db = require('../../db');
const access = require('../access');
const wiki = require('../wiki');
const testers = require('../testers');
const leaders = require('../leaders');
const staffApply = require('../staff-apply');
const vip = require('../vip');
const ARSENAL = require('../arsenal.config');

function formatDesc(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\n/g, '<br>');
}


db.query(`
  CREATE TABLE IF NOT EXISTS snake_scores (
    id SERIAL PRIMARY KEY,
    discord_id TEXT NOT NULL,
    discord_tag TEXT,
    discord_avatar TEXT,
    score INTEGER NOT NULL,
    saved_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});

const upcomingEvents = require('../cue-events');
const TEBEX = 'https://collective-union.tebex.io';
const ASSET_V = (process.env.RENDER_GIT_COMMIT || String(Date.now())).slice(0, 10);
const VAULT_PATH = path.join(__dirname, '../vault/vault.json');

// what a shared link to each of the app's own addresses shows (the rest are #/ routes, which a link preview can't see)
const APP_META = {
  '/wiki': ['The Great War: Field Manual', 'The player handbook for The Great War: nations, war windows, capturing nodes, money, gear and tanks.'],
  '/great-war-in-2-minutes': ['The Great War in 2 minutes', 'Everything you need to start playing The Great War, on one page: 8 nations, 174 nodes, six war windows and a Christmas Truce.'],
  '/builders': ['Builders\' catalogue: The Great War', 'Every decor block and the eight national building styles in The Great War, with what each is for.'],
  '/leaders-handbook': ['The Leader\'s handbook: The Great War', 'How to run a nation in The Great War: seats, alliances, war windows, orders, the treasury, incidents and research.'],
  '/first-hour': ['Your first hour: The Great War', 'New to The Great War? From installing the pack to your first fight, in eleven short steps.', '/img/pack/cover.jpg'],
  '/pack': ['Get the modpack: The Great War', 'Download The Great War modpack and install it on Windows or Mac in a few minutes.', '/img/pack/cover.jpg'],
  '/pack-faq': ['Modpack FAQ: The Great War', 'Specs, low frame rate, crashes, shaders and mods, and how to report a bug.', '/img/pack/cover.jpg'],
  '/testers': ['Become a tester: The Great War', 'Play a test battle of The Great War before the event, on Saturday 21 November.'],
  '/leaders': ['Lead a nation: The Great War', 'Apply to lead one of the eight nations of The Great War with your leadership team.'],
  '/staff-apply': ['Join the staff: The Great War', 'Apply to run The Great War as Event Staff, an Operator or an Event Creator.'],
  '/arsenal': ['The Arsenal: The Great War', 'The tanks, guns and gear of The Great War, in 3D.'],
  '/account': ['Your account · Collective Union Events', null],
};
async function renderApp(req, res) {
  const t = res.locals.t;
  let team = [];
  try {
    team = (await db.query(`SELECT title, pay, description FROM staff_roles ORDER BY display_order ASC, id ASC`)).rows;
  } catch (e) { console.error('[home] staff roles', e.message); }
  let applications = [];
  try {
    const ev = (await db.query(`SELECT title, is_open FROM events ORDER BY created_at DESC LIMIT 1`)).rows[0];
    if (ev && ev.is_open) applications = [{ title: ev.title, href: '/apply' }];
  } catch (e) { console.error('[home] events', e.message); }
  let testSessions = [];
  try {
    testSessions = (await testers.upcomingSessions()).filter(s => s.open)
      .map(s => ({ id: s.id, title: s.title, starts_at: s.starts_at, duration_minutes: s.duration_minutes, team_size: s.team_size, full: s.taken >= s.slots }));
  } catch (e) { console.error('[home] test sessions', e.message); }
  for (const s of testSessions) applications.push({ title: 'Tester: ' + s.title, detail: s.full ? 'Waitlist open' : 'Test battle, about an hour', view: 'testers' });
  try {
    const L = leaders.publicInfo();
    // a notice for anyone named in a leadership team who hasn't answered yet
    const inv = req.session.user ? (await leaders.invitations(req.session.user.id)).filter(i => i.status === 'pending') : [];
    for (const i of inv) applications.unshift({ title: `${i.leader} named you in their leadership team`, detail: 'Confirm or decline', view: 'leaders' });
    if (L.open) applications.push({ title: 'Lead a nation: The Great War', detail: 'Leader applications', view: 'leaders' });
  } catch (e) { console.error('[home] leaders', e.message); }
  if (staffApply.publicInfo().open) applications.push({ title: 'Join the staff: The Great War', detail: 'Event Staff, Operator or Event Creator', view: 'staff-apply' });
  // their VIP tier and Minecraft link, for the home banner and the account page
  let vipState = null;
  if (req.session.user) { try { vipState = await vip.mine(req.session.user); } catch (e) { console.error('[home] vip', e.message); } }
  // the chat level at which the bot gives the VIP role, if it does (level_roles)
  let vipLevel = null;
  try {
    vipLevel = (await db.query(`SELECT min(level_number) AS n FROM level_roles WHERE guild_id = $1 AND role_id = ANY($2)`, [vip.C.guildId, vip.C.roles.vip])).rows[0].n;
  } catch (e) { console.error('[home] vip level', e.message); }
  // the Arsenal's viewer and its settings, for everyone (the page falls back to Coming Soon only if the viewer
  // can't load)
  const arsenal = { viewer: '/assets/arsenal-viewer.js?v=' + ASSET_V, manifest: (await access.getSetting('arsenal_manifest_url')) || ARSENAL.manifestUrl, store: ARSENAL.store, tabs: ARSENAL.tabs, tanks: ARSENAL.tanks, stats: ARSENAL.stats };
  const playerWiki = wiki.getPlayer();
  const cue = {
    user: req.session.user ? { name: req.session.user.username } : null,
    isAdmin: !!res.locals.isOwner,
    vip: vipState,
    arsenal,
    discord: 'https://discord.gg/tF5hWxaQQj',
    events: upcomingEvents(),
    // "on this day in 1914": today's UK date
    onThisDay: require('../on-this-day').onThisDay(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())),
    pack: await require('../pack-release').publicInfo(),
    applications,
    team,
    testSessions,
    wikiModules: playerWiki.toc.filter(h => h.level === 2).map(h => ({ id: h.id, text: h.text })),
    // Tebex webstore: each rank adds its package to the basket and opens the checkout
    store: [
      { name: 'VIP', tier: 'vip', price: '$4.99', free: vipLevel ? t('store_vip_free').replace('{level}', vipLevel) : null, action: t('store_get') + ' VIP', buy: TEBEX + '/checkout/packages/add/7526228/single', features: [1, 2, 3, 4].map(i => t('store_vip_feat' + i)) },
      { name: 'VIP+', tier: 'vip_plus', price: '$9.99', action: t('store_get') + ' VIP+', buy: TEBEX + '/checkout/packages/add/7526241/single', features: [1, 2, 3].map(i => t('store_vipp_feat' + i)) },
    ],
    storeBasket: { label: t('store_basket'), url: TEBEX + '/checkout' },
    storeCheckoutNote: t('store_checkout_note'),
    storeSub: t('store_sub'),
    storeNote: t('store_cosmetic_note'),
  };
  const cueJson = JSON.stringify(cue).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
  res.set('Cache-Control', 'private, no-store');
  // staff get one extra script; nothing else in the page differs
  // without JavaScript the page can't show local times, so it says the time in UTC
  const utc = ts => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
      .formatToParts(ts * 1000).map(x => [x.type, x.value]));
    return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} UTC`;
  };
  const noscriptSessions = testSessions.map(s => ({ title: s.title, when: utc(s.starts_at) }));
  const [mt, md, mi] = APP_META[req.path] || [];
  const meta = { title: mt || 'Collective Union Events', description: md || undefined, image: mi, path: req.path };
  res.render('app', { meta, cueJson, v: ASSET_V, noscriptSessions, staffScript: res.locals.isStaff ? '/staff-assets/staff.js?v=' + ASSET_V : null });
}
router.get('/', renderApp);
router.get('/wiki', renderApp);
router.get('/testers', renderApp);
router.get('/great-war-in-2-minutes', renderApp);
router.get('/great-war/windows.ics', (req, res) => {
  res.set('Content-Disposition', 'attachment; filename="great-war-windows.ics"').type('text/calendar; charset=utf-8').send(upcomingEvents.windowsIcs());
});
router.get('/pack', renderApp);
router.get('/first-hour', renderApp);
router.get('/leaders-handbook', renderApp);
router.get('/builders', renderApp);
router.get('/pack-faq', renderApp);
router.get('/download/:file', (req, res, next) => require('../pack-release').serve(req, res, next));
router.get('/leaders', renderApp);
router.get('/staff-apply', renderApp);
router.get('/account', renderApp);
router.get('/arsenal', renderApp);

router.get('/data/vault.json', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  const vault = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
  vault.wikiGraph = wikiGraph(wiki.getPlayer().toc);
  res.json(vault);
});

// the player wiki (Field Manual): public, like the rest of the site
router.get('/api/wiki/player', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(wiki.getPlayer());
});

// the staff wiki (Design Document): GW Staff and the owner only. Anyone else gets the same
// 404 as a page that doesn't exist.
router.get('/api/wiki/staff', async (req, res, next) => {
  if (!res.locals.isStaff) return next();
  res.set('Cache-Control', 'private, no-store');
  try { res.json(await wiki.getStaff()); } catch (e) { console.error('[wiki]', e.message); res.status(503).json({ error: 'The staff wiki is not available right now.' }); }
});
// The Arsenal's viewer, for everyone (it was a staff preview until the page opened); cached by its ?v.
router.get('/assets/arsenal-viewer.js', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('application/javascript').sendFile(path.join(__dirname, '../staff-assets/arsenal-viewer.js'));
});
router.get('/staff-assets/staff.js', (req, res, next) => {
  if (!res.locals.isStaff) return next();
  res.set('Cache-Control', 'private, no-store');
  res.type('application/javascript').sendFile(path.join(__dirname, '../staff-assets/staff.js'));
});

// sections as a graph for the neural map in the background: each module and section is a node,
// linked to the heading it sits under
function wikiGraph(toc) {
  const nodes = [], links = [], parents = [];
  for (const h of toc) {
    if (h.level > 4 || !/^\d+(-\d+)*$/.test(h.id)) continue;
    nodes.push({ id: 'wiki#' + h.id, title: h.text, module: h.id.split('-')[0], level: h.level });
    parents[h.level] = 'wiki#' + h.id;
    for (let l = h.level - 1; l >= 2; l--) if (parents[l]) { links.push(['wiki#' + h.id, parents[l]]); break; }
  }
  return { nodes, links };
}

router.post('/snake/score', async (req, res) => {
  const score = parseInt(req.body.score);
  if (isNaN(score) || score < 1) return res.json({ ok: false });
  const id  = req.session.user ? req.session.user.id       : 'guest';
  const tag = req.session.user ? req.session.user.username : 'Guest';
  const av  = req.session.user ? (req.session.user.avatar || null) : null;
  await db.query(
    `INSERT INTO snake_scores (discord_id, discord_tag, discord_avatar, score) VALUES ($1,$2,$3,$4)`,
    [id, tag, av, score]
  );
  res.json({ ok: true });
});

router.get('/snake/leaderboard', async (req, res) => {
  const rows = (await db.query(`
    SELECT DISTINCT ON (discord_id) discord_id, discord_tag, score, saved_at
    FROM snake_scores ORDER BY discord_id, score DESC
  `)).rows;
  rows.sort((a, b) => b.score - a.score);
  // names and scores only: no Discord ids or avatar links (which carry the id) for anyone who asks (S74)
  res.json(rows.slice(0, 10).map(r => ({ discord_tag: r.discord_tag, score: r.score, saved_at: r.saved_at })));
});

router.get('/staff', (req, res) => res.redirect('/#/team'));
router.get('/rules', (req, res) => res.render('rules'));
// browsers ask for this on pages that don't name an icon
router.get('/favicon.ico', (req, res) => res.redirect(301, '/assets/favicon.svg'));
router.get('/legal', (req, res) => res.render('new/legal'));

// ── New design routes (designPreview only) ──────────────────────────────────

// Old standalone pages now live inside the app at /
router.get('/events', (req, res) => res.redirect('/#/events'));
router.get('/events/:id', (req, res) => res.redirect('/#/events'));

router.get('/applications', (req, res) => res.redirect('/#/applications'));

router.get('/my-application', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const eventRes = await db.query(`SELECT * FROM events ORDER BY created_at DESC LIMIT 1`);
  const event = eventRes.rows[0] || null;
  const appRes = await db.query(
    `SELECT * FROM structured_applications WHERE discord_id = $1`,
    [req.session.user.id]
  );
  const app = appRes.rows[0] || null;
  if (!app) return res.redirect(`${res.locals.lp}/applications`);
  res.render('new/my-application', { app, event, updated: req.query.updated === '1' });
});

router.get('/my-application/edit', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const appRes = await db.query(
    `SELECT * FROM structured_applications WHERE discord_id = $1`,
    [req.session.user.id]
  );
  const app = appRes.rows[0] || null;
  if (!app || !app.edit_approved) return res.redirect(`${res.locals.lp}/my-application`);
  const eventRes = await db.query(`SELECT * FROM events ORDER BY created_at DESC LIMIT 1`);
  const event = eventRes.rows[0] || null;
  const playstyleOptions = (await db.query(
    `SELECT * FROM playstyle_options ORDER BY display_order ASC, id ASC`
  )).rows;
  const stageSettingsRows = (await db.query(`SELECT * FROM stage_settings`)).rows;
  const stageSettings = {};
  for (const r of stageSettingsRows) {
    if (!stageSettings[r.stage_number]) stageSettings[r.stage_number] = {};
    stageSettings[r.stage_number][r.field_key] = r.field_value;
  }
  res.render('new/my-application-edit', {
    app, event, playstyleOptions, stageSettings,
    error: req.query.error || null
  });
});

router.post('/my-application/request-edit', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  await db.query(
    `UPDATE structured_applications
       SET edit_requested = true, edit_requested_at = NOW()
     WHERE discord_id = $1 AND edit_requested = false AND status != 'declined'`,
    [req.session.user.id]
  );
  res.redirect(`${res.locals.lp}/my-application`);
});

router.get('/my-application/edit-sessions', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const appRes = await db.query(
    `SELECT * FROM structured_applications WHERE discord_id = $1`,
    [req.session.user.id]
  );
  const app = appRes.rows[0] || null;
  if (!app || app.status === 'declined' || app.status === 'withdrawn') {
    return res.redirect(`${res.locals.lp}/my-application`);
  }
  function parseJsonField(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { return JSON.parse(v) || []; } catch (_) { return []; }
  }
  const existingSessAvail = parseJsonField(app.session_availability);
  res.render('new/my-application-edit-sessions', { app, existingSessAvail });
});

router.post('/my-application/update-sessions', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const existing = (await db.query(
    `SELECT id, status FROM structured_applications WHERE discord_id = $1`,
    [req.session.user.id]
  )).rows[0];
  if (!existing || existing.status === 'declined' || existing.status === 'withdrawn') {
    return res.redirect(`${res.locals.lp}/my-application`);
  }
  let jsonSessionAvail = null;
  try {
    const parsed = JSON.parse(req.body.session_availability || 'null');
    if (parsed !== null) jsonSessionAvail = JSON.stringify(parsed);
  } catch (_) {}
  await db.query(
    `UPDATE structured_applications SET session_availability = $1 WHERE discord_id = $2`,
    [jsonSessionAvail, req.session.user.id]
  );
  res.redirect(`${res.locals.lp}/my-application?updated=1`);
});

router.post('/my-application/withdraw', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  await db.query(
    `UPDATE structured_applications SET status = 'withdrawn'
     WHERE discord_id = $1 AND status NOT IN ('declined', 'accepted', 'withdrawn')`,
    [req.session.user.id]
  );
  res.redirect(`${res.locals.lp}/applications`);
});

// ── 150 Player Event: my application ─────────────────────────────────────────

function parseJsonFieldH(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v) || []; } catch (_) { return []; }
}

router.get('/my-application-hundred', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const appRes = await db.query(
    `SELECT * FROM hundred_applications WHERE discord_id = $1`, [req.session.user.id]
  );
  const app = appRes.rows[0] || null;
  if (!app) return res.redirect(`${res.locals.lp}/apply-hundred`);
  res.render('new/my-application-hundred', { app, updated: req.query.updated === '1' });
});

router.get('/my-application-hundred/edit', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const appRes = await db.query(
    `SELECT * FROM hundred_applications WHERE discord_id = $1`, [req.session.user.id]
  );
  const app = appRes.rows[0] || null;
  if (!app || !app.edit_approved) return res.redirect(`${res.locals.lp}/my-application-hundred`);
  res.render('new/my-application-hundred-edit', { app, error: req.query.error || null });
});

router.post('/my-application-hundred/update', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const existing = (await db.query(
    `SELECT id, edit_approved FROM hundred_applications WHERE discord_id = $1`, [req.session.user.id]
  )).rows[0];
  if (!existing || !existing.edit_approved) return res.redirect(`${res.locals.lp}/my-application-hundred`);
  const { ign, discord_username, country, prev_events, playstyle_desc, why_join, friend_requests } = req.body;
  if (!ign || !discord_username || !country || !playstyle_desc || !why_join) {
    return res.redirect(`${res.locals.lp}/my-application-hundred/edit?error=incomplete`);
  }
  await db.query(
    `UPDATE hundred_applications SET
       ign = $1, discord_username_input = $2, country = $3,
       prev_events = $4, playstyle_desc = $5, why_join = $6, friend_requests = $7,
       edit_requested = false, edit_approved = false, edit_requested_at = NULL
     WHERE discord_id = $8`,
    [ign.trim(), discord_username.trim(), country.trim(),
     prev_events?.trim() || null, playstyle_desc.trim(), why_join.trim(), friend_requests?.trim() || null,
     req.session.user.id]
  );
  res.redirect(`${res.locals.lp}/my-application-hundred?updated=1`);
});

router.post('/my-application-hundred/request-edit', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  await db.query(
    `UPDATE hundred_applications
       SET edit_requested = true, edit_requested_at = NOW()
     WHERE discord_id = $1 AND edit_requested = false AND status != 'declined'`,
    [req.session.user.id]
  );
  res.redirect(`${res.locals.lp}/my-application-hundred`);
});

router.get('/my-application-hundred/edit-sessions', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const appRes = await db.query(
    `SELECT * FROM hundred_applications WHERE discord_id = $1`, [req.session.user.id]
  );
  const app = appRes.rows[0] || null;
  if (!app || app.status === 'declined' || app.status === 'withdrawn') {
    return res.redirect(`${res.locals.lp}/my-application-hundred`);
  }
  const existingSessAvail = parseJsonFieldH(app.session_availability);
  res.render('new/my-application-hundred-edit-sessions', { app, existingSessAvail });
});

router.post('/my-application-hundred/update-sessions', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const existing = (await db.query(
    `SELECT id, status FROM hundred_applications WHERE discord_id = $1`, [req.session.user.id]
  )).rows[0];
  if (!existing || existing.status === 'declined' || existing.status === 'withdrawn') {
    return res.redirect(`${res.locals.lp}/my-application-hundred`);
  }
  let jsonSess = null;
  try {
    const parsed = JSON.parse(req.body.session_availability || 'null');
    if (parsed !== null) jsonSess = JSON.stringify(parsed);
  } catch (_) {}
  await db.query(
    `UPDATE hundred_applications SET session_availability = $1 WHERE discord_id = $2`,
    [jsonSess, req.session.user.id]
  );
  res.redirect(`${res.locals.lp}/my-application-hundred?updated=1`);
});

router.post('/my-application-hundred/withdraw', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  // Delete the row entirely so the user can reapply from scratch
  await db.query(
    `DELETE FROM hundred_applications
     WHERE discord_id = $1 AND status NOT IN ('declined', 'accepted')`,
    [req.session.user.id]
  );
  res.redirect(`${res.locals.lp}/applications`);
});

router.get('/wiki', (req, res) => res.redirect('/#/' + encodeURI('01 Events/The Great War/The Great War')));
router.get('/store', (req, res) => res.redirect('/#/store'));

router.post('/store/checkout', async (req, res) => {
  const { package_id } = req.body;
  if (!package_id) return res.status(400).json({ error: 'Missing package' });

  const IDENT = process.env.TEBEX_PUBLIC_TOKEN;
  const base = `https://headless.tebex.io/api/accounts/${IDENT}`;
  const host = `${req.protocol}://${req.get('host')}`;

  try {
    const basketRes = await fetch(`${base}/baskets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        return_url: `${host}/store`,
        complete_url: `${host}/store?success=1`
      })
    });
    const basketData = await basketRes.json();
    const basketIdent = basketData.data?.ident;
    if (!basketIdent) return res.status(500).json({ error: 'Could not create basket', detail: basketData });

    await fetch(`${base}/baskets/${basketIdent}/packages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: parseInt(package_id), quantity: 1 })
    });

    const checkoutUrl = basketData.data?.links?.checkout;
    res.json({ checkout_url: checkoutUrl });
  } catch (err) {
    console.error('Tebex checkout error:', err);
    res.status(500).json({ error: 'Checkout unavailable, please try again' });
  }
});

// Design preview toggle — only works for admins
router.get('/design-preview/on', (req, res) => {
  if (access.isOwner(req.session.user)) {
    req.session.designPreview = true;
  }
  res.redirect(req.query.return || '/');
});

router.get('/design-preview/off', (req, res) => {
  req.session.designPreview = false;
  res.redirect(req.query.return || '/');
});

// Experimental internal tool — accessible only via direct link
// The warmup event's mining-region spec (S74): it gives each region's world coordinates, so staff only (it was public
// from 18 Aug to 15 Nov 2026, and also as a static file). Anyone else gets the same 404 as an unknown URL.
router.get('/tools/mining-regions', (req, res, next) => {
  if (!res.locals.isStaff) return next();
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(path.join(__dirname, '../staff-assets/mining-regions.html'));
});

// ── 150 Player Event: session availability (no login required, linked via DM) ──

router.get('/150-availability', async (req, res) => {
  const uid = req.query.uid || null;
  let app = null;
  if (uid) {
    const r = await db.query(
      `SELECT id, status, session_availability, ign, discord_tag FROM hundred_applications WHERE discord_id = $1`,
      [uid]
    );
    app = r.rows[0] || null;
  }
  res.render('new/event-availability', { uid, app, query: req.query });
});

router.post('/150-availability/submit', async (req, res) => {
  const uid = req.body.uid;
  if (!uid) return res.redirect('/150-availability?error=invalid');
  let sessions = req.body.sessions;
  try { sessions = JSON.parse(sessions); } catch(_) { sessions = []; }
  if (!Array.isArray(sessions)) sessions = [];
  sessions = sessions.map(Number).filter(n => n >= 1 && n <= 6);
  await db.query(
    `UPDATE hundred_applications SET session_availability=$1 WHERE discord_id=$2`,
    [JSON.stringify(sessions), uid]
  );
  res.redirect('/my-application-hundred');
});

router.post('/150-availability/withdraw', async (req, res) => {
  const uid = req.body.uid;
  if (!uid) return res.redirect('/150-availability?error=invalid');
  await db.query(
    `UPDATE hundred_applications SET status='withdrawn', session_availability='[]'::jsonb WHERE discord_id=$1`,
    [uid]
  );
  res.redirect('/my-application-hundred');
});

// ── 150 Player Event: IGN verification (no login required, linked via DM) ──

router.get('/150-verify-ign', async (req, res) => {
  const uid = req.query.uid || null;
  let app = null;
  let appSource = null;
  if (uid) {
    const r = await db.query(`SELECT * FROM hundred_applications WHERE discord_id = $1`, [uid]);
    if (r.rows[0]) { app = r.rows[0]; appSource = 'hundred'; }
    else {
      const r2 = await db.query(`SELECT * FROM nation_leader_applications WHERE discord_id = $1 AND accepted = true`, [uid]);
      if (r2.rows[0]) { app = r2.rows[0]; appSource = 'nation'; }
    }
  }
  res.render('new/verify-ign', { app, appSource, error: req.query.error || null, saved: req.query.saved === '1' });
});

router.post('/150-verify-ign/submit', async (req, res) => {
  const uid = req.body.uid;
  const appSource = req.body.app_source;
  const ign = (req.body.ign || '').trim();
  if (!uid || !ign) return res.redirect('/150-verify-ign?uid=' + encodeURIComponent(uid || '') + '&error=invalid');

  // Validate via Mojang API
  let valid = false;
  try {
    const mojangRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(ign)}`);
    if (mojangRes.status === 200) {
      valid = true;
    } else if (mojangRes.status === 404 || mojangRes.status === 204) {
      valid = false;
    } else {
      return res.redirect('/150-verify-ign?uid=' + encodeURIComponent(uid) + '&error=server');
    }
  } catch (_) {
    return res.redirect('/150-verify-ign?uid=' + encodeURIComponent(uid) + '&error=server');
  }

  if (!valid) {
    return res.redirect('/150-verify-ign?uid=' + encodeURIComponent(uid) + '&error=invalid');
  }

  if (appSource === 'nation') {
    await db.query(
      `UPDATE nation_leader_applications SET ign = $1, ign_verified = true WHERE discord_id = $2`,
      [ign, uid]
    );
  } else {
    await db.query(
      `UPDATE hundred_applications SET ign = $1, ign_verified = true WHERE discord_id = $2`,
      [ign, uid]
    );
  }
  res.redirect('/');
});

// ── Nation location picker (linked via DM to nation leaders) ──────────────────

router.get('/nation-place', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const uid = req.session.user.id;
  const isAdmin = access.isOwner(req.session.user);

  const r = await db.query(
    `SELECT * FROM nation_leader_applications WHERE discord_id = $1 AND accepted = true`, [uid]
  );
  const nation = r.rows[0] || null;
  if (!nation && !isAdmin) return res.redirect('/applications');

  const allRes = await db.query(
    `SELECT server_name, map_x, map_z FROM nation_leader_applications
     WHERE accepted = true${nation ? ' AND discord_id != $1' : ''} ORDER BY server_name ASC`,
    nation ? [uid] : []
  );
  const otherMarkers = allRes.rows.filter(n => n.map_x != null);
  const waiting      = allRes.rows.filter(n => n.map_x == null);
  const regionsRes   = await db.query(`SELECT x1,z1,x2,z2,name FROM mining_regions ORDER BY id ASC`);
  res.render('new/nation-place', {
    nation: nation || { server_name: 'Admin Overview', map_x: null, map_z: null, discord_id: uid },
    otherMarkers, waiting,
    miningRegions: regionsRes.rows,
    adminOverview: !nation && isAdmin,
    placementOpen: process.env.NATION_PLACE_OPEN !== 'false'
  });
});

router.post('/nation-place/submit', async (req, res) => {
  if (process.env.NATION_PLACE_OPEN === 'false') return res.redirect('/nation-place');
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const uid = req.session.user.id;
  const map_x = parseInt(req.body.map_x);
  const map_z = parseInt(req.body.map_z);
  if (isNaN(map_x) || isNaN(map_z)) return res.redirect('/nation-place');
  if (map_x < -2560 || map_x > 2560 || map_z < -2560 || map_z > 2560) return res.redirect('/nation-place');
  await db.query(
    `UPDATE nation_leader_applications SET map_x = $1, map_z = $2 WHERE discord_id = $3 AND accepted = true`,
    [map_x, map_z, uid]
  );
  res.redirect('/nation-place');
});

router.post('/nation-place/clear', async (req, res) => {
  if (process.env.NATION_PLACE_OPEN === 'false') return res.redirect('/nation-place');
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const uid = req.session.user.id;
  await db.query(
    `UPDATE nation_leader_applications SET map_x = NULL, map_z = NULL WHERE discord_id = $1 AND accepted = true`,
    [uid]
  );
  res.redirect('/nation-place');
});

// The public campaign map: anyone can view it, signed in or not. Its data comes from its own endpoint, which serves
// only the public cut of the map (server/campaign-map.js publicMap), never the owner's file.
router.get('/map', (req, res) => {
  res.render('new/admin-campaign-map', { pub: true, v: ASSET_V, dataUrl: '/map/data.json', shareUrl: '', current: {}, msg: '', bad: false });
});
// the war for people who aren't online: the War Report and the Daily Front (server/war-feed.js)
async function warPage(req, res, next, page) {
  try {
    const feed = require('../war-feed'), N = require('../nations').NATIONS;
    const [report, front, m] = await Promise.all([feed.report(), page === 'front' ? feed.front() : null, require('../campaign-map').loadPublic().then(JSON.parse)]);
    const names = Object.fromEntries(m.territories.map(t => [t.id, t.name]));
    const nat = id => { const n = N.find(x => x.id === id) || { name: id, slug: '', flag: '' }; return Object.assign({ short: n.name.replace(/^The /, '') }, n); };
    const nodeName = id => names[id] || id;
    const said = e => ({
      capture: () => `${nat(e.to).short} took ${nodeName(e.node)} from ${nat(e.from).short}`,
      capital_lost: () => `${nat(e.from).short} lost its capital, ${nodeName(e.node)}`,
      capital_retaken: () => `${nat(e.to).short} retook its capital, ${nodeName(e.node)}`,
      wiped: () => `${nat(e.a).short} was wiped out`,
      war_declared: () => `${nat(e.a).short} marked ${nat(e.b).short} as an enemy`,
      war_begun: () => `War began between ${nat(e.a).short} and ${nat(e.b).short}`,
      peace: () => `${nat(e.a).short} and ${nat(e.b).short} made peace`,
      alliance: () => `${nat(e.a).short} and ${nat(e.b).short} became allies`,
      alliance_broken: () => `The alliance of ${nat(e.a).short} and ${nat(e.b).short} ended`,
    }[e.kind] || (() => e.kind))();
    res.render('new/war', { page, report, front, sample: !!report.sample, nat, nodeName, said, onThisDay: require('../on-this-day').onThisDay });
  } catch (e) { next(e); }
}
router.get('/war', (req, res, next) => warPage(req, res, next, 'report'));
router.get('/daily-front', (req, res, next) => warPage(req, res, next, 'front'));

// the 17 Dec launch page: an owner-only draft until site setting launch_public is "on" (S22)
const LAUNCH_DISCORD = `**THE GREAT WAR · from Thursday 17 December**

Europe, 1914. Eight nations. 174 nodes. Up to 500 players. Two weeks of war, on custom-made mods.

There's no official winner: the story is whatever the nations make of it.
- **Fighters:** six war windows, 19:00 to 22:00 UK time, and a Christmas Truce on 25 Dec. Rifles, machine guns, tanks, ranks and medals.
- **Builders:** trenches and wire decide the next window, and your nation pays you to dig them.
- **Role-players:** a Leader and eight seats, letters between nations, and the Daily Front newspaper.
- **Traders:** mines, farms, oil, stalls and the factories that feed the war.
- **Leaders:** taxes, research, alliances and wars. Leader applications are open.
- **New to modded Minecraft?** Your first hour, step by step: https://cuevents.xyz/first-hour

Apply: https://cuevents.xyz/apply
Everything in 2 minutes: https://cuevents.xyz/great-war-in-2-minutes
The map: https://cuevents.xyz/map

Pick your side.`;
router.get('/the-great-war', async (req, res, next) => {
  try {
    const isPublic = (await access.getSetting('launch_public')) === 'on';
    if (!isPublic && !res.locals.isOwner) return next();
    res.set('Cache-Control', isPublic ? 'public, max-age=300' : 'private, no-store');
    res.render('new/launch', { isPublic, discord: LAUNCH_DISCORD, nations: require('../nations').NATIONS, windows: (upcomingEvents().find(e => e.windows) || {}).windows || [] });
  } catch (e) { next(e); }
});

// S46: what's new for 17 December: a draft, owner-only until the site setting whats_new_public is 'on'
router.get('/whats-new', async (req, res, next) => {
  try {
    const isPublic = (await access.getSetting('whats_new_public')) === 'on';
    if (!isPublic && !res.locals.isOwner) return next();
    res.set('Cache-Control', isPublic ? 'public, max-age=300' : 'private, no-store');
    res.render('new/whats-new', { isPublic });
  } catch (e) { next(e); }
});

router.post('/whats-new/public', async (req, res, next) => {
  try {
    if (!res.locals.isOwner) return res.status(403).end();
    const o = req.get('origin');
    if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).end();
    await access.setSetting('whats_new_public', req.body.public === 'on' ? 'on' : null);
    res.redirect('/whats-new');
  } catch (e) { next(e); }
});

// S67: the testers' guide for 21 Nov: hidden, owner-only until the site setting testers_guide_public is 'on'
router.get('/tester-guide', async (req, res, next) => {
  try {
    const isPublic = (await access.getSetting('testers_guide_public')) === 'on';
    if (!isPublic && !res.locals.isOwner) return next();
    res.set('Cache-Control', isPublic ? 'public, max-age=300' : 'private, no-store');
    res.render('new/tester-guide', { isPublic });
  } catch (e) { next(e); }
});

router.post('/tester-guide/public', async (req, res, next) => {
  try {
    if (!res.locals.isOwner) return res.status(403).end();
    const o = req.get('origin');
    if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).end();
    await access.setSetting('testers_guide_public', req.body.public === 'on' ? 'on' : null);
    res.redirect('/tester-guide');
  } catch (e) { next(e); }
});

// S66: credits (the map's author, Mojang's textures, the carol): hidden, owner-only until the site setting credits_public is 'on'
router.get('/credits', async (req, res, next) => {
  try {
    const isPublic = (await access.getSetting('credits_public')) === 'on';
    if (!isPublic && !res.locals.isOwner) return next();
    res.set('Cache-Control', isPublic ? 'public, max-age=300' : 'private, no-store');
    res.render('new/credits', { isPublic });
  } catch (e) { next(e); }
});

router.post('/credits/public', async (req, res, next) => {
  try {
    if (!res.locals.isOwner) return res.status(403).end();
    const o = req.get('origin');
    if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).end();
    await access.setSetting('credits_public', req.body.public === 'on' ? 'on' : null);
    res.redirect('/credits');
  } catch (e) { next(e); }
});

// S71: The Front, a page per 1914 region of the war map (history, owner, neighbours, what it's known for; no values or
// coordinates): hidden, owner-only until the site setting front_public is 'on'
const FRONT = require('../data/front-regions.json');
async function renderFront(req, res, next) {
  try {
    const isPublic = (await access.getSetting('front_public')) === 'on';
    if (!isPublic && !res.locals.isOwner) return next();
    const region = req.params.id ? FRONT.regions.find(r => r.id === req.params.id) : null;
    if (req.params.id && !region) return res.redirect('/front');
    res.set('Cache-Control', isPublic ? 'public, max-age=300' : 'private, no-store');
    const nations = require('../nations').NATIONS;
    res.render('new/front', { isPublic, front: FRONT, region, nations });
  } catch (e) { next(e); }
}
router.get('/front', renderFront);
router.get('/front/:id', renderFront);
router.post('/front/public', async (req, res, next) => {
  try {
    if (!res.locals.isOwner) return res.status(403).end();
    const o = req.get('origin');
    if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).end();
    await access.setSetting('front_public', req.body.public === 'on' ? 'on' : null);
    res.redirect('/front');
  } catch (e) { next(e); }
});

// Who holds each node now, from the game's public war feed, or null until the feed is live (never sample data). No free
// intel: while a window is open, a capture only shows 10 minutes after it happened (or at the close).
async function delayedOwners() {
  const feed = require('../war-feed');
  if (!feed.isLive()) return null;
  try {
    const r = await feed.report(), own = Object.assign({}, r.owners || {});
    if (r.windowOpen) (r.events || []).filter(e => e.kind === 'capture' && e.at > (r.now || Date.now()) - 10 * 60 * 1000).sort((x, y) => y.at - x.at).forEach(e => { own[e.node] = e.from; });
    return own;
  } catch (e) { console.error('[map] war feed', e.message); return null; }
}

// S72: the war map: the 174 regions coloured by owner (1914 until the war feed is live, then who holds what, delayed as
// above), nation filters, each region linking to The Front while that is visible. Hidden, owner-only until war_map_public.
async function warMapVisible(res) { return res.locals.isOwner || (await access.getSetting('war_map_public')) === 'on'; }
router.get('/war-map', async (req, res, next) => {
  try {
    if (!(await warMapVisible(res))) return next();
    const isPublic = (await access.getSetting('war_map_public')) === 'on';
    const frontOn = res.locals.isOwner || (await access.getSetting('front_public')) === 'on';
    const regions = FRONT.regions.map(r => ({ id: r.id, name: r.name, owner: r.owner, theatre: r.theatre, capital: !!r.capital, shape: r.shape }));
    res.set('Cache-Control', isPublic ? 'public, max-age=300' : 'private, no-store');
    res.render('new/war-map', { isPublic, frontOn, regions, width: FRONT.width, height: FRONT.height, nations: require('../nations').NATIONS });
  } catch (e) { next(e); }
});
router.get('/war-map/owners.json', async (req, res, next) => {
  try {
    if (!(await warMapVisible(res))) return next();
    const own = await delayedOwners();
    const owners = {};
    if (own) FRONT.regions.forEach(r => { if (own[r.id]) owners[r.id] = String(own[r.id]); });
    res.set('Cache-Control', 'private, max-age=60').json({ live: !!own, owners, at: Date.now() });
  } catch (e) { next(e); }
});
router.post('/war-map/public', async (req, res, next) => {
  try {
    if (!res.locals.isOwner) return res.status(403).end();
    const o = req.get('origin');
    if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).end();
    await access.setSetting('war_map_public', req.body.public === 'on' ? 'on' : null);
    res.redirect('/war-map');
  } catch (e) { next(e); }
});

// public service records: /soldier?name=X redirects to /soldier/X
router.get('/soldier', (req, res) => {
  const q = String(req.query.name || '').trim();
  if (q) return res.redirect('/soldier/' + encodeURIComponent(q));
  res.render('new/soldier', { rec: null, account: null, fights: [] });
});
// S52: the front-line wager: the fallen's season table and the last window (nobody's calls)
router.get('/wager', async (req, res, next) => {
  try {
    const v = await require('../wager').view();
    res.set('Cache-Control', 'public, max-age=60');
    res.render('new/wager', v);
  } catch (e) { next(e); }
});
// S45: the market board: open stalls by nation (no coordinates)
router.get('/market', async (req, res, next) => {
  try {
    const v = await require('../market').view();
    res.set('Cache-Control', 'public, max-age=60');
    res.render('new/market', v);
  } catch (e) { next(e); }
});

// S40: a soldier's night as a shareable card: /night/<name> (the latest window) or /night/<name>/<window>
async function nightPage(req, res, next) {
  const q = String(req.params.name || '').trim(), w = Math.max(0, Math.min(60, parseInt(req.params.window, 10) || 0));
  try {
    const nc = require('../night-card');
    const found = await nc.lookup(q, w, req.session && req.session.user ? req.session.user.id : null);
    if (!found) return res.status(404).render('new/night', { q, card: null, notice: `"${q}" isn't a Minecraft Java account.` });
    if (!found.card) return res.status(404).render('new/night', { q, card: null, notice: `No card yet for ${found.account.name}${w ? ' in window ' + w : ''}.` });
    res.set('Cache-Control', found.card.own ? 'private, no-store' : 'public, max-age=60');
    res.render('new/night', { q: found.account.name, card: found.card, summary: nc.summary(found.card), path: req.path });
  } catch (e) {
    if (/Mojang/.test(e.message)) return res.status(503).render('new/night', { q, card: null, notice: "We couldn't look that name up just now. Please try again in a minute." });
    next(e);
  }
}
router.get('/night/:name', nightPage);
router.get('/night/:name/:window', nightPage);

router.get('/soldier/:name', async (req, res, next) => {
  const q = String(req.params.name || '').trim();
  try {
    const found = await require('../service-records').lookup(q);
    if (!found) return res.status(404).render('new/soldier', { q, rec: null, notice: `"${q}" isn't a Minecraft Java account.`, fights: [] });
    if (!found.record) {
      const like = await require('../service-records').search(q); // S-own-12: soldiers with names like it
      return res.status(404).render('new/soldier', { q, rec: null, notice: `${found.account.name} hasn't served in The Great War yet.`, fights: [], like });
    }
    // notable fights: Daily Front stories that name them
    let fights = [];
    try {
      const front = await require('../war-feed').front();
      const re = new RegExp('\\b' + found.account.name.replace(/[^\w]/g, '') + '\\b', 'i');
      (front.editions || []).forEach(ed => (ed.articles || []).forEach(a => { if (re.test(a.title + ' ' + a.body)) fights.push({ day: ed.day, title: a.title, body: a.body }); }));
    } catch (e) { /* the paper isn't there: no fights listed */ }
    res.set('Cache-Control', 'public, max-age=60');
    res.render('new/soldier', { q: found.account.name, rec: found.record, account: found.account, fights: fights.slice(0, 8) });
  } catch (e) {
    if (/Mojang/.test(e.message)) return res.status(503).render('new/soldier', { q, rec: null, notice: "We couldn't look that name up just now. Please try again in a minute.", fights: [] });
    next(e);
  }
});

// the nation welcome (meeting 2): where the welcome DM points a newly assigned player
router.get('/welcome/:slug', async (req, res, next) => {
  try {
    const n = require('../nations').NATIONS.find(x => x.slug === req.params.slug);
    if (!n) return next();
    const cfg = await require('../nation-roles').config();
    const voice = cfg.voice && cfg.voice[n.id] ? `https://discord.com/channels/1449004906068312189/${cfg.voice[n.id]}` : null;
    const ev = upcomingEvents().find(e => e.windows) || { windows: [] };
    const upcoming = ev.windows.find(w => w.end > Date.now() / 1000) || null;
    res.render('new/welcome', { n, voice, next: upcoming, leader: await require('../nation-roles').leaderName(n.id).catch(() => null) });
  } catch (e) { next(e); }
});

// the eight nations' public pages
router.get('/nations', async (req, res, next) => {
  try { res.render('new/nations', { nations: await require('../nations').withMap(), nation: null, rallying: await require('../comeback').rallying() }); } catch (e) { next(e); }
});
router.get('/nations/:slug', async (req, res, next) => {
  try {
    const all = await require('../nations').withMap();
    const nation = all.find(n => n.slug === req.params.slug || n.id === req.params.slug);
    if (!nation) return res.redirect('/nations');
    // S-own-19: the nation's 1914 regions, linked to The Front, only while The Front is visible to this viewer
    const frontOn = res.locals.isOwner || (await access.getSetting('front_public')) === 'on';
    const frontRegions = frontOn ? FRONT.regions.filter(r => r.owner === nation.id).map(r => ({ id: r.id, name: r.name })).sort((x, y) => x.name.localeCompare(y.name)) : [];
    res.render('new/nations', { nations: all, nation, frontRegions, rallying: await require('../comeback').rallying() });
  } catch (e) { next(e); }
});
router.get('/map/data.json', async (req, res) => {
  try {
    let body = await require('../campaign-map').loadPublic();
    // once the game's war feed is live, the public map shows who holds each node now (never with sample data)
    const own = await delayedOwners();
    if (own) { const m = JSON.parse(body); m.territories.forEach(t => { if (own[t.id]) t.owner = own[t.id]; }); body = JSON.stringify(m); }
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=86400').type('application/json').send(body);
  }
  catch (e) { res.status(503).json({ error: 'The map is not available right now.' }); }
});

module.exports = router;
