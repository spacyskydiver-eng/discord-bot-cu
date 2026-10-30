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
  const playerWiki = wiki.getPlayer();
  const cue = {
    user: req.session.user ? { name: req.session.user.username } : null,
    isAdmin: !!res.locals.isOwner,
    vip: vipState,
    discord: 'https://discord.gg/x832cqAdu',
    events: upcomingEvents(),
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
  res.render('app', { cueJson, v: ASSET_V, noscriptSessions, staffScript: res.locals.isStaff ? '/staff-assets/staff.js?v=' + ASSET_V : null });
}
router.get('/', renderApp);
router.get('/wiki', renderApp);
router.get('/testers', renderApp);
router.get('/leaders', renderApp);
router.get('/staff-apply', renderApp);
router.get('/account', renderApp);

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
    SELECT DISTINCT ON (discord_id) discord_id, discord_tag, discord_avatar, score, saved_at
    FROM snake_scores ORDER BY discord_id, score DESC
  `)).rows;
  rows.sort((a, b) => b.score - a.score);
  res.json(rows.slice(0, 10));
});

router.get('/staff', (req, res) => res.redirect('/#/team'));
router.get('/rules', (req, res) => res.render('rules'));
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
router.get('/tools/mining-regions', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/tools/mining-regions.html'));
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

// Nation map archived — redirect to home
router.get('/map', (req, res) => {
  res.redirect(`${res.locals.lp}/`);
});

module.exports = router;
