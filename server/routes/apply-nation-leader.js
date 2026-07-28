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

  const channelId = (req.body.channel_id || '').trim();
  if (!channelId || !/^\d+$/.test(channelId)) {
    return res.json({ ok: false, error: 'Please enter a valid numeric channel ID.' });
  }

  // Get channel → guild_id
  const channel = await discordFetch(`/channels/${channelId}`);
  if (!channel || !channel.guild_id) {
    return res.json({
      ok: false,
      reason: 'bot_not_in_server',
      error: 'Our bot could not find that channel. Make sure you invited the bot to your server and entered the correct channel ID.'
    });
  }

  const guildId = channel.guild_id;

  // Get guild with member count
  const guild = await discordFetch(`/guilds/${guildId}?with_counts=true`);
  if (!guild) {
    return res.json({
      ok: false,
      reason: 'bot_not_in_server',
      error: 'Our bot is not in that server. Please invite it first, then try again.'
    });
  }

  const memberCount = guild.approximate_member_count || 0;

  if (memberCount >= 3) {
    return res.json({
      ok: false,
      reason: 'too_many_members',
      count: memberCount,
      error: `Your server currently has ${memberCount} member${memberCount !== 1 ? 's' : ''}. Nation servers must have fewer than 3 members at the time of authorisation — please use a freshly created server with no existing members.`
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
        channelId,
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
