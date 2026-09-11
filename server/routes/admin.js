const express = require('express');
const router = express.Router();
const db = require('../../db');
const { sendDiscordDM, giveDiscordRole } = require('../discord-dm');
const CU_GUILD_ID = '1449004906068312189';
const ROLE_150_PLAYER = '1544302037158731878';
const ROLE_NEWS_REPORTER = '1545849393352155338';
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

// Ensure tracking columns exist
db.query(`ALTER TABLE hundred_applications ADD COLUMN IF NOT EXISTS dm_wave INT`).catch(() => {});
db.query(`ALTER TABLE hundred_applications ADD COLUMN IF NOT EXISTS ign_mojang_valid BOOLEAN`).catch(() => {});
db.query(`ALTER TABLE nation_leader_applications ADD COLUMN IF NOT EXISTS ign_mojang_valid BOOLEAN`).catch(() => {});

// Recording submissions table
db.query(`CREATE TABLE IF NOT EXISTS recording_submissions (
  id SERIAL PRIMARY KEY,
  message_id TEXT UNIQUE NOT NULL,
  channel_id TEXT NOT NULL,
  day INT NOT NULL,
  discord_id TEXT NOT NULL,
  discord_tag TEXT,
  discord_avatar TEXT,
  content_type TEXT NOT NULL,
  message_text TEXT,
  attachment_url TEXT,
  attachment_filename TEXT,
  attachment_mime TEXT,
  attachment_size INT,
  submitted_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ DEFAULT NOW()
)`).catch(() => {});

// Staff can only access application review paths; everything else needs full admin
router.use((req, res, next) => {
  if (res.locals.isFullAdmin) return next();
  const allowed = req.path === '/' || req.path === '/preview-apply' || req.path.startsWith('/application') || req.path.startsWith('/edit-request') || req.path === '/chest-analysis' || req.path.startsWith('/hundred') || req.path.startsWith('/nation-leader') || req.path.startsWith('/nations') || req.path === '/hundred-players' || req.path === '/mc-usernames' || req.path === '/check-ign-validity' || req.path === '/nation-map' || req.path.startsWith('/news-reporter') || req.path.startsWith('/moderation') || req.path === '/rival-check' || req.path === '/recordings' || req.path.startsWith('/recording/');
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

// 150-player event chest analysis
router.get('/hundred-chest', (req, res) => {
  const chestData = require('../data/hundred-chest-data.json');
  res.render('new/admin-hundred-chest', { chestData });
});

// ── News Reporter Applications ────────────────────────────────────────────────

router.get('/news-reporter', async (req, res) => {
  const apps = (await db.query(
    `SELECT id, discord_tag, discord_avatar, status, submitted_at
     FROM news_reporter_applications ORDER BY submitted_at DESC`
  )).rows;
  res.render('new/admin-news-reporter-list', { apps });
});

router.get('/news-reporter/:id', async (req, res) => {
  const appRes = await db.query(`SELECT * FROM news_reporter_applications WHERE id=$1`, [req.params.id]);
  if (!appRes.rows.length) return res.redirect('/admin/news-reporter');
  const app = appRes.rows[0];
  const prevRes = await db.query(`SELECT id FROM news_reporter_applications WHERE status='pending' AND id < $1 ORDER BY id DESC LIMIT 1`, [app.id]);
  const nextRes = await db.query(`SELECT id FROM news_reporter_applications WHERE status='pending' AND id > $1 ORDER BY id ASC LIMIT 1`, [app.id]);
  res.render('new/admin-news-reporter-application', {
    app,
    prev: prevRes.rows[0]?.id || null,
    next: nextRes.rows[0]?.id || null
  });
});

router.post('/news-reporter/:id/accept', async (req, res) => {
  const r = await db.query(`SELECT discord_id, discord_tag FROM news_reporter_applications WHERE id=$1`, [req.params.id]);
  const app = r.rows[0];
  await db.query(`UPDATE news_reporter_applications SET status='accepted', accepted_at=NOW() WHERE id=$1`, [req.params.id]);
  if (app) {
    giveDiscordRole(app.discord_id, CU_GUILD_ID, ROLE_NEWS_REPORTER);
    sendDiscordDM(app.discord_id,
      `**News Reporter Application — Accepted!**\n\nCongratulations! You've been accepted as a News Reporter for the 150 Player Event.\n\nYou now have the **News Reporter** role and can post in the news channel. Cover the stories, wars, alliances, and drama as they unfold.\n\n**Remember:** you must post at least once every 2 sessions to keep the role. See you in the news channel!`
    );
  }
  res.redirect('/admin/news-reporter');
});

router.post('/news-reporter/:id/decline', async (req, res) => {
  const r = await db.query(`SELECT discord_id FROM news_reporter_applications WHERE id=$1`, [req.params.id]);
  const app = r.rows[0];
  await db.query(`UPDATE news_reporter_applications SET status='declined', declined_at=NOW() WHERE id=$1`, [req.params.id]);
  if (app) sendDiscordDM(app.discord_id,
    `**News Reporter Application — Update**\n\nThank you for applying to be a News Reporter for the 150 Player Event. Unfortunately your application wasn't successful this time. You're welcome to update your answers and reapply.`
  );
  res.redirect('/admin/news-reporter');
});

router.post('/news-reporter/:id/reset', async (req, res) => {
  await db.query(`UPDATE news_reporter_applications SET status='pending', accepted_at=NULL, declined_at=NULL WHERE id=$1`, [req.params.id]);
  res.redirect(`/admin/news-reporter/${req.params.id}`);
});

router.post('/news-reporter/:id/delete', async (req, res) => {
  await db.query(`DELETE FROM news_reporter_applications WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/news-reporter');
});

// ── Moderation ────────────────────────────────────────────────────────────────

const evidenceUpload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '../../public/img/uploads/evidence'),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.bin';
      cb(null, `ev-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Images and videos only'));
  }
});

async function discordApi(apiPath) {
  const r = await fetch(`https://discord.com/api/v10${apiPath}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
  });
  if (!r.ok) throw new Error(`Discord API ${r.status} ${apiPath}`);
  return r.json();
}

router.get('/moderation', async (req, res) => {
  try {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [flaggedRes, bansRes, ticketsRes, snippetsRes, generalRes, playerRepsRes, playersRes] = await Promise.all([
    db.query(`SELECT * FROM flagged_messages ORDER BY flagged_at DESC`),
    db.query(`SELECT b.*, COALESCE(json_agg(e ORDER BY e.created_at) FILTER (WHERE e.id IS NOT NULL), '[]') AS evidence
              FROM moderation_bans b LEFT JOIN ban_evidence e ON e.ban_id = b.id
              GROUP BY b.id ORDER BY b.banned_at DESC`),
    db.query(`SELECT t.*, COALESCE(json_agg(re ORDER BY re.created_at) FILTER (WHERE re.id IS NOT NULL), '[]') AS extra_evidence
              FROM ticket_reports t
              LEFT JOIN report_evidence re ON re.report_type='ticket' AND re.report_id=t.id
              GROUP BY t.id ORDER BY t.created_at DESC`),
    db.query(`SELECT id, label, guild_name, channel_name, created_at, jsonb_array_length(messages) AS msg_count FROM chat_snippets ORDER BY created_at DESC`),
    db.query(`SELECT g.*, COALESCE(json_agg(re ORDER BY re.created_at) FILTER (WHERE re.id IS NOT NULL), '[]') AS extra_evidence
              FROM general_reports g
              LEFT JOIN report_evidence re ON re.report_type='general' AND re.report_id=g.id
              GROUP BY g.id ORDER BY g.created_at DESC`),
    db.query(`SELECT pr.*,
              COALESCE(json_agg(re ORDER BY re.created_at) FILTER (WHERE re.id IS NOT NULL), '[]') AS evidence
              FROM player_reports pr
              LEFT JOIN report_evidence re ON re.report_type='player' AND re.report_id=pr.id
              GROUP BY pr.id ORDER BY pr.created_at DESC`),
    db.query(`SELECT discord_id, discord_tag FROM hundred_applications WHERE status='accepted' ORDER BY discord_tag ASC`)
  ]);
  // Merge all report types into one sorted list for the unified Reports tab
  const allReports = [
    ...ticketsRes.rows.map(r => ({ ...r, _type: 'ticket', _evidence: r.extra_evidence })),
    ...generalRes.rows.map(r => ({ ...r, _type: 'general', _evidence: r.extra_evidence })),
    ...playerRepsRes.rows.map(r => ({ ...r, _type: 'player', _evidence: r.evidence }))
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.render('new/admin-moderation', {
    flagged: flaggedRes.rows,
    bans: bansRes.rows,
    tickets: ticketsRes.rows,
    snippets: snippetsRes.rows,
    general: generalRes.rows,
    playerReps: playerRepsRes.rows,
    allReports,
    todayStr: today.toISOString(),
    knownPlayers: playersRes.rows
  });
  } catch (err) {
    console.error('[GET /moderation] ERROR:', err);
    res.status(500).send('<pre>Moderation page error:\n' + err.stack + '</pre>');
  }
});

router.get('/staff-guide', (req, res) => {
  res.render('new/admin-staff-guide');
});

router.post('/moderation/flagged/:id/disregard', async (req, res) => {
  await db.query(`UPDATE flagged_messages SET disregarded=true, disregarded_at=NOW() WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/moderation#flagged');
});

router.post('/moderation/flagged/:id/restore', async (req, res) => {
  await db.query(`UPDATE flagged_messages SET disregarded=false, disregarded_at=NULL WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/moderation#flagged');
});

router.post('/moderation/bans/add', async (req, res) => {
  const { discord_id, discord_tag, reason, notes } = req.body;
  if (!discord_id || !discord_tag) return res.redirect('/admin/moderation#bans');
  // Try to fetch avatar from Discord API
  let avatar = null;
  try {
    const r = await fetch(`https://discord.com/api/v10/users/${discord_id}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
    });
    if (r.ok) {
      const u = await r.json();
      if (u.avatar) avatar = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`;
    }
  } catch (_) {}
  const result = await db.query(
    `INSERT INTO moderation_bans (discord_id, discord_tag, discord_avatar, reason, notes, banned_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [discord_id.trim(), discord_tag.trim(), avatar, (reason||'').trim(), (notes||'').trim(), req.session.user?.username || 'admin']
  );
  res.redirect(`/admin/moderation#ban-${result.rows[0].id}`);
});

router.post('/moderation/bans/:id/notes', async (req, res) => {
  await db.query(`UPDATE moderation_bans SET notes=$1 WHERE id=$2`, [(req.body.notes||'').trim(), req.params.id]);
  res.redirect(`/admin/moderation#ban-${req.params.id}`);
});

router.post('/moderation/bans/:id/evidence/upload', evidenceUpload.single('file'), async (req, res) => {
  const { label } = req.body;
  if (req.file) {
    await db.query(
      `INSERT INTO ban_evidence (ban_id, evidence_type, filename, label) VALUES ($1,'file',$2,$3)`,
      [req.params.id, req.file.filename, (label||'').trim()]
    );
  } else if (req.body.url) {
    await db.query(
      `INSERT INTO ban_evidence (ban_id, evidence_type, url, label) VALUES ($1,'url',$2,$3)`,
      [req.params.id, req.body.url.trim(), (label||'').trim()]
    );
  }
  res.redirect(`/admin/moderation#ban-${req.params.id}`);
});

router.post('/moderation/bans/:id/evidence/flag', async (req, res) => {
  const flagId = parseInt(req.body.flagged_message_id);
  if (!flagId) return res.redirect(`/admin/moderation#ban-${req.params.id}`);
  await db.query(
    `INSERT INTO ban_evidence (ban_id, evidence_type, flagged_message_id, label) VALUES ($1,'flag',$2,$3)`,
    [req.params.id, flagId, (req.body.label||'').trim()]
  );
  res.redirect(`/admin/moderation#ban-${req.params.id}`);
});

router.post('/moderation/bans/:id/evidence/:evId/delete', async (req, res) => {
  const ev = (await db.query(`SELECT * FROM ban_evidence WHERE id=$1 AND ban_id=$2`, [req.params.evId, req.params.id])).rows[0];
  if (ev?.filename) {
    const fp = path.join(__dirname, '../../public/img/uploads/evidence', ev.filename);
    require('fs').unlink(fp, () => {});
  }
  await db.query(`DELETE FROM ban_evidence WHERE id=$1`, [req.params.evId]);
  res.redirect(`/admin/moderation#ban-${req.params.id}`);
});

router.post('/moderation/bans/:id/delete', async (req, res) => {
  await db.query(`DELETE FROM moderation_bans WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/moderation#bans');
});

// ── Player history (AJAX) ─────────────────────────────────────────────────────
router.get('/moderation/player/:discordId', async (req, res) => {
  const id = req.params.discordId;
  const [flagsRes, bansRes, ticketsRes, generalRes, appRes] = await Promise.all([
    db.query(`SELECT * FROM flagged_messages WHERE discord_id=$1 ORDER BY flagged_at DESC`, [id]),
    db.query(`SELECT * FROM moderation_bans WHERE discord_id=$1 ORDER BY banned_at DESC`, [id]),
    db.query(`SELECT * FROM ticket_reports WHERE player_discord_id=$1 ORDER BY created_at DESC`, [id]),
    db.query(`SELECT * FROM general_reports WHERE player_discord_id=$1 ORDER BY created_at DESC`, [id]),
    db.query(`SELECT ign, status FROM structured_applications WHERE discord_id=$1 ORDER BY id DESC LIMIT 1`, [id])
  ]);
  let profile = null;
  try {
    const u = await discordApi(`/users/${id}`);
    profile = {
      tag: u.username,
      avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null
    };
  } catch (_) {}
  // Minecraft IGN + head via Mojang
  let minecraft = null;
  const appRow = appRes.rows[0];
  if (appRow?.ign) {
    try {
      const mojang = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(appRow.ign)}`);
      if (mojang.ok) {
        const mj = await mojang.json();
        minecraft = {
          ign: mj.name || appRow.ign,
          uuid: mj.id,
          head: `https://crafatar.com/avatars/${mj.id}?size=48&overlay=true`,
          app_status: appRow.status
        };
      } else {
        minecraft = { ign: appRow.ign, uuid: null, head: null, app_status: appRow.status };
      }
    } catch (_) {
      minecraft = { ign: appRow.ign, uuid: null, head: null, app_status: appRow.status };
    }
  }
  res.json({ flags: flagsRes.rows, bans: bansRes.rows, tickets: ticketsRes.rows, general: generalRes.rows, profile, minecraft });
});

// ── Discord API proxies (for chat log browser) ────────────────────────────────
router.get('/moderation/discord/guilds', async (req, res) => {
  try {
    const guilds = await discordApi('/users/@me/guilds');
    res.json(guilds.map(g => ({ id: g.id, name: g.name, icon: g.icon })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/moderation/discord/channels/:guildId', async (req, res) => {
  try {
    const channels = await discordApi(`/guilds/${req.params.guildId}/channels`);
    const text = channels
      .filter(c => c.type === 0 || c.type === 11 || c.type === 12) // text, public thread, private thread
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map(c => ({ id: c.id, name: c.name, type: c.type, parent_id: c.parent_id }));
    res.json(text);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Classify a list of Discord user IDs as staff or player by checking their CUE guild roles
router.post('/moderation/discord/classify-members', express.json(), async (req, res) => {
  const { user_ids } = req.body;
  if (!Array.isArray(user_ids) || !user_ids.length) return res.json({ players: [], staff: [] });
  try {
    // Fetch all guild roles once, identify staff roles by name keywords
    const roles = await discordApi(`/guilds/${CU_GUILD_ID}/roles`);
    const staffRoleIds = new Set(
      roles
        .filter(r => /staff|mod(?:erator)?|admin|host|manager|lead|owner|organis/i.test(r.name))
        .map(r => r.id)
    );
    // Fetch each member in parallel
    const results = await Promise.all(user_ids.map(async uid => {
      try {
        const member = await discordApi(`/guilds/${CU_GUILD_ID}/members/${uid}`);
        const isStaff = (member.roles || []).some(rid => staffRoleIds.has(rid));
        return {
          id: uid,
          username: member.user?.username || uid,
          avatar: member.user?.avatar
            ? `https://cdn.discordapp.com/avatars/${uid}/${member.user.avatar}.png?size=32`
            : null,
          roles: (member.roles || []).map(rid => roles.find(r => r.id === rid)?.name).filter(Boolean),
          isStaff
        };
      } catch (_) {
        return { id: uid, username: uid, avatar: null, roles: [], isStaff: false };
      }
    }));
    res.json({
      players: results.filter(r => !r.isStaff),
      staff:   results.filter(r => r.isStaff)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/moderation/discord/messages/:channelId', async (req, res) => {
  try {
    const { before, after, limit = 50 } = req.query;
    let qs = `?limit=${Math.min(parseInt(limit)||50, 100)}`;
    if (before) qs += `&before=${before}`;
    if (after) qs += `&after=${after}`;

    // Fetch live messages from Discord
    const msgs = await discordApi(`/channels/${req.params.channelId}/messages${qs}`);
    const live = msgs.map(m => ({
      id: m.id,
      author: m.author.username,
      author_id: m.author.id,
      avatar: m.author.avatar ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png?size=64` : null,
      content: m.content,
      timestamp: m.timestamp,
      attachments: m.attachments.map(a => ({ url: a.url, name: a.filename, type: a.content_type })),
      embeds: m.embeds.length,
      deleted: false,
      edited: false
    }));

    // Find time window of the fetched batch to pull deleted messages in same range
    if (live.length) {
      const timestamps = live.map(m => new Date(m.timestamp));
      const minTime = new Date(Math.min(...timestamps) - 60000); // 1 min buffer
      const maxTime = new Date(Math.max(...timestamps) + 60000);
      const liveIds = new Set(live.map(m => m.id));

      const deleted = await db.query(
        `SELECT * FROM message_logs
         WHERE channel_id = $1 AND deleted = TRUE AND sent_at BETWEEN $2 AND $3`,
        [req.params.channelId, minTime, maxTime]
      );

      const deletedMsgs = deleted.rows
        .filter(r => !liveIds.has(r.message_id))
        .map(r => ({
          id: r.message_id,
          author: r.author_tag || 'Unknown',
          author_id: r.author_id,
          avatar: r.author_avatar,
          content: r.content || '',
          timestamp: r.sent_at,
          attachments: Array.isArray(r.attachments) ? r.attachments : [],
          embeds: 0,
          deleted: true,
          deleted_at: r.deleted_at,
          edited: r.edited,
          original_content: r.original_content
        }));

      // Also mark live messages that were edited
      if (live.length) {
        const editedRes = await db.query(
          `SELECT message_id, original_content FROM message_logs WHERE channel_id=$1 AND edited=TRUE AND message_id = ANY($2)`,
          [req.params.channelId, live.map(m => m.id)]
        );
        const editMap = new Map(editedRes.rows.map(r => [r.message_id, r.original_content]));
        live.forEach(m => { if (editMap.has(m.id)) { m.edited = true; m.original_content = editMap.get(m.id); } });
      }

      const merged = [...live, ...deletedMsgs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      return res.json(merged);
    }

    res.json(live);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Chat snippets ─────────────────────────────────────────────────────────────
// ── Player history lookup ──────────────────────────────────────────────────────
router.get('/moderation/player/:discordId/history', async (req, res) => {
  const id = req.params.discordId;
  const [flags, tickets, general, player, bans] = await Promise.all([
    db.query(`SELECT * FROM flagged_messages WHERE author_id=$1 ORDER BY flagged_at DESC`, [id]),
    db.query(`SELECT * FROM ticket_reports WHERE player_discord_id=$1 ORDER BY created_at DESC`, [id]),
    db.query(`SELECT * FROM general_reports WHERE player_discord_id=$1 ORDER BY created_at DESC`, [id]),
    db.query(`SELECT * FROM player_reports WHERE player_discord_id=$1 ORDER BY created_at DESC`, [id]),
    db.query(`SELECT * FROM moderation_bans WHERE discord_id=$1 OR player_discord_id=$1 ORDER BY banned_at DESC NULLS LAST`, [id]),
  ]);
  res.json({
    flags: flags.rows,
    tickets: tickets.rows,
    general: general.rows,
    playerReports: player.rows,
    bans: bans.rows,
  });
});

router.post('/moderation/snippets/save', express.json(), async (req, res) => {
  const { label, guild_id, guild_name, channel_id, channel_name, messages } = req.body;
  if (!messages || !messages.length) return res.status(400).json({ error: 'No messages' });
  const result = await db.query(
    `INSERT INTO chat_snippets (label, guild_id, guild_name, channel_id, channel_name, messages)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [(label||'').trim(), guild_id||null, guild_name||null, channel_id||null, channel_name||null, JSON.stringify(messages)]
  );
  res.json({ id: result.rows[0].id });
});

router.get('/moderation/snippets/:id', async (req, res) => {
  const row = (await db.query(`SELECT * FROM chat_snippets WHERE id=$1`, [req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/moderation/snippets/:id/delete', async (req, res) => {
  await db.query(`DELETE FROM chat_snippets WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/moderation#evidence');
});

// Attach snippet as evidence on a ban
router.post('/moderation/bans/:id/evidence/snippet', async (req, res) => {
  const snippetId = parseInt(req.body.snippet_id);
  if (!snippetId) return res.redirect(`/admin/moderation#ban-${req.params.id}`);
  await db.query(
    `INSERT INTO ban_evidence (ban_id, evidence_type, snippet_id, label) VALUES ($1,'snippet',$2,$3)`,
    [req.params.id, snippetId, (req.body.label||'').trim()]
  );
  res.redirect(`/admin/moderation#ban-${req.params.id}`);
});

// ── Ticket Reports ────────────────────────────────────────────────────────────
router.post('/moderation/ticket-reports/add', async (req, res) => {
  const { player_discord_id, player_discord_tag, summary, action_taken, severity, notes, snippet_id, staff_involved } = req.body;
  if (!player_discord_id || !player_discord_tag || !summary) return res.redirect('/admin/moderation#tickets');
  let avatar = null;
  try {
    const u = await discordApi(`/users/${player_discord_id.trim()}`);
    if (u.avatar) avatar = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`;
  } catch (_) {}
  const result = await db.query(
    `INSERT INTO ticket_reports (player_discord_id, player_discord_tag, player_discord_avatar, summary, action_taken, severity, notes, snippet_id, staff_involved, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      player_discord_id.trim(), player_discord_tag.trim(), avatar,
      summary.trim(), action_taken || 'warning', severity || 'low', (notes||'').trim(),
      snippet_id ? parseInt(snippet_id) : null, (staff_involved||'').trim() || null,
      req.session.user?.username || 'admin'
    ]
  );
  res.redirect(`/admin/moderation#ticket-${result.rows[0].id}`);
});

router.post('/moderation/ticket-reports/:id/notes', async (req, res) => {
  await db.query(`UPDATE ticket_reports SET notes=$1 WHERE id=$2`, [(req.body.notes||'').trim(), req.params.id]);
  res.redirect(`/admin/moderation#ticket-${req.params.id}`);
});

router.post('/moderation/ticket-reports/:id/delete', async (req, res) => {
  await db.query(`DELETE FROM ticket_reports WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/moderation#tickets');
});

// ── AI summarise (supports single snippet_id or array of snippet_ids) ─────────
router.post('/moderation/summarize', express.json(), async (req, res) => {
  // Accept snippet_ids (array) or legacy snippet_id (single)
  let snippetIds = req.body.snippet_ids || (req.body.snippet_id ? [req.body.snippet_id] : []);
  if (!Array.isArray(snippetIds)) snippetIds = [snippetIds];
  snippetIds = snippetIds.map(Number).filter(Boolean);
  if (!snippetIds.length) return res.status(400).json({ error: 'At least one snippet required' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'GEMINI_API_KEY not set on server. Add it in Render environment variables.' });

  // Fetch all requested snippets
  const snippetRows = (await Promise.all(
    snippetIds.map(id => db.query(`SELECT * FROM chat_snippets WHERE id=$1`, [id]).then(r => r.rows[0]))
  )).filter(Boolean);
  if (!snippetRows.length) return res.status(404).json({ error: 'Snippet not found' });

  // Merge all messages across snippets, sorted by timestamp
  const allMsgs = [];
  snippetRows.forEach(row => {
    (Array.isArray(row.messages) ? row.messages : []).forEach(m => allMsgs.push({ ...m, _source: row.label || `Snippet #${row.id}` }));
  });
  allMsgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const msgs = allMsgs;
  const row = snippetRows[0]; // for channel/guild name in prompt

  // Classify participants by actual guild roles
  const seen = new Map();
  msgs.forEach((m, i) => {
    const id = m.author_id || m.author;
    if (!seen.has(id)) seen.set(id, { username: m.author, id: m.author_id || null, firstIndex: i });
  });
  const uniqueIds = [...seen.values()].map(p => p.id).filter(Boolean);

  let player = null, staffList = [];
  try {
    const roles = await discordApi(`/guilds/${CU_GUILD_ID}/roles`);
    const staffRoleIds = new Set(
      roles.filter(r => /staff|mod(?:erator)?|admin|host|manager|lead|owner|organis/i.test(r.name)).map(r => r.id)
    );
    const members = await Promise.all(uniqueIds.map(async uid => {
      try {
        const m = await discordApi(`/guilds/${CU_GUILD_ID}/members/${uid}`);
        const isStaff = (m.roles||[]).some(rid => staffRoleIds.has(rid));
        return { id: uid, username: m.user?.username || uid, isStaff };
      } catch (_) { return { id: uid, username: seen.get(uid)?.username || uid, isStaff: false }; }
    }));
    const players = members.filter(m => !m.isStaff);
    staffList = members.filter(m => m.isStaff);
    player = players[0] || null;
  } catch (_) {
    // Fallback if guild lookup fails
    const parts = [...seen.values()];
    player = parts[0] || null;
    staffList = parts.slice(1);
  }

  const playerIds = new Set(player ? [player.id] : []);
  const formatted = msgs.map(m => {
    const ts = new Date(m.timestamp).toLocaleString('en-GB', { hour:'2-digit', minute:'2-digit', day:'numeric', month:'short' });
    const att = (m.attachments||[]).length ? ` [attachment: ${m.attachments.map(a=>a.name||'file').join(', ')}]` : '';
    const role = playerIds.has(m.author_id || m.author) ? '[player]' : '[staff]';
    return `[${ts}] ${role} ${m.author}: ${m.content||''}${att}`;
  }).join('\n');

  const sourceNote = snippetRows.length > 1
    ? `${snippetRows.length} conversations: ${snippetRows.map(s => s.label || `Snippet #${s.id}`).join(', ')}`
    : `channel: ${row.channel_name||'unknown'} in ${row.guild_name||'CUE Discord'}`;

  const prompt = `You are a moderation assistant for a Minecraft event Discord server called Collective Union Events (CUE). Analyse this Discord conversation${snippetRows.length > 1 ? ' (merged from multiple snippets)' : ''} and write a concise moderation log entry (3-5 sentences max).

The player (reported user): ${player ? `${player.username} (Discord ID: ${player.id||'unknown'})` : 'unknown'}
Staff involved: ${staffList.length ? staffList.map(s=>s.username).join(', ') : 'none identified'}

Identify: what the player did or requested, any key evidence shared, how staff responded, and what was decided or actioned. Write in past tense, factual tone. Do not include greetings or pleasantries.

Source: ${sourceNote}

${formatted}`;

  try {
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.3 }
        })
      }
    );
    const data = await aiRes.json();
    // Surface API-level errors (bad key, quota, etc.)
    if (data.error) return res.status(500).json({ error: `Gemini API error: ${data.error.message}` });
    const candidate = data.candidates?.[0];
    const summary = candidate?.content?.parts?.[0]?.text || '';
    // Only treat as a hard error if there's no text at all AND it's not a truncation
    if (!summary) {
      const reason = candidate?.finishReason || 'unknown';
      return res.status(500).json({ error: 'Gemini returned no text. Raw response: ' + JSON.stringify(data).slice(0, 300) });
    }
    // Safety block (SAFETY, RECITATION etc) — no usable text
    const finishReason = candidate?.finishReason;
    if (!summary && finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
      return res.status(500).json({ error: `Gemini blocked response (reason: ${finishReason}).` });
    }
    res.json({
      summary,
      player: player ? { id: player.id, username: player.username } : null,
      staff: staffList.map(s => s.username)
    });
  } catch (e) {
    res.status(500).json({ error: 'AI request failed: ' + e.message });
  }
});

// ── Unified report creation (new panel form) ──────────────────────────────────
router.post('/moderation/reports/add', evidenceUpload.array('files', 20), async (req, res) => {
  const { type, player_discord_id, player_discord_tag, summary, action_taken, severity,
          notes, staff_involved, incident_type, location, url, url_label } = req.body;
  let snippet_ids = req.body.snippet_ids || [];
  if (!Array.isArray(snippet_ids)) snippet_ids = snippet_ids ? [snippet_ids] : [];
  snippet_ids = snippet_ids.map(Number).filter(Boolean);

  if (!player_discord_id || !player_discord_tag || !summary)
    return res.redirect('/admin/moderation#reports');

  let avatar = null;
  try {
    const u = await discordApi(`/users/${player_discord_id.trim()}`);
    if (u.avatar) avatar = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`;
  } catch (_) {}

  const rType = type || 'ticket';
  let repId;

  if (rType === 'ticket') {
    const r = await db.query(
      `INSERT INTO ticket_reports (player_discord_id, player_discord_tag, player_discord_avatar, summary, action_taken, severity, notes, staff_involved, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [player_discord_id.trim(), player_discord_tag.trim(), avatar, summary.trim(),
       action_taken||'warning', severity||'low', (notes||'').trim(),
       (staff_involved||'').trim()||null, req.session.user?.username||'admin']
    );
    repId = r.rows[0].id;
  } else if (rType === 'general') {
    const r = await db.query(
      `INSERT INTO general_reports (player_discord_id, player_discord_tag, player_discord_avatar, summary, action_taken, severity, notes, staff_involved, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [player_discord_id.trim(), player_discord_tag.trim(), avatar, summary.trim(),
       action_taken||'warning', severity||'low', (notes||'').trim(),
       (staff_involved||'').trim()||null, req.session.user?.username||'admin']
    );
    repId = r.rows[0].id;
  } else { // player
    const r = await db.query(
      `INSERT INTO player_reports (player_discord_id, player_discord_tag, player_discord_avatar, player_ign,
         incident_type, location, summary, action_taken, severity, notes, staff_involved, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [player_discord_id.trim(), player_discord_tag.trim(), avatar,
       (req.body.player_ign||'').trim()||null, incident_type||'other',
       (location||'').trim()||null, summary.trim(), action_taken||'warning',
       severity||'low', (notes||'').trim(),
       (staff_involved||'').trim()||null, req.session.user?.username||'admin']
    );
    repId = r.rows[0].id;
  }

  // Insert snippet evidence
  for (const sid of snippet_ids) {
    await db.query(
      `INSERT INTO report_evidence (report_type, report_id, evidence_type, snippet_id) VALUES ($1,$2,'snippet',$3)`,
      [rType, repId, sid]
    );
  }
  // Insert file evidence
  for (const file of (req.files || [])) {
    await db.query(
      `INSERT INTO report_evidence (report_type, report_id, evidence_type, filename, label) VALUES ($1,$2,'file',$3,$4)`,
      [rType, repId, file.filename, file.originalname]
    );
  }
  // Insert URL evidence
  if ((url||'').trim()) {
    await db.query(
      `INSERT INTO report_evidence (report_type, report_id, evidence_type, url, label) VALUES ($1,$2,'url',$3,$4)`,
      [rType, repId, url.trim(), (url_label||'').trim()||null]
    );
  }

  res.redirect('/admin/moderation#reports');
});

// ── General Reports ───────────────────────────────────────────────────────────
router.post('/moderation/general-reports/add', async (req, res) => {
  const { player_discord_id, player_discord_tag, category, summary, action_taken, severity, notes, snippet_id } = req.body;
  if (!player_discord_id || !player_discord_tag || !summary) return res.redirect('/admin/moderation#general');
  let avatar = null;
  try {
    const u = await discordApi(`/users/${player_discord_id.trim()}`);
    if (u.avatar) avatar = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`;
  } catch (_) {}
  const { staff_involved } = req.body;
  const result = await db.query(
    `INSERT INTO general_reports (player_discord_id, player_discord_tag, player_discord_avatar, category, summary, action_taken, severity, notes, snippet_id, staff_involved, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      player_discord_id.trim(), player_discord_tag.trim(), avatar,
      category || 'other', summary.trim(), action_taken || 'warning', severity || 'low',
      (notes||'').trim(), snippet_id ? parseInt(snippet_id) : null,
      (staff_involved||'').trim() || null, req.session.user?.username || 'admin'
    ]
  );
  res.redirect(`/admin/moderation#general-${result.rows[0].id}`);
});

router.post('/moderation/general-reports/:id/notes', async (req, res) => {
  await db.query(`UPDATE general_reports SET notes=$1 WHERE id=$2`, [(req.body.notes||'').trim(), req.params.id]);
  res.redirect(`/admin/moderation#general-${req.params.id}`);
});

router.post('/moderation/general-reports/:id/delete', async (req, res) => {
  await db.query(`DELETE FROM report_evidence WHERE report_type='general' AND report_id=$1`, [req.params.id]);
  await db.query(`DELETE FROM general_reports WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/moderation#general');
});

// ── Report Evidence (shared across ticket / general / player reports) ─────────
router.post('/moderation/reports/:type/:id/evidence/file', evidenceUpload.array('files', 20), async (req, res) => {
  const { type, id } = req.params;
  const files = req.files || [];
  for (const file of files) {
    await db.query(
      `INSERT INTO report_evidence (report_type, report_id, evidence_type, filename, label) VALUES ($1,$2,'file',$3,$4)`,
      [type, parseInt(id), file.filename, file.originalname]
    );
  }
  res.redirect(`/admin/moderation#${type === 'player' ? 'player-report' : type}-${id}`);
});

router.post('/moderation/reports/:type/:id/evidence/url', async (req, res) => {
  const { type, id } = req.params;
  const { url, label } = req.body;
  if (url?.trim()) {
    await db.query(
      `INSERT INTO report_evidence (report_type, report_id, evidence_type, url, label) VALUES ($1,$2,'url',$3,$4)`,
      [type, parseInt(id), url.trim(), (label||'').trim() || null]
    );
  }
  res.redirect(`/admin/moderation#${type === 'player' ? 'player-report' : type}-${id}`);
});

router.post('/moderation/reports/:type/:id/evidence/snippet', async (req, res) => {
  const { type, id } = req.params;
  const { snippet_id, label } = req.body;
  if (snippet_id) {
    await db.query(
      `INSERT INTO report_evidence (report_type, report_id, evidence_type, snippet_id, label) VALUES ($1,$2,'snippet',$3,$4)`,
      [type, parseInt(id), parseInt(snippet_id), (label||'').trim() || null]
    );
  }
  res.redirect(`/admin/moderation#${type === 'player' ? 'player-report' : type}-${id}`);
});

router.post('/moderation/reports/evidence/:id/delete', async (req, res) => {
  const ev = (await db.query(`SELECT * FROM report_evidence WHERE id=$1`, [req.params.id])).rows[0];
  if (!ev) return res.redirect('/admin/moderation');
  if (ev.evidence_type === 'file' && ev.filename) {
    try { require('fs').unlinkSync(path.join(__dirname, '../../public/img/uploads/evidence', ev.filename)); } catch (_) {}
  }
  await db.query(`DELETE FROM report_evidence WHERE id=$1`, [req.params.id]);
  const anchor = ev.report_type === 'player' ? 'player-report' : ev.report_type;
  res.redirect(`/admin/moderation#${anchor}-${ev.report_id}`);
});

// ── Unified report edit ───────────────────────────────────────────────────────
router.post('/moderation/reports/:type/:id/edit', async (req, res) => {
  const { type, id } = req.params;
  const table = type === 'ticket' ? 'ticket_reports' : type === 'general' ? 'general_reports' : type === 'player' ? 'player_reports' : null;
  if (!table) return res.redirect('/admin/moderation#reports');
  const { summary, action_taken, severity, notes, staff_involved, incident_type, location } = req.body;
  if (!summary?.trim()) return res.redirect(`/admin/moderation#${type === 'player' ? 'player-report' : type}-${id}`);
  if (type === 'player') {
    await db.query(
      `UPDATE ${table} SET summary=$1, action_taken=$2, severity=$3, notes=$4, staff_involved=$5, incident_type=$6, location=$7 WHERE id=$8`,
      [summary.trim(), action_taken||'no_action', severity||'low', (notes||'').trim(), (staff_involved||'').trim()||null, incident_type||'other', (location||'').trim()||null, id]
    );
  } else {
    await db.query(
      `UPDATE ${table} SET summary=$1, action_taken=$2, severity=$3, notes=$4, staff_involved=$5 WHERE id=$6`,
      [summary.trim(), action_taken||'warning', severity||'low', (notes||'').trim(), (staff_involved||'').trim()||null, id]
    );
  }
  const anchor = type === 'player' ? 'player-report' : type;
  res.redirect(`/admin/moderation#${anchor}-${id}`);
});

// ── Unified report delete (new panel) ────────────────────────────────────────
router.post('/moderation/reports/:type/:id/delete', async (req, res) => {
  const { type, id } = req.params;
  const table = type === 'ticket' ? 'ticket_reports' : type === 'general' ? 'general_reports' : type === 'player' ? 'player_reports' : null;
  if (!table) return res.redirect('/admin/moderation#reports');
  await db.query(`DELETE FROM report_evidence WHERE report_type=$1 AND report_id=$2`, [type, id]);
  await db.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
  res.redirect('/admin/moderation#reports');
});

// ── Player Reports ────────────────────────────────────────────────────────────
router.post('/moderation/player-reports/add', evidenceUpload.array('files', 20), async (req, res) => {
  const { player_discord_id, player_discord_tag, player_ign, incident_type, location,
          summary, action_taken, severity, staff_involved, notes, snippet_id, ev_url, ev_url_label } = req.body;
  if (!player_discord_id || !player_discord_tag || !summary) return res.redirect('/admin/moderation#player-reports');
  let avatar = null;
  try {
    const u = await discordApi(`/users/${player_discord_id.trim()}`);
    if (u.avatar) avatar = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`;
  } catch (_) {}
  const result = await db.query(
    `INSERT INTO player_reports (player_discord_id, player_discord_tag, player_discord_avatar, player_ign,
       incident_type, location, summary, action_taken, severity, staff_involved, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      player_discord_id.trim(), player_discord_tag.trim(), avatar,
      (player_ign||'').trim() || null, incident_type || 'other', (location||'').trim() || null,
      summary.trim(), action_taken || 'no_action', severity || 'low',
      (staff_involved||'').trim() || null, (notes||'').trim(),
      req.session.user?.username || 'admin'
    ]
  );
  const repId = result.rows[0].id;
  // Attach snippet evidence if chosen
  if (snippet_id) {
    await db.query(
      `INSERT INTO report_evidence (report_type, report_id, evidence_type, snippet_id) VALUES ('player',$1,'snippet',$2)`,
      [repId, parseInt(snippet_id)]
    );
  }
  // Attach uploaded files
  for (const file of (req.files || [])) {
    await db.query(
      `INSERT INTO report_evidence (report_type, report_id, evidence_type, filename, label) VALUES ('player',$1,'file',$2,$3)`,
      [repId, file.filename, file.originalname]
    );
  }
  // Attach URL evidence
  if ((ev_url||'').trim()) {
    await db.query(
      `INSERT INTO report_evidence (report_type, report_id, evidence_type, url, label) VALUES ('player',$1,'url',$2,$3)`,
      [repId, ev_url.trim(), (ev_url_label||'').trim() || null]
    );
  }
  res.redirect(`/admin/moderation#player-report-${repId}`);
});

router.post('/moderation/player-reports/:id/notes', async (req, res) => {
  await db.query(`UPDATE player_reports SET notes=$1 WHERE id=$2`, [(req.body.notes||'').trim(), req.params.id]);
  res.redirect(`/admin/moderation#player-report-${req.params.id}`);
});

router.post('/moderation/player-reports/:id/delete', async (req, res) => {
  // Delete associated file evidence from disk
  const evRes = await db.query(`SELECT * FROM report_evidence WHERE report_type='player' AND report_id=$1 AND evidence_type='file'`, [req.params.id]);
  for (const ev of evRes.rows) {
    try { require('fs').unlinkSync(path.join(__dirname, '../../public/img/uploads/evidence', ev.filename)); } catch (_) {}
  }
  await db.query(`DELETE FROM report_evidence WHERE report_type='player' AND report_id=$1`, [req.params.id]);
  await db.query(`DELETE FROM player_reports WHERE id=$1`, [req.params.id]);
  res.redirect('/admin/moderation#player-reports');
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

router.post('/hundred/:id/maybe', async (req, res) => {
  await db.query(
    `UPDATE hundred_applications SET status='maybe' WHERE id=$1`, [req.params.id]
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

// MC Usernames tab — verified players + unverified players with a valid Mojang account
router.get('/mc-usernames', async (req, res) => {
  const rows = (await db.query(`
    SELECT discord_id, discord_tag, discord_avatar, ign, ign_verified, ign_mojang_valid,
           (SELECT true FROM nation_leader_applications n WHERE n.discord_id = h.discord_id AND n.accepted = true LIMIT 1) AS is_nation_leader
    FROM hundred_applications h
    WHERE status = 'accepted'
      AND ign IS NOT NULL AND ign != ''
      AND (ign_verified = true OR ign_mojang_valid = true)
    UNION
    SELECT n.discord_id, n.discord_tag, n.discord_avatar, n.ign, n.ign_verified, n.ign_mojang_valid, true AS is_nation_leader
    FROM nation_leader_applications n
    WHERE n.accepted = true
      AND n.ign IS NOT NULL AND n.ign != ''
      AND (n.ign_verified = true OR n.ign_mojang_valid = true)
      AND NOT EXISTS (SELECT 1 FROM hundred_applications h WHERE h.discord_id = n.discord_id AND h.status = 'accepted')
    ORDER BY ign ASC
  `)).rows;
  res.json(rows);
});

// Trigger Mojang validity check for all unverified players that haven't been checked yet
router.post('/check-ign-validity', async (req, res) => {
  const unverified = (await db.query(`
    SELECT discord_id, ign FROM hundred_applications
    WHERE status = 'accepted'
      AND ign IS NOT NULL AND ign != ''
      AND ign_verified = false
      AND ign_mojang_valid IS NULL
    UNION
    SELECT discord_id, ign FROM nation_leader_applications
    WHERE accepted = true
      AND ign IS NOT NULL AND ign != ''
      AND ign_verified = false
      AND ign_mojang_valid IS NULL
  `)).rows;

  res.json({ queued: unverified.length });

  // Run checks asynchronously after responding so the request doesn't time out
  (async () => {
    for (const p of unverified) {
      try {
        const r = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(p.ign)}`);
        const valid = r.ok && r.status === 200;
        await db.query(`UPDATE hundred_applications SET ign_mojang_valid = $1 WHERE discord_id = $2`, [valid, p.discord_id]);
        await db.query(`UPDATE nation_leader_applications SET ign_mojang_valid = $1 WHERE discord_id = $2`, [valid, p.discord_id]);
      } catch (_) {}
      await new Promise(r => setTimeout(r, 300)); // stay under Mojang rate limit
    }
  })();
});

// Nation map (admin view)
router.get('/nation-map', async (req, res) => {
  const all = (await db.query(
    `SELECT server_name, map_x, map_z, discord_id FROM nation_leader_applications WHERE accepted = true ORDER BY server_name ASC`
  )).rows;
  const markers = all.filter(r => r.map_x != null && r.map_z != null);
  const waiting = all.filter(r => r.map_x == null);
  const regions = (await db.query(`SELECT * FROM mining_regions ORDER BY id ASC`)).rows;
  res.render('new/admin-nation-map', { markers, waiting, regions, isFullAdmin: !!res.locals.isFullAdmin });
});

router.post('/nation-map/place', async (req, res) => {
  const { discord_id, map_x, map_z } = req.body;
  const x = parseInt(map_x), z = parseInt(map_z);
  if (!discord_id || isNaN(x) || isNaN(z)) return res.redirect('/admin/nation-map');
  if (x < -2560 || x > 2560 || z < -2560 || z > 2560) return res.redirect('/admin/nation-map');
  await db.query(
    `UPDATE nation_leader_applications SET map_x = $1, map_z = $2 WHERE discord_id = $3 AND accepted = true`,
    [x, z, discord_id]
  );
  res.redirect('/admin/nation-map');
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

// ── Kill ticket system ────────────────────────────────────────────────────────

db.query(`
  CREATE TABLE IF NOT EXISTS kill_ticket_config (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    guild_name TEXT,
    post_channel_id TEXT,
    category_id TEXT,
    staff_role_ids TEXT DEFAULT '',
    panel_payload JSONB,
    ticket_intro TEXT DEFAULT '',
    enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(console.error);
db.query(`ALTER TABLE kill_ticket_config ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE`).catch(() => {});

router.get('/kill-tickets', requireAdminOrStaff, async (req, res) => {
  const configs = (await db.query(`SELECT * FROM kill_ticket_config ORDER BY updated_at DESC`)).rows;
  res.render('new/admin-kill-tickets', { configs });
});

router.post('/kill-tickets/save', requireAdminOrStaff, async (req, res) => {
  const { id, guild_id, guild_name, post_channel_id, category_id, staff_role_ids, ticket_intro, panel_payload } = req.body;
  if (!guild_id) return res.json({ ok: false, error: 'Guild ID required' });
  let payload;
  try { payload = typeof panel_payload === 'string' ? JSON.parse(panel_payload) : panel_payload; }
  catch (e) { return res.json({ ok: false, error: 'Invalid panel payload JSON' }); }

  if (id) {
    await db.query(
      `UPDATE kill_ticket_config SET guild_id=$1, guild_name=$2, post_channel_id=$3, category_id=$4, staff_role_ids=$5, ticket_intro=$6, panel_payload=$7, updated_at=NOW() WHERE id=$8`,
      [guild_id, guild_name || '', post_channel_id || '', category_id || '', staff_role_ids || '', ticket_intro || '', JSON.stringify(payload), id]
    );
    res.json({ ok: true, id: parseInt(id) });
  } else {
    const r = await db.query(
      `INSERT INTO kill_ticket_config (guild_id, guild_name, post_channel_id, category_id, staff_role_ids, ticket_intro, panel_payload) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [guild_id, guild_name || '', post_channel_id || '', category_id || '', staff_role_ids || '', ticket_intro || '', JSON.stringify(payload)]
    );
    res.json({ ok: true, id: r.rows[0].id });
  }
});

router.delete('/kill-tickets/:id', requireAdminOrStaff, async (req, res) => {
  await db.query(`DELETE FROM kill_ticket_config WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

router.post('/kill-tickets/:id/toggle', requireAdminOrStaff, async (req, res) => {
  const r = await db.query(
    `UPDATE kill_ticket_config SET enabled = NOT COALESCE(enabled, true), updated_at = NOW() WHERE id = $1 RETURNING enabled`,
    [req.params.id]
  );
  if (!r.rows[0]) return res.json({ ok: false, error: 'Not found' });
  res.json({ ok: true, enabled: r.rows[0].enabled });
});

router.post('/kill-tickets/:id/post', requireAdminOrStaff, async (req, res) => {
  const cfg = (await db.query(`SELECT * FROM kill_ticket_config WHERE id=$1`, [req.params.id])).rows[0];
  if (!cfg) return res.json({ ok: false, error: 'Config not found' });
  if (!cfg.post_channel_id) return res.json({ ok: false, error: 'No channel configured' });

  const payload = cfg.panel_payload || {};
  const token = process.env.DISCORD_TOKEN;

  const r = await fetch(`${DISCORD_API}/channels/${cfg.post_channel_id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${token}` },
    body: JSON.stringify({
      content: payload.content || undefined,
      embeds: payload.embeds?.length ? payload.embeds : undefined,
      components: [{
        type: 1,
        components: [{
          type: 2,
          style: payload.button_style || 4,
          label: payload.button_label || '☠️ Submit Kill Request',
          custom_id: `kill_ticket_open:${cfg.id}`
        }]
      }]
    })
  });

  if (!r.ok) {
    let msg = 'Discord API error';
    try { msg = (await r.json()).message || msg; } catch (_) {}
    return res.json({ ok: false, error: msg });
  }
  res.json({ ok: true });
});

// Close the most recent event (500-player applications)
router.post('/event/close-current', async (req, res) => {
  await db.query(
    `UPDATE events SET is_open=false WHERE id=(SELECT id FROM events ORDER BY created_at DESC LIMIT 1)`
  );
  res.json({ ok: true, closed: true });
});

// ── Rival server cross-reference ──────────────────────────────────────────────

router.get('/rival-check', requireAdminOrStaff, (req, res) => {
  res.render('new/admin-rival-check', { results: null, pastedInput: '' });
});

router.post('/rival-check', requireAdminOrStaff, async (req, res) => {
  const raw = (req.body.ids || '').trim();
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const seen = new Set();
  const ids = [];
  let skipped = 0;
  for (const l of lines) {
    if (!/^\d{17,19}$/.test(l)) { skipped++; continue; }
    if (seen.has(l)) { skipped++; continue; }
    seen.add(l);
    ids.push(l);
  }

  const nlIds = new Set(
    (await db.query(`SELECT discord_id FROM nation_leader_applications WHERE accepted = true`)).rows.map(r => r.discord_id)
  );

  let hits = [];
  if (ids.length) {
    const res2 = await db.query(
      `SELECT discord_id, discord_tag, ign, ign_verified FROM hundred_applications
       WHERE status = 'accepted' AND discord_id = ANY($1)`,
      [ids]
    );
    hits = res2.rows.map(r => ({ ...r, is_nation_leader: nlIds.has(r.discord_id) }));
  }

  res.render('new/admin-rival-check', {
    results: { checkedCount: ids.length, hits, skipped },
    pastedInput: raw
  });
});

// ── Mass kick preview ─────────────────────────────────────────────────────────

const KICK_PASSWORD = '1234';
const DISCORD_API_BASE = 'https://discord.com/api/v10';

const PROTECTED_ROLE_KEYWORDS = ['staff', 'mod', 'manager', 'owner', 'admin', '150', 'event', 'player'];
const ADMIN_PERMS = BigInt('0x8');       // ADMINISTRATOR
const MANAGE_PERMS = BigInt('0x20');     // MANAGE_GUILD

async function fetchProtectedRoleIds(guildId, token) {
  const r = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${token}` }
  });
  if (!r.ok) return new Set();
  const roles = await r.json();
  const protected_ = new Set();
  for (const role of roles) {
    const nameLower = role.name.toLowerCase();
    if (PROTECTED_ROLE_KEYWORDS.some(kw => nameLower.includes(kw))) {
      protected_.add(role.id);
      continue;
    }
    try {
      const perms = BigInt(role.permissions || '0');
      if ((perms & ADMIN_PERMS) || (perms & MANAGE_PERMS)) protected_.add(role.id);
    } catch (_) {}
  }
  return protected_;
}

async function fetchAllMembers(guildId, token) {
  const members = [];
  let after = '0';
  while (true) {
    const r = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members?limit=1000&after=${after}`, {
      headers: { Authorization: `Bot ${token}` }
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Discord API error ${r.status}: ${err}`);
    }
    const page = await r.json();
    if (!page.length) break;
    members.push(...page);
    if (page.length < 1000) break;
    after = page[page.length - 1].user.id;
  }
  return members;
}

router.get('/kick-preview', requireAdminOrStaff, (req, res) => {
  res.render('new/admin-kick-preview', { preview: null, error: null, authed: false, executed: false });
});

router.post('/kick-preview', requireAdminOrStaff, async (req, res) => {
  if (req.body.password !== KICK_PASSWORD) {
    return res.render('new/admin-kick-preview', { preview: null, error: 'Wrong password.', authed: false, executed: false });
  }

  const token = process.env.DISCORD_TOKEN;
  const nations = (await db.query(
    `SELECT guild_id, server_name, discord_id FROM nation_leader_applications WHERE accepted = true AND guild_id IS NOT NULL`
  )).rows;
  const acceptedIds = new Set(
    (await db.query(`SELECT discord_id FROM hundred_applications WHERE status = 'accepted'`)).rows.map(r => r.discord_id)
  );
  const nationLeaderIds = new Set(nations.map(n => n.discord_id));

  // Build set of CUE main server staff so they are never kicked from nation servers
  const [cueStaffRoleIds, cueMembersAll] = await Promise.all([
    fetchProtectedRoleIds(CU_GUILD_ID, token),
    fetchAllMembers(CU_GUILD_ID, token)
  ]);
  const cueStaffIds = new Set(
    cueMembersAll.filter(m => m.roles.some(rid => cueStaffRoleIds.has(rid))).map(m => m.user.id)
  );

  const preview = [];
  for (const nation of nations) {
    if (nation.guild_id === CU_GUILD_ID) continue;
    try {
      const [members, protectedRoleIds] = await Promise.all([
        fetchAllMembers(nation.guild_id, token),
        fetchProtectedRoleIds(nation.guild_id, token)
      ]);
      const toKick = members.filter(m =>
        !m.user.bot &&
        !acceptedIds.has(m.user.id) &&
        !nationLeaderIds.has(m.user.id) &&
        !cueStaffIds.has(m.user.id) &&
        !m.roles.some(rid => protectedRoleIds.has(rid))
      );
      const protected_ = members.filter(m =>
        !m.user.bot &&
        !acceptedIds.has(m.user.id) &&
        !nationLeaderIds.has(m.user.id) &&
        !cueStaffIds.has(m.user.id) &&
        m.roles.some(rid => protectedRoleIds.has(rid))
      );
      preview.push({
        server_name: nation.server_name,
        guild_id: nation.guild_id,
        leader_id: nation.discord_id,
        total: members.length,
        to_kick: toKick.map(m => ({ id: m.user.id, tag: m.user.global_name || m.user.username })),
        protected_count: protected_.length
      });
    } catch (err) {
      preview.push({ server_name: nation.server_name, guild_id: nation.guild_id, error: err.message });
    }
  }

  res.render('new/admin-kick-preview', { preview, error: null, authed: true, executed: false });
});

router.post('/kick-execute', requireAdminOrStaff, async (req, res) => {
  if (req.body.password !== KICK_PASSWORD) {
    return res.render('new/admin-kick-preview', { preview: null, error: 'Wrong password.', authed: false });
  }

  const token = process.env.DISCORD_TOKEN;
  const nations = (await db.query(
    `SELECT guild_id, server_name, discord_id FROM nation_leader_applications WHERE accepted = true AND guild_id IS NOT NULL`
  )).rows;
  const acceptedIds = new Set(
    (await db.query(`SELECT discord_id FROM hundred_applications WHERE status = 'accepted'`)).rows.map(r => r.discord_id)
  );
  const nationLeaderIds = new Set(nations.map(n => n.discord_id));

  const [cueStaffRoleIds, cueMembersAll] = await Promise.all([
    fetchProtectedRoleIds(CU_GUILD_ID, token),
    fetchAllMembers(CU_GUILD_ID, token)
  ]);
  const cueStaffIds = new Set(
    cueMembersAll.filter(m => m.roles.some(rid => cueStaffRoleIds.has(rid))).map(m => m.user.id)
  );

  const results = [];
  for (const nation of nations) {
    if (nation.guild_id === CU_GUILD_ID) continue;
    let kicked = 0, failed = 0, errors = [];
    try {
      const [members, protectedRoleIds] = await Promise.all([
        fetchAllMembers(nation.guild_id, token),
        fetchProtectedRoleIds(nation.guild_id, token)
      ]);
      const toKick = members.filter(m =>
        !m.user.bot &&
        !acceptedIds.has(m.user.id) &&
        !nationLeaderIds.has(m.user.id) &&
        !cueStaffIds.has(m.user.id) &&
        !m.roles.some(rid => protectedRoleIds.has(rid))
      );
      for (const m of toKick) {
        try {
          const r = await fetch(`${DISCORD_API_BASE}/guilds/${nation.guild_id}/members/${m.user.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bot ${token}`, 'X-Audit-Log-Reason': 'Mass kick: not in event' }
          });
          if (r.ok || r.status === 204) {
            kicked++;
          } else {
            failed++;
            errors.push(`${m.user.username}: HTTP ${r.status}`);
          }
        } catch (e) {
          failed++;
          errors.push(`${m.user.username}: ${e.message}`);
        }
        // Rate limit: ~1 kick per 200ms
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      errors.push(`Fetch members failed: ${err.message}`);
    }
    results.push({ server_name: nation.server_name, guild_id: nation.guild_id, kicked, failed, errors });
  }

  res.render('new/admin-kick-preview', { preview: results, error: null, authed: true, executed: true });
});

// ── Recording timeline ───────────────────────────────────────────────────────

router.get('/recordings', async (req, res) => {
  const rows = (await db.query(
    `SELECT * FROM recording_submissions ORDER BY day ASC, submitted_at ASC`
  )).rows;
  const byDay = {};
  for (let d = 1; d <= 6; d++) byDay[d] = [];
  for (const r of rows) {
    if (byDay[r.day]) byDay[r.day].push(r);
  }
  res.render('new/admin-recordings', { byDay });
});

// Post the open-ticket panel into a channel
router.post('/recording/post-panel', async (req, res) => {
  const { channel_id } = req.body;
  if (!channel_id) return res.json({ ok: false, error: 'channel_id required' });
  const token = process.env.DISCORD_TOKEN;
  const payload = {
    content: '**Recording Submissions**\n\nDid you capture any footage, screenshots, or moments from the event?\n\nClick the button below to open a private ticket and submit your content. You will be asked to select which day it\'s from (Day 1–6).',
    components: [{
      type: 1,
      components: [{ type: 2, style: 1, label: 'Submit a Recording', custom_id: 'recording_open' }]
    }]
  };
  const r = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const err = await r.text();
    return res.json({ ok: false, error: err });
  }
  res.json({ ok: true });
});

// Collect all recordings from ticket channels via Discord REST (alternative to slash command)
router.post('/recording/collect', async (req, res) => {
  try {
  const token = process.env.DISCORD_TOKEN;
  const guild_id = (req.body && req.body.guild_id) || CU_GUILD_ID;

  const chRes = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/channels`, {
    headers: { Authorization: `Bot ${token}` }
  });
  if (!chRes.ok) {
    const errText = await chRes.text();
    return res.json({ ok: false, error: `Discord channels fetch failed (${chRes.status}): ${errText.slice(0, 200)}` });
  }
  const channels = await chRes.json();
  const ticketChannels = channels.filter(c => c.topic && c.topic.startsWith('recording-ticket:'));

  let collected = 0;
  for (const ch of ticketChannels) {
    const [, dayStr, userId] = ch.topic.split(':');
    const day = parseInt(dayStr);
    if (!day || day < 1 || day > 6 || !userId) continue;

    let lastId = null;
    while (true) {
      let url = `https://discord.com/api/v10/channels/${ch.id}/messages?limit=100`;
      if (lastId) url += `&before=${lastId}`;
      const msgRes = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
      if (!msgRes.ok) break;
      const msgs = await msgRes.json();
      if (!msgs.length) break;

      for (const msg of msgs) {
        if (msg.author.bot || msg.author.id !== userId) continue;
        if (msg.content && msg.content.trim()) {
          await db.query(`
            INSERT INTO recording_submissions
              (message_id, channel_id, day, discord_id, discord_tag, discord_avatar, content_type, message_text, submitted_at)
            VALUES ($1,$2,$3,$4,$5,$6,'text',$7,$8)
            ON CONFLICT (message_id) DO NOTHING
          `, [msg.id + '_text', ch.id, day, userId, msg.author.username,
              msg.author.avatar ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png` : null,
              msg.content.trim(), msg.timestamp]);
          collected++;
        }
        for (const att of (msg.attachments || [])) {
          await db.query(`
            INSERT INTO recording_submissions
              (message_id, channel_id, day, discord_id, discord_tag, discord_avatar, content_type, attachment_url, attachment_filename, attachment_mime, attachment_size, submitted_at)
            VALUES ($1,$2,$3,$4,$5,$6,'attachment',$7,$8,$9,$10,$11)
            ON CONFLICT (message_id) DO NOTHING
          `, [msg.id + '_' + att.id, ch.id, day, userId, msg.author.username,
              msg.author.avatar ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png` : null,
              att.url, att.filename, att.content_type || null, att.size, msg.timestamp]);
          collected++;
        }
      }

      lastId = msgs[msgs.length - 1].id;
      if (msgs.length < 100) break;
    }
  }

  res.json({ ok: true, collected, channels: ticketChannels.length });
  } catch (err) {
    console.error('recording/collect error:', err);
    res.json({ ok: false, error: err.message });
  }
});

module.exports = router;
