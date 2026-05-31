const express = require('express');
const router = express.Router();
const db = require('../../db');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/auth/discord');
  next();
}

// Anyone can view the apply page — login only required to submit
router.get('/', async (req, res) => {
  const eventRes = await db.query(`SELECT * FROM events ORDER BY created_at DESC LIMIT 1`);
  const event = eventRes.rows[0] || null;

  let questions = [];
  let existing = null;

  if (event) {
    questions = (await db.query(
      `SELECT * FROM application_questions WHERE event_id = $1 ORDER BY order_num`,
      [event.id]
    )).rows;

    if (req.session.user) {
      existing = (await db.query(
        `SELECT * FROM applications WHERE event_id = $1 AND discord_id = $2`,
        [event.id, req.session.user.id]
      )).rows[0] || null;
    }
  }

  res.render('apply', { event, questions, existing, submitted: req.query.submitted === '1' });
});

router.post('/submit', requireLogin, async (req, res) => {
  const eventRes = await db.query(`SELECT * FROM events ORDER BY created_at DESC LIMIT 1`);
  const event = eventRes.rows[0];
  if (!event || !event.is_open) return res.redirect('/apply');

  const existing = (await db.query(
    `SELECT id FROM applications WHERE event_id = $1 AND discord_id = $2`,
    [event.id, req.session.user.id]
  )).rows[0];
  if (existing) return res.redirect('/apply');

  const appRes = await db.query(
    `INSERT INTO applications (event_id, discord_id, discord_username, discord_avatar) VALUES ($1,$2,$3,$4) RETURNING id`,
    [event.id, req.session.user.id, req.session.user.username, req.session.user.avatar]
  );
  const appId = appRes.rows[0].id;

  const questions = (await db.query(
    `SELECT id FROM application_questions WHERE event_id = $1 ORDER BY order_num`,
    [event.id]
  )).rows;

  for (const q of questions) {
    const answer = req.body[`q_${q.id}`] || '';
    await db.query(
      `INSERT INTO application_answers (application_id, question_id, answer_text) VALUES ($1,$2,$3)`,
      [appId, q.id, answer]
    );
  }

  res.redirect('/apply?submitted=1');
});

module.exports = router;
