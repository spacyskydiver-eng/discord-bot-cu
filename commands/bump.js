const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');

const NATION_LEADER_ROLE_ID = '1531798604849872976';
const NATION_FORUM_ID = '1531798329397215242';
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bump')
    .setDescription('Bump your nation advert to the top of the forum')
    .setDefaultMemberPermissions(null),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Must have Nation Leader role
    if (!interaction.member.roles.cache.has(NATION_LEADER_ROLE_ID)) {
      return interaction.editReply({ content: 'You need the **Nation Leader** role to use this command.' });
    }

    // Must be inside a thread that belongs to the nation advert forum
    const ch = interaction.channel;
    if (!ch.isThread() || ch.parentId !== NATION_FORUM_ID) {
      return interaction.editReply({ content: 'This command can only be used inside your nation advert thread.' });
    }

    // Must be the thread starter (their own post)
    if (ch.ownerId !== interaction.user.id) {
      return interaction.editReply({ content: 'You can only bump your own nation advert.' });
    }

    const userId = interaction.user.id;

    // Check cooldown
    const cooldownRes = await db.query(
      `SELECT last_bump_at FROM nation_bump_cooldowns WHERE discord_id = $1`,
      [userId]
    );
    if (cooldownRes.rows.length) {
      const nextBump = new Date(new Date(cooldownRes.rows[0].last_bump_at).getTime() + COOLDOWN_MS);
      if (Date.now() < nextBump.getTime()) {
        const unixNext = Math.floor(nextBump.getTime() / 1000);
        return interaction.editReply({
          content: `You can't bump yet. Your next bump is available <t:${unixNext}:R>.`
        });
      }
    }

    try {
      // Bump by sending a zero-width space then deleting it
      const bumpMsg = await ch.send('​');
      await bumpMsg.delete();

      // Record cooldown
      const now = new Date();
      const nextBumpTime = new Date(now.getTime() + COOLDOWN_MS);
      const unixNext = Math.floor(nextBumpTime.getTime() / 1000);

      await db.query(
        `INSERT INTO nation_bump_cooldowns (discord_id, last_bump_at)
         VALUES ($1, $2)
         ON CONFLICT (discord_id) DO UPDATE SET last_bump_at = $2`,
        [userId, now]
      );

      // Edit the bot's pinned auto-message to show next bump time
      const postRes = await db.query(
        `SELECT bot_message_id FROM nation_advert_posts WHERE thread_id = $1`,
        [ch.id]
      );
      if (postRes.rows.length) {
        try {
          const botMsg = await ch.messages.fetch(postRes.rows[0].bot_message_id);
          await botMsg.edit(buildBotMessage(unixNext));
        } catch (_) {}
      }

      return interaction.editReply({ content: `Bumped. Next bump available <t:${unixNext}:R>.` });
    } catch (err) {
      console.error('Bump error:', err);
      return interaction.editReply({ content: 'Could not bump — make sure the bot has permission to send messages in this channel.' });
    }
  }
};

function buildBotMessage(unixNext) {
  const nextPart = unixNext
    ? `**Next bump available:** <t:${unixNext}:R> (<t:${unixNext}:t>)`
    : '**Next bump:** Available now';
  return `Use \`/bump\` in this thread to bring your advert to the top of the forum.\n${nextPart}`;
}

module.exports.buildBotMessage = buildBotMessage;
