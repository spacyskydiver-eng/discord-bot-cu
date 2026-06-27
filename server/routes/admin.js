const express = require('express');
const router = express.Router();
const db = require('../../db');
const multer = require('multer');
const path = require('path');

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

function requireAdmin(req, res, next) {
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(s => s.trim());
  if (!req.session.user || !adminIds.includes(req.session.user.id)) {
    return res.status(403).render('403');
  }
  next();
}

router.use(requireAdmin);

// Admin dashboard
router.get('/', async (req, res) => {
  const eventRes = await db.query(`SELECT * FROM events ORDER BY created_at DESC LIMIT 1`);
  const event = eventRes.rows[0] || null;

  const eligibilityQuestions = (await db.query(
    `SELECT * FROM eligibility_questions ORDER BY display_order ASC, id ASC`
  )).rows;

  const applications = (await db.query(
    `SELECT * FROM structured_applications ORDER BY submitted_at DESC`
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
    event, eligibilityQuestions, applications,
    guilds: guildRes.rows, levels, levelRoles, staffRoles, staffAccess,
    stageSettings, stageBlocks, agreementItems, playstyleOptions
  });
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

// View single application
router.get('/application/:id', async (req, res) => {
  const appRes = await db.query(`SELECT * FROM structured_applications WHERE id = $1`, [req.params.id]);
  if (!appRes.rows.length) return res.redirect('/admin');
  const app = appRes.rows[0];
  const eligibilityQuestions = (await db.query(
    `SELECT * FROM eligibility_questions ORDER BY display_order ASC, id ASC`
  )).rows;
  res.render('admin-application', { app, eligibilityQuestions });
});

// Update application status (manual override / reset)
router.post('/application/:id/status', async (req, res) => {
  const { status } = req.body;
  if (status === 'pending') {
    await db.query(
      `UPDATE structured_applications SET status='pending', accepted_at=NULL, declined_at_stage=NULL, review_stage=2 WHERE id=$1`,
      [req.params.id]
    );
  } else if (status === 'accepted') {
    await db.query(
      `UPDATE structured_applications SET status='accepted', accepted_at=$1 WHERE id=$2`,
      [new Date(), req.params.id]
    );
  } else if (status === 'declined') {
    await db.query(
      `UPDATE structured_applications SET status='declined' WHERE id=$1`,
      [req.params.id]
    );
  }
  res.redirect(`/admin/application/${req.params.id}`);
});

// Pass current review stage (advance to next, or accept if at stage 6)
router.post('/application/:id/pass-stage', async (req, res) => {
  const appRes = await db.query(`SELECT review_stage FROM structured_applications WHERE id = $1`, [req.params.id]);
  if (!appRes.rows.length) return res.redirect('/admin');
  const stage = appRes.rows[0].review_stage || 2;
  if (stage >= 6) {
    await db.query(
      `UPDATE structured_applications SET status='accepted', accepted_at=$1 WHERE id=$2`,
      [new Date(), req.params.id]
    );
  } else {
    await db.query(
      `UPDATE structured_applications SET review_stage=$1 WHERE id=$2`,
      [stage + 1, req.params.id]
    );
  }
  res.redirect(`/admin/application/${req.params.id}`);
});

// Decline at current review stage
router.post('/application/:id/decline-stage', async (req, res) => {
  const appRes = await db.query(`SELECT review_stage FROM structured_applications WHERE id = $1`, [req.params.id]);
  if (!appRes.rows.length) return res.redirect('/admin');
  const stage = appRes.rows[0].review_stage || 2;
  await db.query(
    `UPDATE structured_applications SET status='declined', declined_at_stage=$1 WHERE id=$2`,
    [stage, req.params.id]
  );
  res.redirect(`/admin/application/${req.params.id}`);
});

// Save admin notes
router.post('/application/:id/notes', async (req, res) => {
  await db.query(
    `UPDATE structured_applications SET admin_notes = $1 WHERE id = $2`,
    [req.body.notes || null, req.params.id]
  );
  res.redirect(`/admin/application/${req.params.id}`);
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
  const { title, description, opens_at, closes_at } = req.body;
  await db.query(
    `INSERT INTO events (title, description, opens_at, closes_at) VALUES ($1,$2,$3,$4)`,
    [title, description, opens_at || null, closes_at || null]
  );
  res.redirect('/admin');
});

// Update event
router.post('/event/update', async (req, res) => {
  const { id, title, description, opens_at, closes_at, is_open } = req.body;
  await db.query(
    `UPDATE events SET title=$1, description=$2, opens_at=$3, closes_at=$4, is_open=$5 WHERE id=$6`,
    [title, description, opens_at || null, closes_at || null, is_open === 'true', id]
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

// Image upload — saves to public/img/uploads, returns public URL
router.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.json({ ok: false, error: 'No file received' });
  const url = `/img/uploads/${req.file.filename}`;
  res.json({ ok: true, url });
});

// Webhook sender — forwards payload to Discord webhook URL
router.post('/webhook/send', async (req, res) => {
  const { webhook_url, payload } = req.body;
  if (!webhook_url || !webhook_url.startsWith('https://discord.com/api/webhooks/')) {
    return res.json({ ok: false, error: 'Invalid webhook URL. Must start with https://discord.com/api/webhooks/' });
  }
  try {
    const https = require('https');
    const body = JSON.stringify(payload);
    const url = new URL(webhook_url);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const result = await new Promise((resolve, reject) => {
      const req2 = https.request(options, r => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => resolve({ status: r.statusCode, body: data }));
      });
      req2.on('error', reject);
      req2.write(body);
      req2.end();
    });
    if (result.status >= 200 && result.status < 300) {
      res.json({ ok: true });
    } else {
      let errMsg = result.body;
      try { errMsg = JSON.parse(result.body).message || errMsg; } catch(e) {}
      res.json({ ok: false, error: `Discord returned ${result.status}: ${errMsg}` });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
