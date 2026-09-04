const express = require('express');
const path = require('path');
const router = express.Router();
const db = require('../../db');

function formatDesc(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\n/g, '<br>');
}


router.get('/', async (req, res) => {
  const eventsRes = await db.query(`SELECT * FROM events WHERE is_open = true ORDER BY created_at DESC`);
  const openEventCount = eventsRes.rows.length;
  res.render('new/home', { openEventCount, openAppCount: openEventCount });
});

router.get('/staff', async (req, res) => {
  const staffRoles = (await db.query(
    `SELECT * FROM staff_roles ORDER BY display_order ASC, id ASC`
  )).rows;

  // Get configured staff Discord role ID
  const configRes = await db.query(`SELECT staff_role_id FROM guild_config LIMIT 1`);
  const staffRoleId = configRes.rows[0]?.staff_role_id || null;

  const userRoleIds = req.session.user?.guildRoleIds || [];
  const userId = req.session.user?.id || null;
  const isAdmin = res.locals.isAdmin;

  // Check manual staff access grant (by Discord ID entered in admin panel)
  let hasManualAccess = false;
  if (userId) {
    const accessRes = await db.query(`SELECT 1 FROM staff_access WHERE discord_id = $1`, [userId]);
    hasManualAccess = accessRes.rows.length > 0;
  }

  const isStaff = isAdmin || hasManualAccess || (staffRoleId && userRoleIds.includes(staffRoleId));

  res.render('new/staff', { staffRoles, isStaff, formatDesc });
});
router.get('/rules', (req, res) => res.render('rules'));

// ── New design routes (designPreview only) ──────────────────────────────────

router.get('/events', async (req, res) => {
  const events = (await db.query(`SELECT * FROM events ORDER BY event_date ASC NULLS LAST, created_at DESC`)).rows;
  res.render('new/events', { events });
});

router.get('/events/:id', async (req, res) => {
  const evRes = await db.query(`SELECT * FROM events WHERE id = $1`, [req.params.id]);
  if (!evRes.rows.length) return res.redirect('/events');
  res.render('new/event', { event: evRes.rows[0] });
});

router.get('/applications', async (req, res) => {
  const events = (await db.query(`SELECT * FROM events ORDER BY is_open DESC, event_date ASC NULLS LAST`)).rows;
  let userApp = null;
  let userHundredApp = null;
  let userNationApp = null;
  const VIP_ROLE_IDS = ['1449004906433351881', '1449030965576990720'];
  const userRoleIds = req.session.user?.guildRoleIds || [];
  const hasVipAccess = userRoleIds.some(id => VIP_ROLE_IDS.includes(id));
  if (req.session.user) {
    const [appRes, hundredRes, nationRes] = await Promise.all([
      db.query(
        `SELECT status, review_stage, edit_requested, edit_approved FROM structured_applications WHERE discord_id = $1`,
        [req.session.user.id]
      ),
      db.query(
        `SELECT status, edit_requested, edit_approved FROM hundred_applications WHERE discord_id = $1`,
        [req.session.user.id]
      ),
      db.query(
        `SELECT server_name FROM nation_leader_applications WHERE discord_id = $1`,
        [req.session.user.id]
      )
    ]);
    userApp = appRes.rows[0] || null;
    userHundredApp = hundredRes.rows[0] || null;
    userNationApp = nationRes.rows[0] || null;
  }
  res.render('new/applications', { events, userApp, userHundredApp, userNationApp, hasVipAccess });
});

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

router.get('/store', (req, res) => {
  const success = req.query.success === '1';
  res.render('new/store', { success });
});

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
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(s => s.trim());
  if (req.session.user && adminIds.includes(req.session.user.id)) {
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
  const r = await db.query(
    `SELECT * FROM nation_leader_applications WHERE discord_id = $1 AND accepted = true`, [uid]
  );
  const nation = r.rows[0] || null;
  if (!nation) return res.redirect('/applications');

  const allRes = await db.query(
    `SELECT server_name, map_x, map_z FROM nation_leader_applications
     WHERE accepted = true AND discord_id != $1 ORDER BY server_name ASC`, [uid]
  );
  const otherMarkers = allRes.rows.filter(n => n.map_x != null);
  const waiting      = allRes.rows.filter(n => n.map_x == null);
  const regionsRes   = await db.query(`SELECT x1,z1,x2,z2,name FROM mining_regions ORDER BY id ASC`);
  const saved = !!req.session.np_saved;
  req.session.np_saved = false;
  res.render('new/nation-place', {
    nation, otherMarkers, waiting,
    miningRegions: regionsRes.rows,
    saved
  });
});

router.post('/nation-place/submit', async (req, res) => {
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
  req.session.np_saved = true;
  res.redirect('/nation-place');
});

router.post('/nation-place/clear', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const uid = req.session.user.id;
  await db.query(
    `UPDATE nation_leader_applications SET map_x = NULL, map_z = NULL WHERE discord_id = $1 AND accepted = true`,
    [uid]
  );
  res.redirect('/nation-place');
});

module.exports = router;
