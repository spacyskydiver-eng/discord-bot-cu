const express = require('express');
const router = express.Router();
const db = require('../../db');
const { sendDiscordDM, giveDiscordRole } = require('../discord-dm');
const CU_GUILD_ID = '1449004906068312189';
const ROLE_150_PLAYER = '1544302037158731878';
const multer = require('multer');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '../../public/img/uploads'),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `wh-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  }
});

const ADMIN_IDS = () => (process.env.ADMIN_DISCORD_IDS || '').split(',').map(s => s.trim());

async function requireAdminOrStaff(req, res, next) {
  if (!req.session.user) return res.status(403).render('403');
  if (ADMIN_IDS().includes(req.session.user.id)) {
    res.locals.isFullAdmin = true;
    return next();
  }
  const row = (await db.query(
    `SELECT 1 FROM staff_access WHERE discord_id = $1`, [req.session.user.id]
  )).rows[0];
  if (row) {
    res.locals.isFullAdmin = false;
    return next();
  }
  return res.status(403).render('403');
}

function requireFullAdmin(req, res, next) {
  if (!res.locals.isFullAdmin) return res.status(403).json({ error: 'Forbidden' });
  next();
}

router.use(requireAdminOrStaff);

// Staff can only access application review paths; everything else needs full admin
router.use((req, res, next) => {
  if (res.locals.isFullAdmin) return next();
  const allowed = req.path === '/' || req.path === '/preview-apply' || req.path.startsWith('/application') || req.path.startsWith('/edit-request') || req.path === '/chest-analysis' || req.path.startsWith('/hundred') || req.path.startsWith('/nation-leader') || req.path.startsWith('/nations') || req.path === '/hundred-players' || req.path === '/nation-map';
  if (!allowed) return res.status(403).render('403');
  next();
});

// Admin dashboard
router.get('/', async (req, res) => {
  const eventRes = await db.query(`SELECT * FROM events ORDER BY created_at DESC LIMIT 1`);
  const event = eventRes.rows[0] || null;

  const eligibilityQuestions = (await db.query(
    `SELECT * FROM eligibility_questions ORDER BY display_order ASC, id ASC`
  )).rows;

  const applications = (await db.query(
    `SELECT id, submitted_at, status, review_stage, accepted_at, declined_at_stage,
            discord_id, discord_tag, discord_avatar, ign, playstyle, app_type,
            island_choices, island_assignment, friend_requests,
            edit_requested, edit_approved, edit_requested_at,
            CASE WHEN written_app IS NOT NULL AND trim(written_app) != ''
                 THEN array_length(regexp_split_to_array(trim(written_app), '\\s+'), 1)
                 ELSE 0 END AS word_count
     FROM structured_applications
     ORDER BY submitted_at DESC NULLS LAST`
  )).rows;

  const hundredApplications = (await db.query(
    `SELECT id, submitted_at, status, discord_id, discord_tag, discord_avatar,
            ign, country, session_availability, friend_requests,
            edit_requested, edit_approved, edit_requested_at
     FROM hundred_applications
     ORDER BY submitted_at DESC NULLS LAST`
  )).rows;

  const nationLeaderApplications = (await db.query(
    `SELECT id, submitted_at, discord_id, discord_tag, discord_avatar, guild_id, server_name, member_count
     FROM nation_leader_applications
     ORDER BY submitted_at DESC NULLS LAST`
  )).rows;

  const guildRes = await db.query(`SELECT * FROM guild_config LIMIT 10`);
  const levels = (await db.query(
    `SELECT guild_id, level_number, level_name, xp_required FROM level_config ORDER BY guild_id, level_number`
  )).rows;
  const levelRoles = (await db.query(
    `SELECT guild_id, level_number, role_id FROM level_roles ORDER BY guild_id, level_number`
  )).rows;
  const staffRoles = (await db.query(
    `SELECT * FROM staff_roles ORDER BY display_order ASC, id ASC`
  )).rows;
  const staffAccess = (await db.query(
    `SELECT discord_id, granted_at FROM staff_access ORDER BY granted_at DESC`
  )).rows;

  // Stage customization data
  const stageSettingsRows = (await db.query(`SELECT * FROM stage_settings`)).rows;
  const stageSettings = {};
  for (const r of stageSettingsRows) {
    if (!stageSettings[r.stage_number]) stageSettings[r.stage_number] = {};
    stageSettings[r.stage_number][r.field_key] = r.field_value;
  }
  const stageBlocksRows = (await db.query(`SELECT * FROM stage_blocks ORDER BY stage_number, display_order ASC, id ASC`)).rows;
  const stageBlocks = {};
  for (const b of stageBlocksRows) {
    if (!stageBlocks[b.stage_number]) stageBlocks[b.stage_number] = [];
    stageBlocks[b.stage_number].push(b);
  }
  const agreementItems = (await db.query(`SELECT * FROM agreement_items ORDER BY display_order ASC, id ASC`)).rows;
  const playstyleOptions = (await db.query(`SELECT * FROM playstyle_options ORDER BY display_order ASC, id ASC`)).rows;

  res.render('new/admin', {
    event, eligibilityQuestions, applications, hundredApplications, nationLeaderApplications,
    guilds: guildRes.rows, levels, levelRoles, staffRoles, staffAccess,
    stageSettings, stageBlocks, agreementItems, playstyleOptions
  });
});

// Chest analysis (staff-readable)
router.get('/chest-analysis', (req, res) => {
  const chestData = require('../data/chest-data.json');
  res.render('new/chest-analysis', { chestData });
});

// Admin preview of the application wizard
router.get('/preview-apply', async (req, res) => {
  const eventRes = await db.query(`SELECT * FROM events ORDER BY created_at DESC LIMIT 1`);
  const rawEvent = eventRes.rows[0] || null;
  const previewEvent = rawEvent
    ? { ...rawEvent, is_open: true }
    : { id: 0, title: 'Preview Event (No Live Event)', is_open: true, opens_at: null, closes_at: null };

  const eligibilityQuestions = (await db.query(
    `SELECT * FROM eligibility_questions ORDER BY display_order ASC, id ASC`
  )).rows;

  const stageSettingsRows = (await db.query(`SELECT * FROM stage_settings`)).rows;
  const stageSettings = {};
  for (const r of stageSettingsRows) {
    if (!stageSettings[r.stage_number]) stageSettings[r.stage_number] = {};
    stageSettings[r.stage_number][r.field_key] = r.field_value;
  }
  const stageBlocksRows = (await db.query(`SELECT * FROM stage_blocks ORDER BY stage_number, display_order ASC, id ASC`)).rows;
  const stageBlocks = {};
  for (const b of stageBlocksRows) {
    if (!stageBlocks[b.stage_number]) stageBlocks[b.stage_number] = [];
    stageBlocks[b.stage_number].push(b);
  }
  const agreementItems = (await db.query(`SELECT * FROM agreement_items ORDER BY display_order ASC, id ASC`)).rows;
  const playstyleOptions = (await db.query(`SELECT * FROM playstyle_options ORDER BY display_order ASC, id ASC`)).rows;

  res.render('apply', {
    event: previewEvent,
    eligibilityQuestions,
    existing: null,
    submitted: false,
    stageSettings, stageBlocks, agreementItems, playstyleOptions,
    previewMode: true
  });
});

async function logEvent(appId, type, stage, user) {
  try {
    await db.query(
      `INSERT INTO application_events (application_id, event_type, stage_number, done_by_discord_id, done_by_discord_tag)
       VALUES ($1,$2,$3,$4,$5)`,
      [appId, type, stage || null, user?.id || null, user?.username || null]
    );
  } catch (_) {}
}

// View single application
router.get('/application/:id', async (req, res) => {
  const appRes = await db.query(`SELECT * FROM structured_applications WHERE id = $1`, [req.params.id]);
  if (!appRes.rows.length) return res.redirect('/admin');
  const app = appRes.rows[0];

  const [eligRes, histRes] = await Promise.all([
    db.query(`SELECT * FROM eligibility_questions ORDER BY display_order ASC, id ASC`),
    db.query(`SELECT * FROM application_events WHERE application_id = $1 ORDER BY done_at ASC`, [req.params.id])
  ]);
  const eligibilityQuestions = eligRes.rows;
  const eventHistory = histRes.rows;

  // Look up friend applications by IGN
  const friendNames = (app.friend_requests || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  let friendApps = [];
  if (friendNames.length > 0) {
    const fRes = await db.query(
      `SELECT id, ign, discord_tag, discord_avatar, status, review_stage,
              island_choices, island_assignment, friend_requests
       FROM structured_applications WHERE LOWER(ign) = ANY($1::text[])`,
      [friendNames.map(n => n.toLowerCase())]
    );
    friendApps = fRes.rows;
  }
  const foundIgnsLower = friendApps.map(f => f.ign.toLowerCase());
  const notApplied = friendNames.filter(n => !foundIgnsLower.includes(n.toLowerCase()));

  // Split view — load friend app side by side
  let splitApp = null;
  if (req.query.split) {
    const sRes = await db.query(`SELECT * FROM structured_applications WHERE id = $1`, [req.query.split]);
    splitApp = sRes.rows[0] || null;
  }

  res.render('admin-application', {
    app, eligibilityQuestions, eventHistory,
    friendApps, notApplied,
    splitApp
  });
});

// Update application status (manual override / reset)
router.post('/application/:id/status', async (req, res) => {
  const { status } = req.body;
  const appRes = await db.query(`SELECT discord_id, ign FROM structured_applications WHERE id=$1`, [req.params.id]);
  const app = appRes.rows[0];
  if (status === 'pending') {
    await db.query(
      `UPDATE structured_applications SET status='pending', accepted_at=NULL, declined_at_stage=NULL, review_stage=2 WHERE id=$1`,
      [req.params.id]
    );
    logEvent(req.params.id, 'reset_to_pending', null, req.session.user);
  } else if (status === 'accepted') {
    await db.query(
      `UPDATE structured_applications SET status='accepted', accepted_at=$1 WHERE id=$2`,
      [new Date(), req.params.id]
    );
    logEvent(req.params.id, 'accepted', null, req.session.user);
    if (app) sendDiscordDM(app.discord_id,
      `**Your application has been accepted!**\n\nCongratulations ${app.ign || ''} — you've been accepted into **The Collective**. Keep an eye out for further details on what happens next.`
    );
  } else if (status === 'declined') {
    await db.query(
      `UPDATE structured_applications SET status='declined' WHERE id=$1`,
      [req.params.id]
    );
    logEvent(req.params.id, 'declined', null, req.session.user);
    if (app) sendDiscordDM(app.discord_id,
      `**Application update — The Collective**\n\nHi ${app.ign || ''}, unfortunately your application has not been successful this time. Thank you for applying.`
    );
  }
  res.redirect(`/admin/application/${req.params.id}`);
});

// Pass current review stage (advance to next, or accept if at stage 6)
router.post('/application/:id/pass-stage', async (req, res) => {
  const appRes = await db.query(`SELECT review_stage, discord_id, ign FROM structured_applications WHERE id = $1`, [req.params.id]);
  if (!appRes.rows.length) return res.redirect('/admin');
  const { review_stage, discord_id, ign } = appRes.rows[0];
  const stage = review_stage || 2;
  if (stage >= 6) {
    await db.query(
      `UPDATE structured_applications SET status='accepted', accepted_at=$1 WHERE id=$2`,
      [new Date(), req.params.id]
    );
    logEvent(req.params.id, 'accepted', stage, req.session.user);
    sendDiscordDM(discord_id,
      `**Your application has been accepted!**\n\nCongratulations ${ign || ''} — you've been accepted into **The Collective**. Keep an eye out for further details on what happens next.`
    );
  } else {
    await db.query(
      `UPDATE structured_applications SET review_stage=$1 WHERE id=$2`,
      [stage + 1, req.params.id]
    );
    logEvent(req.params.id, 'pass_stage', stage, req.session.user);
  }
  res.redirect(`/admin/application/${req.params.id}`);
});

// Decline at current review stage
router.post('/application/:id/decline-stage', async (req, res) => {
  const appRes = await db.query(`SELECT review_stage, discord_id, ign FROM structured_applications WHERE id = $1`, [req.params.id]);
  if (!appRes.rows.length) return res.redirect('/admin');
  const { review_stage, discord_id, ign } = appRes.rows[0];
  const stage = review_stage || 2;
  await db.query(
    `UPDATE structured_applications SET status='declined', declined_at_stage=$1 WHERE id=$2`,
    [stage, req.params.id]
  );
  logEvent(req.params.id, 'decline_stage', stage, req.session.user);
  sendDiscordDM(discord_id,
    `**Application update — The Collective**\n\nHi ${ign || ''}, unfortunately your application has not been successful at this stage. Thank you for taking the time to apply.`
  );
  res.redirect(`/admin/application/${req.params.id}`);
});

// Island assignment
router.post('/application/:id/island', async (req, res) => {
  const { island } = req.body;
  const valid = ['jungle','snow','badlands','forest',''];
  if (!valid.includes(island)) return res.redirect(`/admin/application/${req.params.id}`);
  await db.query(
    `UPDATE structured_applications SET island_assignment=$1 WHERE id=$2`,
    [island || null, req.params.id]
  );
  res.redirect(`/admin/application/${req.params.id}`);
});

// Approve edit request
router.post('/application/:id/approve-edit', async (req, res) => {
  const appRes = await db.query(
    `SELECT discord_id, ign FROM structured_applications WHERE id = $1`, [req.params.id]
  );
  const app = appRes.rows[0];
  await db.query(
    `UPDATE structured_applications SET edit_approved = true WHERE id = $1`, [req.params.id]
  );
  logEvent(req.params.id, 'edit_approved', null, req.session.user);
  if (app) sendDiscordDM(app.discord_id,
    `**Edit request approved — The Collective**\n\nHi ${app.ign || ''} — your request to edit your application has been approved. Head to the website and go to "Your Application" to make your changes.`
  );
  res.redirect('/admin#applications');
});

// Deny edit request
router.post('/application/:id/deny-edit', async (req, res) => {
  const appRes = await db.query(
    `SELECT discord_id, ign FROM structured_applications WHERE id = $1`, [req.params.id]
  );
  const app = appRes.rows[0];
  await db.query(
    `UPDATE structured_applications
       SET edit_requested = false, edit_approved = false, edit_requested_at = NULL
     WHERE id = $1`,
    [req.params.id]
  );
  logEvent(req.params.id, 'edit_denied', null, req.session.user);
  if (app) sendDiscordDM(app.discord_id,
    `**Edit request update — The Collective**\n\nHi ${app.ign || ''} — your request to edit your application has not been approved at this time. If you have questions, reach out in the Discord server.`
  );
  res.redirect('/admin#applications');
});

// Delete application entirely (lets user reapply from scratch)
router.post('/application/:id/delete', async (req, res) => {
  await db.query(`DELETE FROM application_events WHERE application_id = $1`, [req.params.id]);
  await db.query(`DELETE FROM structured_applications WHERE id = $1`, [req.params.id]);
  res.redirect('/admin#applications');
});

// Save admin notes
router.post('/application/:id/notes', async (req, res) => {
  await db.query(
    `UPDATE structured_applications SET admin_notes = $1 WHERE id = $2`,
    [req.body.notes || null, req.params.id]
  );
  res.redirect(`/admin/application/${req.params.id}`);
});

// ── 150 Player Event admin routes ────────────────────────────────────────────

router.get('/hundred/:id', async (req, res) => {
  const appRes = await db.query(`SELECT * FROM hundred_applications WHERE id = $1`, [req.params.id]);
  if (!appRes.rows.length) return res.redirect('/admin#tab-hundred');
  const app = appRes.rows[0];

  function parseJsonField(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { return JSON.parse(v) || []; } catch (_) { return []; }
  }

  const friendNames = (app.friend_requests || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  let friendApps = [];
  if (friendNames.length > 0) {
    const fRes = await db.query(
      `SELECT id, ign, discord_tag, discord_avatar, status FROM hundred_applications WHERE LOWER(ign) = ANY($1::text[])`,
      [friendNames.map(n => n.toLowerCase())]
    );
    friendApps = fRes.rows;
  }
  const foundIgnsLower = friendApps.map(f => f.ign.toLowerCase());
  const notApplied = friendNames.filter(n => !foundIgnsLower.includes(n.toLowerCase()));

  res.render('new/admin-hundred-application', { app, friendApps, notApplied });
});

async function nextPendingHundred(currentId) {
  const r = await db.query(
    `SELECT id FROM hundred_applications
     WHERE status = 'pending' AND id != $1
     ORDER BY submitted_at ASC LIMIT 1`,
    [currentId]
  );
  return r.rows[0]?.id || null;
}

router.post('/hundred/:id/accept', async (req, res) => {
  const appRes = await db.query(`SELECT discord_id, ign FROM hundred_applications WHERE id = $1`, [req.params.id]);
  const app = appRes.rows[0];
  await db.query(
    `UPDATE hundred_applications SET status='accepted', accepted_at=NOW() WHERE id=$1`, [req.params.id]
  );
  if (app) {
    giveDiscordRole(app.discord_id, CU_GUILD_ID, ROLE_150_PLAYER);
    sendDiscordDM(app.discord_id,
      `**150 Player Event — Application Accepted!**\n\nCongratulations ${app.ign || ''} — you've been accepted into the 150 Player Event. Keep an eye out for further details.`
    );
  }
  const next = await nextPendingHundred(req.params.id);
  res.redirect(next ? `/admin/hundred/${next}` : `/admin#tab-hundred`);
});

router.post('/hundred/:id/decline', async (req, res) => {
  const appRes = await db.query(`SELECT discord_id, ign FROM hundred_applications WHERE id = $1`, [req.params.id]);
  const app = appRes.rows[0];
  await db.query(
    `UPDATE hundred_applications SET status='declined', declined_at=NOW() WHERE id=$1`, [req.params.id]
  );
  if (app) sendDiscordDM(app.discord_id,
    `**150 Player Event — Application Update**\n\nHi ${app.ign || ''}, unfortunately your application for the 150 Player Event has not been successful this time. Thank you for applying.`
  );
  const next = await nextPendingHundred(req.params.id);
  res.redirect(next ? `/admin/hundred/${next}` : `/admin#tab-hundred`);
});

router.post('/hundred/:id/reset', async (req, res) => {
  await db.query(
    `UPDATE hundred_applications SET status='pending', accepted_at=NULL, declined_at=NULL WHERE id=$1`, [req.params.id]
  );
  res.redirect(`/admin/hundred/${req.params.id}`);
});

router.post('/hundred/:id/approve-edit', async (req, res) => {
  const appRes = await db.query(`SELECT discord_id, ign FROM hundred_applications WHERE id = $1`, [req.params.id]);
  const app = appRes.rows[0];
  await db.query(
    `UPDATE hundred_applications SET edit_approved=true WHERE id=$1`, [req.params.id]
  );
  if (app) sendDiscordDM(app.discord_id,
    `**150 Player Event — Edit Request Approved**\n\nHi ${app.ign || ''} — your request to edit your application has been approved. Head to the website to make your changes.`
  );
  res.redirect(`/admin/hundred/${req.params.id}`);
});

router.post('/hundred/:id/deny-edit', async (req, res) => {
  const appRes = await db.query(`SELECT discord_id, ign FROM hundred_applications WHERE id = $1`, [req.params.id]);
  const app = appRes.rows[0];
  await db.query(
    `UPDATE hundred_applications SET edit_requested=false, edit_approved=false, edit_requested_at=NULL WHERE id=$1`, [req.params.id]
  );
  if (app) sendDiscordDM(app.discord_id,
    `**150 Player Event — Edit Request Update**\n\nHi ${app.ign || ''} — your edit request has not been approved at this time. If you have questions, reach out in the Discord server.`
  );
  res.redirect(`/admin/hundred/${req.params.id}`);
});

router.post('/hundred/:id/delete', async (req, res) => {
  await db.query(`DELETE FROM hundred_applications WHERE id=$1`, [req.params.id]);
  res.redirect('/admin#tab-hundred');
});

router.post('/hundred/:id/notes', async (req, res) => {
  await db.query(
    `UPDATE hundred_applications SET admin_notes=$1 WHERE id=$2`,
    [req.body.notes || null, req.params.id]
  );
  res.redirect(`/admin/hundred/${req.params.id}`);
});

// ── Nation Leader admin routes ─────────────────────────────────────────────

router.post('/nation-leader/:id/delete', async (req, res) => {
  await db.query(`DELETE FROM nation_leader_applications WHERE id=$1`, [req.params.id]);
  res.redirect('/admin#tab-hundred');
});

// ── Players list ──────────────────────────────────────────────────────────────

router.get('/hundred-players', async (req, res) => {
  // Accepted hundred_applications players
  const hundredRes = await db.query(`
    SELECT discord_id, discord_tag, discord_avatar, ign, ign_verified,
           'hundred' AS source, false AS is_nation_leader
    FROM hundred_applications
    WHERE status = 'accepted' AND ign IS NOT NULL AND ign != ''
  `);

  // Nation leaders without a hundred_applications row (or whose row isn't accepted)
  const nationRes = await db.query(`
    SELECT n.discord_id, n.discord_tag, n.discord_avatar, n.ign, n.ign_verified,
           'nation' AS source, true AS is_nation_leader
    FROM nation_leader_applications n
    WHERE n.accepted = true
      AND n.ign IS NOT NULL AND n.ign != ''
      AND NOT EXISTS (
        SELECT 1 FROM hundred_applications h
        WHERE h.discord_id = n.discord_id AND h.status = 'accepted'
      )
  `);

  // Nation leader flags for players who ARE in hundred_applications
  const nlFlagRes = await db.query(`
    SELECT discord_id FROM nation_leader_applications WHERE accepted = true
  `);
  const nlIds = new Set(nlFlagRes.rows.map(r => r.discord_id));

  const players = [
    ...hundredRes.rows.map(r => ({ ...r, is_nation_leader: nlIds.has(r.discord_id) })),
    ...nationRes.rows
  ].sort((a, b) => (a.ign || '').localeCompare(b.ign || ''));

  res.render('new/admin-players', { players });
});

// Nation map (admin view)
router.get('/nation-map', async (req, res) => {
  const all = (await db.query(
    `SELECT server_name, map_x, map_z FROM nation_leader_applications WHERE accepted = true ORDER BY server_name ASC`
  )).rows;
  const markers = all.filter(r => r.map_x != null && r.map_z != null);
  const waiting = all.filter(r => r.map_x == null);
  const regions = (await db.query(`SELECT * FROM mining_regions ORDER BY id ASC`)).rows;
  res.render('new/admin-nation-map', { markers, waiting, regions });
});

router.post('/mining-region/add', async (req, res) => {
  const { name, x1, z1, x2, z2 } = req.body;
  const rx1 = Math.min(parseInt(x1), parseInt(x2));
  const rx2 = Math.max(parseInt(x1), parseInt(x2));
  const rz1 = Math.min(parseInt(z1), parseInt(z2));
  const rz2 = Math.max(parseInt(z1), parseInt(z2));
  if ([rx1,rx2,rz1,rz2].some(isNaN)) return res.redirect('/admin/nation-map');
  await db.query(
    `INSERT INTO mining_regions (name, x1, z1, x2, z2) VALUES ($1,$2,$3,$4,$5)`,
    [(name || 'Mining Region').trim(), rx1, rz1, rx2, rz2]
  );
  res.redirect('/admin/nation-map');
});

router.post('/mining-region/:id/delete', async (req, res) => {
  await db.query(`DELETE FROM mining_regions WHERE id = $1`, [req.params.id]);
  res.redirect('/admin/nation-map');
});

// Map viewer
router.get('/map', (req, res) => res.render('new/admin-map'));
router.get('/map-v2', (req, res) => res.render('new/admin-map-v2'));

// BlueMap (our fork - see BlueMap-fork on Alex's machine) renders the real
// single-player world locally and is exposed over a Cloudflare Tunnel, since
// this is a single-player world (not a hosted server) and the rendered
// output (~700MB of tiles) is far too large to commit to this repo or fit
// on Render's ephemeral disk. BLUEMAP_TUNNEL_URL should be set on Render
// once the tunnel has a stable address; the literal fallback here is only
// for while that's being set up and WILL go stale (quick Cloudflare Tunnels
// get a new random hostname every time they're restarted).
const BLUEMAP_TARGET = process.env.BLUEMAP_TUNNEL_URL || 'https://tonight-papers-lace-breed.trycloudflare.com';
// BlueMap's HTML references its own assets with relative paths ("./assets/
// ..."), which the browser resolves against the CURRENT URL - without a
// trailing slash, "/admin/bluemap" is treated as a file, so "./assets/x"
// resolves to "/admin/assets/x" (wrong) instead of "/admin/bluemap/assets/x"
// (right). Redirect the bare path to the slash-terminated one so it works
// regardless of how someone navigates here (typed URL, bookmark, nav link).
// A string route here would match "/bluemap" AND "/bluemap/" (Express's
// default non-strict routing), redirecting the already-correct slash
// version right back to itself. The regex forces an exact, no-trailing-
// slash-only match.
router.get(/^\/bluemap$/, (req, res) => res.redirect(301, '/admin/bluemap/'));
router.use('/bluemap', createProxyMiddleware({
  target: BLUEMAP_TARGET,
  changeOrigin: true,
  ws: true,
}));

// Nations portal
router.get('/nations', async (req, res) => {
  const nations = (await db.query(
    `SELECT n.*,
            (SELECT COUNT(*) FROM nation_members nm WHERE nm.guild_id = n.guild_id AND nm.left_at IS NULL) AS member_count,
            (SELECT COUNT(*) FROM nation_messages nm WHERE nm.guild_id = n.guild_id) AS message_count,
            (SELECT COUNT(*) FROM nation_channels nc WHERE nc.guild_id = n.guild_id AND nc.deleted = false) AS channel_count
     FROM nation_leader_applications n
     WHERE n.accepted = true
     ORDER BY n.accepted_at DESC`
  )).rows;
  res.render('new/admin-nations', { nations });
});

router.get('/nations/:guildId', async (req, res) => {
  const nation = (await db.query(
    `SELECT * FROM nation_leader_applications WHERE guild_id=$1`, [req.params.guildId]
  )).rows[0];
  if (!nation) return res.redirect('/admin/nations');

  const channels = (await db.query(
    `SELECT * FROM nation_channels WHERE guild_id=$1 ORDER BY position ASC`, [req.params.guildId]
  )).rows;

  const members = (await db.query(
    `SELECT * FROM nation_members WHERE guild_id=$1 ORDER BY left_at NULLS FIRST, username ASC`, [req.params.guildId]
  )).rows;

  const firstChannel = channels.find(c => !c.deleted && (c.channel_type === 0 || c.channel_type === 5));

  res.render('new/admin-nation', { nation, channels, members, firstChannelId: firstChannel?.channel_id || null });
});

// JSON endpoint — messages for a channel with optional search
router.get('/nations/:guildId/messages', async (req, res) => {
  const { channel_id, search, before } = req.query;
  const limit = 60;

  let rows;
  if (search && search.trim()) {
    rows = (await db.query(
      `SELECT nm.*, nc.channel_name
       FROM nation_messages nm
       LEFT JOIN nation_channels nc ON nc.channel_id = nm.channel_id
       WHERE nm.guild_id=$1
         AND ($2::text IS NULL OR nm.channel_id=$2)
         AND to_tsvector('english', coalesce(nm.content,'')) @@ plainto_tsquery('english',$3)
       ORDER BY nm.sent_at DESC LIMIT $4`,
      [req.params.guildId, channel_id || null, search.trim(), limit]
    )).rows;
  } else {
    rows = (await db.query(
      `SELECT nm.*
       FROM nation_messages nm
       WHERE nm.guild_id=$1
         AND ($2::text IS NULL OR nm.channel_id=$2)
         AND ($3::text IS NULL OR nm.message_id < $3)
       ORDER BY nm.sent_at DESC LIMIT $4`,
      [req.params.guildId, channel_id || null, before || null, limit]
    )).rows;
  }

  res.json(rows.reverse());
});

// Eligibility questions CRUD
router.post('/eligibility/add', async (req, res) => {
  const { question_text, required_yes, blocking, display_order } = req.body;
  await db.query(
    `INSERT INTO eligibility_questions (question_text, required_yes, blocking, display_order) VALUES ($1,$2,$3,$4)`,
    [question_text, required_yes === 'true', blocking === 'true', parseInt(display_order) || 0]
  );
  res.redirect('/admin?saved=eligibility#questions');
});

router.post('/eligibility/delete', async (req, res) => {
  await db.query(`DELETE FROM eligibility_questions WHERE id = $1`, [req.body.id]);
  res.redirect('/admin?saved=eligibility#questions');
});

// Create event
router.post('/event/create', async (req, res) => {
  const { title, title_fr, description, description_fr, opens_at, closes_at } = req.body;
  await db.query(
    `INSERT INTO events (title, title_fr, description, description_fr, opens_at, closes_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [title, title_fr || null, description, description_fr || null, opens_at || null, closes_at || null]
  );
  res.redirect('/admin');
});

// Update event
router.post('/event/update', async (req, res) => {
  const { id, title, title_fr, description, description_fr, opens_at, closes_at, is_open } = req.body;
  await db.query(
    `UPDATE events SET title=$1, title_fr=$2, description=$3, description_fr=$4, opens_at=$5, closes_at=$6, is_open=$7 WHERE id=$8`,
    [title, title_fr || null, description, description_fr || null, opens_at || null, closes_at || null, is_open === 'true', id]
  );
  res.redirect('/admin');
});

// Bot: save XP settings
router.post('/bot/xp', async (req, res) => {
  const { guild_id, xp_per_message, xp_cooldown_seconds, level_up_channel_id } = req.body;
  await db.query(
    `INSERT INTO guild_config (guild_id, xp_per_message, xp_cooldown_seconds, level_up_channel_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (guild_id) DO UPDATE SET xp_per_message=$2, xp_cooldown_seconds=$3, level_up_channel_id=$4`,
    [guild_id, xp_per_message, xp_cooldown_seconds, level_up_channel_id || null]
  );
  res.redirect('/admin?saved=xp#bot');
});

// Bot: save veteran role
router.post('/bot/veteran', async (req, res) => {
  const { guild_id, veteran_role_id, veteran_months } = req.body;
  await db.query(
    `UPDATE guild_config SET veteran_role_id = $1, veteran_months = $2 WHERE guild_id = $3`,
    [veteran_role_id || null, parseInt(veteran_months) || 6, guild_id]
  );
  res.redirect('/admin?saved=veteran#bot');
});

// Bot: save levels + roles
router.post('/bot/levels', async (req, res) => {
  const { guild_id, level_numbers, level_names, level_xp, level_role_ids } = req.body;
  await db.query(`DELETE FROM level_config WHERE guild_id = $1`, [guild_id]);
  await db.query(`DELETE FROM level_roles WHERE guild_id = $1`, [guild_id]);
  const nums = Array.isArray(level_numbers) ? level_numbers : [level_numbers];
  const names = Array.isArray(level_names) ? level_names : [level_names];
  const xps = Array.isArray(level_xp) ? level_xp : [level_xp];
  const roleIds = Array.isArray(level_role_ids) ? level_role_ids : [level_role_ids];
  for (let i = 0; i < nums.length; i++) {
    if (!nums[i] || !names[i] || !xps[i]) continue;
    await db.query(
      `INSERT INTO level_config (guild_id, level_number, level_name, xp_required) VALUES ($1,$2,$3,$4)`,
      [guild_id, parseInt(nums[i]), names[i], parseInt(xps[i])]
    );
    if (roleIds[i] && roleIds[i].trim()) {
      await db.query(
        `INSERT INTO level_roles (guild_id, level_number, role_id) VALUES ($1,$2,$3) ON CONFLICT (guild_id, level_number) DO UPDATE SET role_id = $3`,
        [guild_id, parseInt(nums[i]), roleIds[i].trim()]
      );
    }
  }
  res.redirect('/admin?saved=levels#bot');
});

// Bot: save staff Discord role ID
router.post('/bot/staff-role', async (req, res) => {
  const { guild_id, staff_role_id } = req.body;
  await db.query(
    `UPDATE guild_config SET staff_role_id = $1 WHERE guild_id = $2`,
    [staff_role_id || null, guild_id]
  );
  res.redirect('/admin?saved=staffrole#bot');
});

// Staff roles CRUD
router.post('/staff/add', async (req, res) => {
  const { title, description, pay, blur_pay, blur_description, display_order } = req.body;
  await db.query(
    `INSERT INTO staff_roles (title, description, pay, blur_pay, blur_description, display_order) VALUES ($1,$2,$3,$4,$5,$6)`,
    [title, description || '', pay || '', blur_pay === 'on', blur_description === 'on', parseInt(display_order) || 0]
  );
  res.redirect('/admin?saved=staff#staff');
});

router.post('/staff/update', async (req, res) => {
  const { id, title, description, pay, blur_pay, blur_description, display_order } = req.body;
  await db.query(
    `UPDATE staff_roles SET title=$1, description=$2, pay=$3, blur_pay=$4, blur_description=$5, display_order=$6 WHERE id=$7`,
    [title, description || '', pay || '', blur_pay === 'on', blur_description === 'on', parseInt(display_order) || 0, id]
  );
  res.redirect('/admin?saved=staff#staff');
});

router.post('/staff/delete', async (req, res) => {
  await db.query(`DELETE FROM staff_roles WHERE id = $1`, [req.body.id]);
  res.redirect('/admin?saved=staff#staff');
});

// Staff access: grant by Discord ID
router.post('/staff/access/add', async (req, res) => {
  const id = (req.body.discord_id || '').trim();
  if (id) {
    await db.query(`INSERT INTO staff_access (discord_id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
  }
  res.redirect('/admin?saved=access#staff');
});

// Staff access: revoke by Discord ID
router.post('/staff/access/remove', async (req, res) => {
  await db.query(`DELETE FROM staff_access WHERE discord_id = $1`, [req.body.discord_id]);
  res.redirect('/admin?saved=access#staff');
});

// ── Stage settings ──
router.post('/stage/setting/save', async (req, res) => {
  const { stage_number, field_key, field_value } = req.body;
  await db.query(
    `INSERT INTO stage_settings (stage_number, field_key, field_value) VALUES ($1,$2,$3)
     ON CONFLICT (stage_number, field_key) DO UPDATE SET field_value=$3`,
    [parseInt(stage_number), field_key, field_value || '']
  );
  res.redirect(`/admin?saved=stages#stages`);
});

// ── Stage blocks (rich content) ──
router.post('/stage/block/add', async (req, res) => {
  const { stage_number, block_type, content, label, style_class, display_order } = req.body;
  await db.query(
    `INSERT INTO stage_blocks (stage_number, block_type, content, label, style_class, display_order) VALUES ($1,$2,$3,$4,$5,$6)`,
    [parseInt(stage_number), block_type, content || '', label || '', style_class || 'normal', parseInt(display_order) || 0]
  );
  res.redirect(`/admin?saved=stages&stage=${stage_number}#stages`);
});

router.post('/stage/block/delete', async (req, res) => {
  const blockRes = await db.query(`SELECT stage_number FROM stage_blocks WHERE id=$1`, [req.body.id]);
  const sn = blockRes.rows[0]?.stage_number || '';
  await db.query(`DELETE FROM stage_blocks WHERE id=$1`, [req.body.id]);
  res.redirect(`/admin?saved=stages&stage=${sn}#stages`);
});

// ── Agreement items (Stage 6) ──
router.post('/agreement/add', async (req, res) => {
  const { item_text, display_order } = req.body;
  await db.query(
    `INSERT INTO agreement_items (item_text, display_order) VALUES ($1,$2)`,
    [item_text, parseInt(display_order) || 0]
  );
  res.redirect('/admin?saved=stages&stage=6#stages');
});

router.post('/agreement/update', async (req, res) => {
  await db.query(`UPDATE agreement_items SET item_text=$1 WHERE id=$2`, [req.body.item_text, req.body.id]);
  res.redirect('/admin?saved=stages&stage=6#stages');
});

router.post('/agreement/delete', async (req, res) => {
  await db.query(`DELETE FROM agreement_items WHERE id=$1`, [req.body.id]);
  res.redirect('/admin?saved=stages&stage=6#stages');
});

// ── Playstyle options (Stage 3) ──
router.post('/playstyle/add', async (req, res) => {
  const { value_key, title, description, display_order } = req.body;
  const key = value_key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  await db.query(
    `INSERT INTO playstyle_options (value_key, title, description, display_order) VALUES ($1,$2,$3,$4) ON CONFLICT (value_key) DO NOTHING`,
    [key, title, description || '', parseInt(display_order) || 0]
  );
  res.redirect('/admin?saved=stages&stage=3#stages');
});

router.post('/playstyle/update', async (req, res) => {
  const { id, title, description, display_order } = req.body;
  await db.query(
    `UPDATE playstyle_options SET title=$1, description=$2, display_order=$3 WHERE id=$4`,
    [title, description || '', parseInt(display_order) || 0, id]
  );
  res.redirect('/admin?saved=stages&stage=3#stages');
});

router.post('/playstyle/delete', async (req, res) => {
  await db.query(`DELETE FROM playstyle_options WHERE id=$1`, [req.body.id]);
  res.redirect('/admin?saved=stages&stage=3#stages');
});

// Ensure webhook tables exist
db.query(`
  CREATE TABLE IF NOT EXISTS webhook_messages (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    webhook_url TEXT,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(console.error);

db.query(`
  CREATE TABLE IF NOT EXISTS button_responses (
    custom_id TEXT PRIMARY KEY,
    response_text TEXT,
    response_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(console.error);
// Migrate existing table if it only has response_text
db.query(`ALTER TABLE button_responses ADD COLUMN IF NOT EXISTS response_payload JSONB`).catch(()=>{});
db.query(`ALTER TABLE button_responses ALTER COLUMN response_text DROP NOT NULL`).catch(()=>{});

// List all saved webhook messages
router.get('/webhook/messages', async (req, res) => {
  const rows = (await db.query(
    `SELECT id, name, webhook_url, payload, updated_at FROM webhook_messages ORDER BY updated_at DESC`
  )).rows;
  res.json(rows);
});

// Save (create or update) a webhook message
router.post('/webhook/save', async (req, res) => {
  const { id, name, webhook_url, payload } = req.body;
  if (!name) return res.json({ ok: false, error: 'Name is required' });
  if (id) {
    await db.query(
      `UPDATE webhook_messages SET name=$1, webhook_url=$2, payload=$3, updated_at=NOW() WHERE id=$4`,
      [name, webhook_url || null, JSON.stringify(payload), id]
    );
    res.json({ ok: true, id: parseInt(id) });
  } else {
    const r = await db.query(
      `INSERT INTO webhook_messages (name, webhook_url, payload) VALUES ($1,$2,$3) RETURNING id`,
      [name, webhook_url || null, JSON.stringify(payload)]
    );
    res.json({ ok: true, id: r.rows[0].id });
  }
});

// Delete a saved webhook message
router.delete('/webhook/message/:id', async (req, res) => {
  await db.query(`DELETE FROM webhook_messages WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// Save button ephemeral responses so the bot can look them up
router.post('/webhook/button-responses', async (req, res) => {
  const { buttons } = req.body;
  if (!Array.isArray(buttons)) return res.json({ ok: false, error: 'buttons must be an array' });
  for (const b of buttons) {
    if (!b.custom_id) continue;
    await db.query(
      `INSERT INTO button_responses (custom_id, response_text, response_payload) VALUES ($1,$2,$3)
       ON CONFLICT (custom_id) DO UPDATE SET response_text=$2, response_payload=$3`,
      [b.custom_id, b.response_text || null, b.response_payload ? JSON.stringify(b.response_payload) : null]
    );
  }
  res.json({ ok: true });
});

// Image upload — saves to public/img/uploads, returns public URL
router.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.json({ ok: false, error: 'No file received' });
  const url = `/img/uploads/${req.file.filename}`;
  res.json({ ok: true, url });
});

const DISCORD_API = 'https://discord.com/api/v10';

const LANG_INFO = {
  'es':    { name:'Español',    flag:'🇪🇸' },
  'fr':    { name:'Français',   flag:'🇫🇷' },
  'de':    { name:'Deutsch',    flag:'🇩🇪' },
  'pt':    { name:'Português',  flag:'🇧🇷' },
  'it':    { name:'Italiano',   flag:'🇮🇹' },
  'nl':    { name:'Nederlands', flag:'🇳🇱' },
  'pl':    { name:'Polski',     flag:'🇵🇱' },
  'ru':    { name:'Русский',    flag:'🇷🇺' },
  'tr':    { name:'Türkçe',     flag:'🇹🇷' },
  'sv':    { name:'Svenska',    flag:'🇸🇪' },
  'ar':    { name:'العربية',    flag:'🇸🇦' },
  'ja':    { name:'日本語',      flag:'🇯🇵' },
  'ko':    { name:'한국어',      flag:'🇰🇷' },
  'zh-CN': { name:'中文',        flag:'🇨🇳' },
};

async function translateText(text, targetLang) {
  if (!text || !text.trim()) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(url);
    const data = await r.json();
    return data[0].map(x => x[0]).join('');
  } catch (_) {
    return text; // fall back to original on error
  }
}

async function translateEmbed(embed, lang) {
  const t = s => translateText(s, lang);
  const out = { ...embed };
  if (embed.author?.name) out.author = { ...embed.author, name: await t(embed.author.name) };
  if (embed.title)        out.title = await t(embed.title);
  if (embed.description)  out.description = await t(embed.description);
  if (embed.footer?.text) out.footer = { ...embed.footer, text: await t(embed.footer.text) };
  if (embed.fields?.length) {
    out.fields = await Promise.all(embed.fields.map(async f => ({
      ...f,
      name:  await t(f.name),
      value: await t(f.value),
    })));
  }
  return out;
}

async function getChannelIdFromWebhook(webhookUrl) {
  const match = webhookUrl.match(/webhooks\/(\d+)\/([^?/]+)/);
  if (!match) return null;
  const [, whId, whToken] = match;
  const r = await fetch(`${DISCORD_API}/webhooks/${whId}/${whToken}`);
  if (!r.ok) return null;
  return (await r.json()).channel_id || null;
}

async function sendViaWebhookUrl(webhookUrl, payload) {
  // Add ?wait=true so Discord returns the message (we need the ID for threads)
  const sep = webhookUrl.includes('?') ? '&' : '?';
  const url = `${webhookUrl}${sep}wait=true`;
  const https = require('https');
  const body = JSON.stringify(payload);
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req2 = https.request(options, r => {
      let data = '';
      r.on('data', c => data += c);
      r.on('end', () => resolve({ status: r.statusCode, body: data }));
    });
    req2.on('error', reject);
    req2.write(body);
    req2.end();
  });
}

async function createTranslationThread(channelId, messageId, payload, languages) {
  if (!process.env.DISCORD_TOKEN) return false;
  // Create thread on the message
  const threadRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    body: JSON.stringify({ name: '🌍 Translations', auto_archive_duration: 1440 })
  });
  if (!threadRes.ok) return false;
  const { id: threadId } = await threadRes.json();

  const embed = payload.embeds?.[0] || null;

  for (const lang of languages) {
    const info = LANG_INFO[lang];
    if (!info) continue;
    try {
      const translatedContent = payload.content ? await translateText(payload.content, lang) : null;
      const translatedEmbed = embed ? await translateEmbed(embed, lang) : null;

      // Translate button labels, keep urls/custom_ids unchanged
      let translatedComponents;
      if (payload.components?.length) {
        translatedComponents = await Promise.all(payload.components.map(async row => ({
          ...row,
          components: await Promise.all((row.components || []).map(async btn => ({
            ...btn,
            label: btn.label ? await translateText(btn.label, lang) : btn.label
          })))
        })));
      }

      const threadMsg = {};
      if (translatedContent) threadMsg.content = translatedContent;
      if (translatedEmbed) {
        threadMsg.embeds = [{
          ...translatedEmbed,
          author: {
            ...(translatedEmbed.author || {}),
            name: `${info.flag} ${info.name}${translatedEmbed.author?.name ? '  ·  ' + translatedEmbed.author.name : ''}`
          }
        }];
      } else {
        threadMsg.content = `${info.flag} **${info.name}**\n${translatedContent || ''}`;
        delete threadMsg.embeds;
      }
      if (translatedComponents) threadMsg.components = translatedComponents;

      await fetch(`${DISCORD_API}/channels/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
        body: JSON.stringify(threadMsg)
      });
    } catch (_) {}
  }
  return true;
}

// Webhook sender — supports buttons (via bot API) and translation threads
router.post('/webhook/send', async (req, res) => {
  const { webhook_url, payload, languages = [] } = req.body;
  if (!webhook_url || !webhook_url.startsWith('https://discord.com/api/webhooks/')) {
    return res.json({ ok: false, error: 'Invalid webhook URL. Must start with https://discord.com/api/webhooks/' });
  }

  const hasComponents = !!(payload.components?.length);
  const hasTranslations = languages.length > 0;

  try {
    let messageId = null;
    let channelId = null;

    if (hasComponents) {
      if (!process.env.DISCORD_TOKEN) {
        return res.json({ ok: false, error: 'DISCORD_TOKEN not set — required to send messages with buttons' });
      }
      channelId = await getChannelIdFromWebhook(webhook_url);
      if (!channelId) return res.json({ ok: false, error: 'Could not look up webhook channel' });

      const r = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
        body: JSON.stringify({ content: payload.content || undefined, embeds: payload.embeds || undefined, components: payload.components })
      });
      if (!r.ok) {
        let errMsg = 'Bot API error';
        try { errMsg = (await r.json()).message || errMsg; } catch(e) {}
        return res.json({ ok: false, error: errMsg });
      }
      const msg = await r.json();
      messageId = msg.id;
    } else {
      const result = await sendViaWebhookUrl(webhook_url, payload);
      if (result.status < 200 || result.status >= 300) {
        let errMsg = result.body;
        try { errMsg = JSON.parse(result.body).message || errMsg; } catch(e) {}
        return res.json({ ok: false, error: `Discord returned ${result.status}: ${errMsg}` });
      }
      try {
        const msg = JSON.parse(result.body);
        messageId = msg.id;
        channelId = msg.channel_id;
      } catch(_) {}
    }

    // Create translation thread if languages selected
    let threadCreated = false;
    if (hasTranslations && messageId && (channelId || (channelId = await getChannelIdFromWebhook(webhook_url)))) {
      threadCreated = await createTranslationThread(channelId, messageId, payload, languages);
    }

    res.json({ ok: true, threadCreated });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Mining regions / contested zones / ore heatmaps for the BlueMap overlay.
// This bot runs on Render, but the actual world files and the BlueMap
// process only exist on Alex's local machine (see the BlueMap proxy setup
// above) - so these routes only manage rows in the shared Postgres DB.
// A separate local script (BlueMap-render/bluemap-sync.js, run on Alex's
// machine) polls this same DB, does the actual ore scanning (needs local
// access to the region files) and regenerates/reloads BlueMap's markers.
// Changes here show up on the live map after that script's next sync pass
// (a periodic local re-check), not instantly - see the commit message for
// why a live companion-plugin bridge was skipped for now.
db.query(`
  CREATE TABLE IF NOT EXISTS map_regions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    region_type TEXT NOT NULL CHECK (region_type IN ('mining','contested')),
    min_x INT NOT NULL, min_z INT NOT NULL, max_x INT NOT NULL, max_z INT NOT NULL,
    min_y INT NOT NULL DEFAULT -64, max_y INT NOT NULL DEFAULT 320,
    color TEXT NOT NULL DEFAULT '#ff3b3b',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(console.error);

db.query(`
  CREATE TABLE IF NOT EXISTS ore_heatmaps (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    block_id TEXT NOT NULL,
    min_x INT NOT NULL, min_z INT NOT NULL, max_x INT NOT NULL, max_z INT NOT NULL,
    min_y INT NOT NULL DEFAULT -64, max_y INT NOT NULL DEFAULT 320,
    status TEXT NOT NULL DEFAULT 'pending',
    total_count BIGINT,
    grid_data JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    scanned_at TIMESTAMPTZ
  )
`).catch(console.error);

router.get('/map-regions', requireAdminOrStaff, async (req, res) => {
  const regions = (await db.query(`SELECT * FROM map_regions ORDER BY region_type, name`)).rows;
  res.render('new/admin-map-regions', { regions });
});

router.post('/map-regions/save', requireAdminOrStaff, async (req, res) => {
  const { id, name, region_type, min_x, min_z, max_x, max_z, min_y, max_y, color } = req.body;
  const values = [
    name, region_type,
    Math.min(parseInt(min_x), parseInt(max_x)), Math.min(parseInt(min_z), parseInt(max_z)),
    Math.max(parseInt(min_x), parseInt(max_x)), Math.max(parseInt(min_z), parseInt(max_z)),
    parseInt(min_y) || -64, parseInt(max_y) || 320,
    color || '#ff3b3b'
  ];
  if (id) {
    await db.query(
      `UPDATE map_regions SET name=$1, region_type=$2, min_x=$3, min_z=$4, max_x=$5, max_z=$6, min_y=$7, max_y=$8, color=$9, updated_at=NOW() WHERE id=$10`,
      [...values, id]
    );
  } else {
    await db.query(
      `INSERT INTO map_regions (name, region_type, min_x, min_z, max_x, max_z, min_y, max_y, color) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      values
    );
  }
  res.redirect('/admin/map-regions');
});

router.post('/map-regions/:id/delete', requireAdminOrStaff, async (req, res) => {
  await db.query(`DELETE FROM map_regions WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/map-regions');
});

router.get('/ore-heatmap', requireAdminOrStaff, async (req, res) => {
  const heatmaps = (await db.query(`SELECT id, name, block_id, min_x, min_z, max_x, max_z, min_y, max_y, status, total_count, error_message, created_at, scanned_at FROM ore_heatmaps ORDER BY created_at DESC`)).rows;
  const regions = (await db.query(`SELECT id, name, min_x, min_z, max_x, max_z, min_y, max_y FROM map_regions ORDER BY name`)).rows;
  res.render('new/admin-ore-heatmap', { heatmaps, regions });
});

router.post('/ore-heatmap/scan', requireAdminOrStaff, async (req, res) => {
  const { name, block_id, min_x, min_z, max_x, max_z, min_y, max_y } = req.body;
  await db.query(
    `INSERT INTO ore_heatmaps (name, block_id, min_x, min_z, max_x, max_z, min_y, max_y, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
    [
      name || block_id, block_id,
      Math.min(parseInt(min_x), parseInt(max_x)), Math.min(parseInt(min_z), parseInt(max_z)),
      Math.max(parseInt(min_x), parseInt(max_x)), Math.max(parseInt(min_z), parseInt(max_z)),
      parseInt(min_y) || -64, parseInt(max_y) || 320
    ]
  );
  res.redirect('/admin/ore-heatmap');
});

router.post('/ore-heatmap/:id/delete', requireAdminOrStaff, async (req, res) => {
  await db.query(`DELETE FROM ore_heatmaps WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/ore-heatmap');
});

router.post('/ore-heatmap/:id/rescan', requireAdminOrStaff, async (req, res) => {
  await db.query(`UPDATE ore_heatmaps SET status='pending', error_message=NULL WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/ore-heatmap');
});

// ── 150-player event availability DMs ────────────────────────────────────────

const AVAILABILITY_DM = (discordId) =>
  `📅 **150 Player Event — Session Availability**\n\n` +
  `Hi! We need to confirm which sessions you can attend for the upcoming **150 Player Event**.\n\n` +
  `**Please click the link below to let us know your availability:**\n` +
  `https://cuevents.xyz/150-availability?uid=${discordId}\n\n` +
  `You can select the sessions you can make, or withdraw your application if you can't attend any of them.\n\n` +
  `_If you have any questions, reach out to staff in the Discord server._`;

// Send test DM to darthmaul1112 only
router.post('/send-availability-dm-test', async (req, res) => {
  const TEST_ID = '933421117211815987';
  await sendDiscordDM(TEST_ID, AVAILABILITY_DM(TEST_ID));
  res.json({ ok: true, sent_to: TEST_ID });
});

// Send to ALL pending hundred_applications
router.post('/send-availability-dms-all', async (req, res) => {
  const apps = (await db.query(
    `SELECT discord_id FROM hundred_applications WHERE status NOT IN ('withdrawn','declined')`
  )).rows;
  let sent = 0;
  for (const app of apps) {
    await sendDiscordDM(app.discord_id, AVAILABILITY_DM(app.discord_id));
    sent++;
    // Small delay to avoid Discord rate limits
    await new Promise(r => setTimeout(r, 400));
  }
  res.json({ ok: true, sent });
});

// Close the most recent event (500-player applications)
router.post('/event/close-current', async (req, res) => {
  await db.query(
    `UPDATE events SET is_open=false WHERE id=(SELECT id FROM events ORDER BY created_at DESC LIMIT 1)`
  );
  res.json({ ok: true, closed: true });
});

module.exports = router;
