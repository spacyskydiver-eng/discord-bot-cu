const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collect-recordings')
    .setDescription('Pull all recording ticket submissions into the event timeline on the website')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const guild = interaction.guild;
      await guild.channels.fetch();
      const ticketChannels = [...guild.channels.cache.values()].filter(c =>
        c.topic && c.topic.startsWith('recording-ticket:')
      );

      if (!ticketChannels.length) {
        return interaction.editReply('No recording ticket channels found.');
      }

      let collected = 0;
      let channels = 0;

      for (const channel of ticketChannels) {
        const [, dayStr, userId] = channel.topic.split(':');
        const day = parseInt(dayStr);
        if (!day || day < 1 || day > 6 || !userId) continue;
        channels++;

        // Paginate through all messages
        let lastId = null;
        while (true) {
          const opts = { limit: 100 };
          if (lastId) opts.before = lastId;
          const msgs = await channel.messages.fetch(opts);
          if (!msgs.size) break;

          for (const msg of msgs.values()) {
            if (msg.author.bot || msg.author.id !== userId) continue;

            // Text content
            if (msg.content.trim()) {
              await db.query(`
                INSERT INTO recording_submissions
                  (message_id, channel_id, day, discord_id, discord_tag, discord_avatar, content_type, message_text, submitted_at)
                VALUES ($1,$2,$3,$4,$5,$6,'text',$7,$8)
                ON CONFLICT (message_id) DO NOTHING
              `, [
                msg.id + '_text', channel.id, day,
                userId, msg.author.username, msg.author.displayAvatarURL({ extension: 'png' }),
                msg.content.trim(), msg.createdAt
              ]);
              collected++;
            }

            // Attachments
            for (const att of msg.attachments.values()) {
              await db.query(`
                INSERT INTO recording_submissions
                  (message_id, channel_id, day, discord_id, discord_tag, discord_avatar, content_type, attachment_url, attachment_filename, attachment_mime, attachment_size, submitted_at)
                VALUES ($1,$2,$3,$4,$5,$6,'attachment',$7,$8,$9,$10,$11)
                ON CONFLICT (message_id) DO NOTHING
              `, [
                msg.id + '_' + att.id, channel.id, day,
                userId, msg.author.username, msg.author.displayAvatarURL({ extension: 'png' }),
                att.url, att.name, att.contentType || null, att.size, msg.createdAt
              ]);
              collected++;
            }
          }

          lastId = msgs.last().id;
          if (msgs.size < 100) break;
        }
      }

      await interaction.editReply(
        `Collected **${collected}** items from **${channels}** recording tickets.\nView the timeline: https://cuevents.xyz/admin/recordings`
      );
    } catch (err) {
      console.error('collect-recordings error:', err);
      await interaction.editReply('Error: ' + err.message);
    }
  }
};
