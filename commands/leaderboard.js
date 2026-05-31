const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top 10 most active members'),

  async execute(interaction) {
    const guildId = interaction.guild.id;

    const res = await db.query(
      `SELECT discord_id, xp, level FROM user_xp WHERE guild_id = $1 ORDER BY xp DESC LIMIT 10`,
      [guildId]
    );

    if (!res.rows.length) {
      return interaction.reply({ content: 'No activity yet!', ephemeral: true });
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = await Promise.all(res.rows.map(async (row, i) => {
      let name;
      try {
        const member = await interaction.guild.members.fetch(row.discord_id);
        name = member.displayName;
      } catch {
        name = `<@${row.discord_id}>`;
      }
      const prefix = medals[i] || `**${i + 1}.**`;
      return `${prefix} ${name} — Level ${row.level} (${row.xp.toLocaleString()} XP)`;
    }));

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 Leaderboard')
      .setDescription(lines.join('\n'));

    await interaction.reply({ embeds: [embed] });
  }
};
