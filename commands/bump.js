const { SlashCommandBuilder, ChannelType } = require('discord.js');

const NATION_LEADER_ROLE_ID = '1531798604849872976';
const NATION_FORUM_ID = '1531798329397215242';

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

    try {
      const msg = await ch.send('​');
      await msg.delete();
      return interaction.editReply({ content: 'Your advert has been bumped to the top.' });
    } catch (err) {
      console.error('Bump error:', err);
      return interaction.editReply({ content: 'Could not bump — make sure the bot has permission to send messages in this channel.' });
    }
  }
};
