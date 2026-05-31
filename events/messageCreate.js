const db = require('../db');

module.exports = async (message) => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  // Ensure guild config exists
  await db.query(
    `INSERT INTO guild_config (guild_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [guildId]
  );

  const configRes = await db.query(
    `SELECT xp_per_message, xp_cooldown_seconds, level_up_channel_id FROM guild_config WHERE guild_id = $1`,
    [guildId]
  );
  const config = configRes.rows[0];

  // Upsert user row
  await db.query(
    `INSERT INTO user_xp (discord_id, guild_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, guildId]
  );

  const userRes = await db.query(
    `SELECT xp, level, last_message_at FROM user_xp WHERE discord_id = $1 AND guild_id = $2`,
    [userId, guildId]
  );
  const user = userRes.rows[0];

  // Enforce cooldown
  const now = new Date();
  if (user.last_message_at) {
    const secondsSinceLast = (now - new Date(user.last_message_at)) / 1000;
    if (secondsSinceLast < config.xp_cooldown_seconds) return;
  }

  const newXp = user.xp + config.xp_per_message;

  // Check for level up
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

  if (leveledUp && config.level_up_channel_id) {
    const channel = message.guild.channels.cache.get(config.level_up_channel_id);
    if (channel) {
      await channel.send(`🎉 ${message.author} reached **Level ${newLevel}** — **${newLevelName}**!`);
    }
  }
};
