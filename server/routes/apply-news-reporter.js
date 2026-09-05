const express = require('express');
const router = express.Router();
const db = require('../../db');

router.get('/', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);

  // Must be accepted for the 150 player event and not a nation leader
  const [eventCheck, nationCheck] = await Promise.all([
    db.query(`SELECT id FROM hundred_applications WHERE discord_id = $1 AND status = 'accepted'`, [req.session.user.id]),
    db.query(`SELECT id FROM nation_leader_applications WHERE discord_id = $1 AND accepted = true`, [req.session.user.id])
  ]);
  if (!eventCheck.rows.length || nationCheck.rows.length) {
    return res.render('new/apply-news-reporter', { state: 'not_eligible', existing: null });
  }

  const existing = (await db.query(
    `SELECT * FROM news_reporter_applications WHERE discord_id = $1`,
    [req.session.user.id]
  )).rows[0] || null;

  res.render('new/apply-news-reporter', { state: 'open', existing });
});

router.post('/submit', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);

  const [eventCheck, nationCheck] = await Promise.all([
    db.query(`SELECT id FROM hundred_applications WHERE discord_id = $1 AND status = 'accepted'`, [req.session.user.id]),
    db.query(`SELECT id FROM nation_leader_applications WHERE discord_id = $1 AND accepted = true`, [req.session.user.id])
  ]);
  if (!eventCheck.rows.length || nationCheck.rows.length) return res.redirect('/apply-news-reporter');

  const { q1, q2, q3, q4 } = req.body;
  if (!q1 || !q3 || !q4) return res.redirect('/apply-news-reporter');

  await db.query(
    `INSERT INTO news_reporter_applications (discord_id, discord_tag, discord_avatar, q1, q2, q3, q4)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (discord_id) DO UPDATE
       SET q1=$4, q2=$5, q3=$6, q4=$7, submitted_at=NOW(),
           status=CASE WHEN news_reporter_applications.status='declined' THEN 'pending' ELSE news_reporter_applications.status END`,
    [
      req.session.user.id,
      req.session.user.username,
      req.session.user.avatar || null,
      q1.trim(), (q2 || '').trim(), q3.trim(), q4.trim()
    ]
  );

  res.redirect('/apply-news-reporter');
});

module.exports = router;
