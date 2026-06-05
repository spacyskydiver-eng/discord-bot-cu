const db = require('../db');

const EVENT_KEYWORDS = [
  'when will it be', 'when is it', 'when is the event', 'when does it start',
  'when does it happen', 'when will the event', 'what time is the event',
  'when will this start', 'when will it start', 'when is it happening'
];

const APPLY_KEYWORDS = [
  'how to apply', 'how do i apply', 'how do you apply', 'how can i apply',
  'how to join', 'how do i join', 'how can i join', 'how to sign up',
  'how do i sign up', 'when can i apply', 'when can we apply',
  'when do applications', 'when are applications'
];

module.exports = async (message) => {
  if (message.author.bot || !message.guild) return;

  const lower = message.content.toLowerCase();

  if (EVENT_KEYWORDS.some(kw => lower.includes(kw))) {
    return message.reply('Summer — around end of July to mid August and will run across 10 sessions over 2 weeks. Not a 24/7 server.');
  }

  if (APPLY_KEYWORDS.some(kw => lower.includes(kw))) {
    return message.reply('Applications will release in mid June. If you are accepted you will be notified and given a custom role.');
  }

  const guildId = message.guild.id;
  const userId = message.author.id;

  await db.query(
    `INSERT INTO guild_config (guild_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [guildId]
  );

  const configRes = await db.query(
    `SELECT xp_per_message, xp_cooldown_seconds, level_up_channel_id FROM guild_config WHERE guild_id = $1`,
    [guildId]
  );
  const config = configRes.rows[0];

  await db.query(
    `INSERT INTO user_xp (discord_id, guild_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, guildId]
  );

  const userRes = await db.query(
    `SELECT xp, level, last_message_at FROM user_xp WHERE discord_id = $1 AND guild_id = $2`,
    [userId, guildId]
  );
  const user = userRes.rows[0];

  const now = new Date();
  if (user.last_message_at) {
    const secondsSinceLast = (now - new Date(user.last_message_at)) / 1000;
    if (secondsSinceLast < config.xp_cooldown_seconds) return;
  }

  const newXp = user.xp + config.xp_per_message;

  const levelRes = await db.query(
    `SELECT level_number, level_name, xp_required FROM level_config WHERE guild_id = $1 AND xp_required <= $2 ORDER BY xp_required DESC LIMIT 1`,
    [guildId, newXp]
  );

  let newLevel = user.level;
  let leveledUp = false;
  let newLevelName = null;

  if (levelRes.rows.length > 0) {
    const earned = levelRes.rows[0];
    if (earned.level_number > user.level) {
      newLevel = earned.level_number;
      newLevelName = earned.level_name;
      leveledUp = true;
    }
  }

  await db.query(
    `UPDATE user_xp SET xp = $1, level = $2, last_message_at = $3 WHERE discord_id = $4 AND guild_id = $5`,
    [newXp, newLevel, now, userId, guildId]
  );

  if (leveledUp) {
    // Assign level role
    await assignLevelRole(message.guild, message.member, guildId, newLevel);

    if (config.level_up_channel_id) {
      const channel = message.guild.channels.cache.get(config.level_up_channel_id);
      if (channel) {
        await channel.send(`${message.author} reached **Level ${newLevel}** — **${newLevelName}**!`);
      }
    }
  }
};

async function assignLevelRole(guild, member, guildId, newLevel) {
  try {
    const rolesRes = await db.query(
      `SELECT level_number, role_id FROM level_roles WHERE guild_id = $1 ORDER BY level_number`,
      [guildId]
    );
    if (!rolesRes.rows.length) return;

    // Remove all old level roles first
    for (const row of rolesRes.rows) {
      const role = guild.roles.cache.get(row.role_id);
      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role).catch(() => {});
      }
    }

    // Assign the role for the new level (highest matching role)
    const matching = rolesRes.rows.filter(r => r.level_number <= newLevel);
    if (!matching.length) return;
    const best = matching[matching.length - 1];
    const role = guild.roles.cache.get(best.role_id);
    if (role) await member.roles.add(role).catch(() => {});
  } catch (err) {
    console.error('Level role assignment error:', err.message);
  }
}
