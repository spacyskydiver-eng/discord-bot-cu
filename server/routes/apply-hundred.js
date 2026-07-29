const express = require('express');
const router = express.Router();
const db = require('../../db');
const { sendDiscordDM } = require('../discord-dm');

// GET — show the application wizard
router.get('/', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);

  const existing = (await db.query(
    `SELECT status, session_availability, edit_requested, edit_approved FROM hundred_applications WHERE discord_id = $1`,
    [req.session.user.id]
  )).rows[0] || null;

  if (existing && req.query.submitted !== '1') {
    return res.redirect(`${res.locals.lp}/my-application-hundred`);
  }

  res.render('new/apply-hundred', {
    existing,
    submitted: req.query.submitted === '1',
    error: req.query.error || null
  });
});

// POST — submit application
router.post('/submit', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);

  const existing = (await db.query(
    `SELECT id FROM hundred_applications WHERE discord_id = $1`, [req.session.user.id]
  )).rows[0];
  if (existing) return res.redirect(`${res.locals.lp}/my-application-hundred`);

  const {
    can_attend, has_mic, is_13_plus,
    ign, discord_username, country,
    prev_events, playstyle_desc, why_join,
    friend_requests,
    rules_agreed, legal_agreed
  } = req.body;

  if (!ign || !discord_username || !country || !playstyle_desc || !why_join) {
    return res.redirect(`${res.locals.lp}/apply-hundred?error=incomplete`);
  }
  if (can_attend !== 'yes' || has_mic !== 'yes' || is_13_plus !== 'yes') {
    return res.redirect(`${res.locals.lp}/apply-hundred?error=eligibility`);
  }
  if (rules_agreed !== 'yes' || legal_agreed !== 'yes') {
    return res.redirect(`${res.locals.lp}/apply-hundred?error=rules`);
  }

  try {
    await db.query(
      `INSERT INTO hundred_applications (
        discord_id, discord_username, discord_avatar, discord_tag,
        can_attend, has_mic, is_13_plus,
        ign, discord_username_input, country,
        prev_events, playstyle_desc, why_join, friend_requests,
        session_availability, rules_agreed, legal_agreed
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        req.session.user.id,
        req.session.user.username,
        req.session.user.avatar || null,
        req.session.user.username,
        true, true, true,
        ign.trim(), discord_username.trim(), country.trim(),
        prev_events?.trim() || null,
        playstyle_desc.trim(),
        why_join.trim(),
        friend_requests?.trim() || null,
        JSON.stringify([1, 2, 3, 4, 5, 6]),
        true, true
      ]
    );
  } catch (err) {
    console.error('150-player application INSERT error:', err.message);
    return res.redirect(`${res.locals.lp}/apply-hundred?error=server`);
  }

  sendDiscordDM(req.session.user.id,
    `**Your application has been submitted!**\n\nThanks ${req.session.user.username} — we've received your application for the **150 Player Event**. We'll review it and get back to you. Good luck!`
  );

  res.redirect(`${res.locals.lp}/apply-hundred?submitted=1`);
});

module.exports = router;
