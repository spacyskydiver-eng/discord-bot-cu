const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('Show all configured levels and their XP requirements'),

  async execute(interaction) {
    const guildId = interaction.guild.id;

    const res = await db.query(
      `SELECT level_number, level_name, xp_required FROM level_config WHERE guild_id = $1 ORDER BY level_number ASC`,
      [guildId]
    );

    if (!res.rows.length) {
      return interaction.reply({ content: 'No levels configured yet. Set them up in the dashboard!', ephemeral: true });
    }

    const lines = res.rows.map(r => `**Level ${r.level_number}** — ${r.level_name} (${r.xp_required.toLocaleString()} XP)`);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('Level Progression')
      .setDescription(lines.join('\n'));

    await interaction.reply({ embeds: [embed] });
  }
};
