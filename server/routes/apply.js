const express = require('express');
const router = express.Router();
const db = require('../../db');
const { sendDiscordDM } = require('../discord-dm');

router.get('/', async (req, res) => {
  const eventRes = await db.query(`SELECT * FROM events ORDER BY created_at DESC LIMIT 1`);
  const event = eventRes.rows[0] || null;

  const eligibilityQuestions = (await db.query(
    `SELECT * FROM eligibility_questions ORDER BY display_order ASC, id ASC`
  )).rows;

  let existing = null;
  if (event && req.session.user) {
    existing = (await db.query(
      `SELECT id, status, review_stage, declined_at_stage FROM structured_applications WHERE discord_id = $1`,
      [req.session.user.id]
    )).rows[0] || null;
  }

  // Stage customization
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

  res.render('new/apply', {
    event, eligibilityQuestions, existing, submitted: req.query.submitted === '1',
    error: req.query.error || null,
    stageSettings, stageBlocks, agreementItems, playstyleOptions
  });
});

router.post('/submit', async (req, res) => {
  if (!req.session.user) return res.redirect('/auth/discord');

  const eventRes = await db.query(`SELECT * FROM events ORDER BY created_at DESC LIMIT 1`);
  const event = eventRes.rows[0];
  const VIP_ROLE_IDS = ['1449004906433351881', '1449030965576990720'];
  const userRoleIds = req.session.user?.guildRoleIds || [];
  const hasVipAccess = userRoleIds.some(id => VIP_ROLE_IDS.includes(id));
  if (!event || (!event.is_open && !hasVipAccess)) return res.redirect('/apply');

  const existing = (await db.query(
    `SELECT id FROM structured_applications WHERE discord_id = $1`, [req.session.user.id]
  )).rows[0];
  if (existing) return res.redirect('/apply');

  const {
    eligibility_answers, ign, discord_username, age, country, how_heard,
    played_civ, played_civ_details, creates_content, content_link,
    playstyle, playstyle_description, scenario_1, scenario_2, scenario_3,
    app_type, video_link, written_app, agreements,
    island_choices, friend_requests, session_availability
  } = req.body;

  if (!ign || !playstyle || !scenario_1 || !scenario_2 || !scenario_3 || !app_type) {
    return res.redirect('/apply?error=incomplete');
  }

  let parsedAnswers = {};
  try { parsedAnswers = JSON.parse(eligibility_answers || '{}'); } catch (_) {}
  const jsonAnswers = JSON.stringify(parsedAnswers);

  let jsonIslandChoices = null;
  try {
    const parsed = JSON.parse(island_choices || 'null');
    if (parsed !== null) jsonIslandChoices = JSON.stringify(parsed);
  } catch (_) {}

  let jsonSessionAvail = null;
  try {
    const parsed = JSON.parse(session_availability || 'null');
    if (parsed !== null) jsonSessionAvail = JSON.stringify(parsed);
  } catch (_) {}

  try {
    await db.query(
      `INSERT INTO structured_applications (
        eligibility_answers, ign, discord_username_input, age, country, how_heard,
        played_civ, played_civ_details, creates_content, content_link,
        playstyle, playstyle_description, scenario_1, scenario_2, scenario_3,
        app_type, video_link, written_app, agreements_confirmed,
        discord_id, discord_avatar, discord_tag,
        island_choices, friend_requests, session_availability
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
      [
        jsonAnswers, ign, discord_username, parseInt(age) || null, country, how_heard,
        played_civ === 'yes', played_civ_details || null,
        creates_content === 'yes', content_link || null,
        playstyle, playstyle_description, scenario_1, scenario_2, scenario_3,
        app_type, video_link || null, written_app || null,
        agreements === 'confirmed',
        req.session.user.id, req.session.user.avatar, req.session.user.username,
        jsonIslandChoices, friend_requests || null, jsonSessionAvail
      ]
    );
  } catch (err) {
    console.error('Application INSERT error:', err.message, { jsonAnswers, jsonIslandChoices, jsonSessionAvail });
    return res.redirect('/apply?error=server');
  }

  sendDiscordDM(req.session.user.id,
    `**Your application has been submitted!**\n\nThanks ${req.session.user.username} — we've received your application for **${event.title || 'The Collective'}**. We'll review it and update you here when there's a decision. Good luck!`
  );

  res.redirect('/apply?submitted=1');
});


module.exports = router;
