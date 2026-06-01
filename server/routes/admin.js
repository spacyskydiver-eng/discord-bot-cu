const express = require('express');
const router = express.Router();
const db = require('../../db');

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
  let questions = [], applications = [];
  if (event) {
    questions = (await db.query(
      `SELECT * FROM application_questions WHERE event_id = $1 ORDER BY order_num`, [event.id]
    )).rows;
    applications = (await db.query(
      `SELECT a.*, COUNT(aa.id) as answer_count FROM applications a
       LEFT JOIN application_answers aa ON aa.application_id = a.id
       WHERE a.event_id = $1 GROUP BY a.id ORDER BY a.submitted_at DESC`,
      [event.id]
    )).rows;
  }

  // Guild config for bot dashboard
  const guildRes = await db.query(`SELECT * FROM guild_config LIMIT 10`);
  const levels = event ? (await db.query(
    `SELECT guild_id, level_number, level_name, xp_required FROM level_config ORDER BY guild_id, level_number`
  )).rows : [];

  res.render('admin', { event, questions, applications, guilds: guildRes.rows, levels });
});

// View single application
router.get('/application/:id', async (req, res) => {
  const appRes = await db.query(`SELECT * FROM applications WHERE id = $1`, [req.params.id]);
  if (!appRes.rows.length) return res.redirect('/admin');
  const app = appRes.rows[0];
  const answers = (await db.query(
    `SELECT aa.answer_text, aq.question_text FROM application_answers aa
     JOIN application_questions aq ON aq.id = aa.question_id
     WHERE aa.application_id = $1 ORDER BY aq.order_num`,
    [req.params.id]
  )).rows;
  res.render('admin-application', { application: app, answers });
});

// Update application status
router.post('/application/:id/status', async (req, res) => {
  await db.query(`UPDATE applications SET status = $1 WHERE id = $2`, [req.body.status, req.params.id]);
  res.redirect(`/admin/application/${req.params.id}`);
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

// Add question
router.post('/question/add', async (req, res) => {
  const { event_id, question_text, question_type, order_num } = req.body;
  await db.query(
    `INSERT INTO application_questions (event_id, question_text, question_type, order_num) VALUES ($1,$2,$3,$4)`,
    [event_id, question_text, question_type || 'textarea', parseInt(order_num) || 0]
  );
  res.redirect('/admin');
});

// Delete question
router.post('/question/delete', async (req, res) => {
  await db.query(`DELETE FROM application_questions WHERE id = $1`, [req.body.id]);
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

// Bot: save levels
router.post('/bot/levels', async (req, res) => {
  const { guild_id, level_numbers, level_names, level_xp } = req.body;
  await db.query(`DELETE FROM level_config WHERE guild_id = $1`, [guild_id]);
  const nums = Array.isArray(level_numbers) ? level_numbers : [level_numbers];
  const names = Array.isArray(level_names) ? level_names : [level_names];
  const xps = Array.isArray(level_xp) ? level_xp : [level_xp];
  for (let i = 0; i < nums.length; i++) {
    if (!nums[i] || !names[i] || !xps[i]) continue;
    await db.query(
      `INSERT INTO level_config (guild_id, level_number, level_name, xp_required) VALUES ($1,$2,$3,$4)`,
      [guild_id, parseInt(nums[i]), names[i], parseInt(xps[i])]
    );
  }
  res.redirect('/admin?saved=levels#bot');
});

module.exports = router;
