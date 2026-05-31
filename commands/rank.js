const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your rank or another member\'s rank')
    .addUserOption(opt => opt.setName('user').setDescription('The user to check').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guild.id;

    const res = await db.query(
      `SELECT xp, level FROM user_xp WHERE discord_id = $1 AND guild_id = $2`,
      [target.id, guildId]
    );

    if (!res.rows.length) {
      return interaction.reply({ content: `${target.username} hasn't chatted yet.`, ephemeral: true });
    }

    const { xp, level } = res.rows[0];

    const levelNameRes = await db.query(
      `SELECT level_name FROM level_config WHERE guild_id = $1 AND level_number = $2`,
      [guildId, level]
    );
    const levelName = levelNameRes.rows[0]?.level_name || `Level ${level}`;

    const nextLevelRes = await db.query(
      `SELECT xp_required, level_name FROM level_config WHERE guild_id = $1 AND level_number = $2`,
      [guildId, level + 1]
    );
    const next = nextLevelRes.rows[0];

    const rankRes = await db.query(
      `SELECT COUNT(*) FROM user_xp WHERE guild_id = $1 AND xp > $2`,
      [guildId, xp]
    );
    const rank = parseInt(rankRes.rows[0].count) + 1;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`${target.username}'s Rank`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'Level', value: `**${level}** — ${levelName}`, inline: true },
        { name: 'XP', value: `${xp.toLocaleString()}`, inline: true },
        { name: 'Server Rank', value: `#${rank}`, inline: true }
      );

    if (next) {
      const needed = next.xp_required - xp;
      embed.addFields({ name: `Next Level — ${next.level_name}`, value: `${needed.toLocaleString()} XP needed` });
    }

    await interaction.reply({ embeds: [embed] });
  }
};
