const express = require('express');
const router = express.Router();
const db = require('../../db');

const DISCORD_API = 'https://discord.com/api/v10';

async function discordFetch(path) {
  const r = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
  });
  if (!r.ok) return null;
  return r.json();
}

router.get('/', async (req, res) => {
  if (!req.session.user) return res.redirect(`${res.locals.lp}/auth/discord`);
  const existing = (await db.query(
    `SELECT * FROM nation_leader_applications WHERE discord_id = $1`,
    [req.session.user.id]
  )).rows[0] || null;
  res.render('new/apply-nation-leader', { existing });
});

// AJAX — check the server member count via bot, save on pass
router.post('/check', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ ok: false, error: 'Not logged in.' });

  const guildId = (req.body.guild_id || '').trim();
  if (!guildId || !/^\d+$/.test(guildId)) {
    return res.json({ ok: false, error: 'Please enter a valid numeric server ID.' });
  }

  // Verify bot is in the guild
  const guild = await discordFetch(`/guilds/${guildId}`);
  if (!guild || !guild.id) {
    return res.json({
      ok: false,
      reason: 'bot_not_in_server',
      error: 'Our bot is not in that server. Make sure you invited the bot before submitting.'
    });
  }

  // Fetch actual members (accurate for small servers — approximate_member_count is unreliable)
  const members = await discordFetch(`/guilds/${guildId}/members?limit=10`);
  const memberCount = Array.isArray(members) ? members.length : 0;

  if (memberCount >= 3) {
    return res.json({
      ok: false,
      reason: 'too_many_members',
      count: memberCount,
      error: `Your server has ${memberCount} member${memberCount !== 1 ? 's' : ''} (including the bot). Nation servers must have fewer than 3 members — please use a freshly created server.`
    });
  }

  try {
    await db.query(
      `INSERT INTO nation_leader_applications (discord_id, discord_tag, discord_avatar, guild_id, server_name, channel_id, member_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (discord_id) DO UPDATE SET guild_id=$4, server_name=$5, channel_id=$6, member_count=$7, submitted_at=NOW()`,
      [
        req.session.user.id,
        req.session.user.username,
        req.session.user.avatar || null,
        guildId,
        guild.name,
        null,
        memberCount
      ]
    );
  } catch (err) {
    console.error('Nation leader DB error:', err.message);
    return res.json({ ok: false, error: 'A server error occurred. Please try again.' });
  }

  res.json({ ok: true, server_name: guild.name, member_count: memberCount });
});

module.exports = router;
