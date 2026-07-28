const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db');

// Role IDs that can see nation leader ticket channels
const TICKET_ROLE_IDS = ['1449004906483814443', '1451190210842071050'];
const SITE_URL = process.env.WEBSITE_URL || 'https://tfn.gg';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leader')
    .setDescription('Nation leader commands for the 100 Player Event')
    .addSubcommand(sub =>
      sub.setName('application')
        .setDescription('Open a nation leader application ticket')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== 'application') return;

    await interaction.deferReply({ ephemeral: true });

    const row = (await db.query(
      `SELECT guild_id, server_name FROM nation_leader_applications WHERE discord_id = $1`,
      [interaction.user.id]
    )).rows[0];

    if (!row) {
      return interaction.editReply({
        content: `**You don't have an authorised nation server.**\n\nTo apply as a nation leader, you need to verify your server first.\n\n→ ${SITE_URL}/apply-nation-leader`
      });
    }

    const guild = interaction.guild;
    if (!guild) {
      return interaction.editReply({ content: 'This command must be used inside a server.' });
    }

    // Check if they already have an open ticket
    const existing = guild.channels.cache.find(
      c => c.name.startsWith('leader-') && c.topic === `nation-leader-${interaction.user.id}`
    );
    if (existing) {
      return interaction.editReply({
        content: `You already have an open application ticket: <#${existing.id}>`
      });
    }

    try {
      const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        }
      ];
      for (const roleId of TICKET_ROLE_IDS) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          overwrites.push({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          });
        }
      }

      const channelName = `leader-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)}`;

      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        topic: `nation-leader-${interaction.user.id}`,
        permissionOverwrites: overwrites,
        reason: `Nation leader application ticket for ${interaction.user.tag}`
      });

      // Try to create an invite to the nation leader's server
      let inviteUrl = null;
      try {
        const nlGuild = await interaction.client.guilds.fetch(row.guild_id);
        const channels = await nlGuild.channels.fetch();
        const textChannel = channels.find(c =>
          c.type === ChannelType.GuildText &&
          c.permissionsFor(nlGuild.members.me)?.has(PermissionFlagsBits.CreateInstantInvite)
        );
        if (textChannel) {
          const invite = await textChannel.createInvite({ maxAge: 0, maxUses: 0, reason: 'Nation leader review' });
          inviteUrl = invite.url;
        }
      } catch (_) {}

      const fields = [
        { name: 'Nation Server', value: row.server_name, inline: true },
        { name: 'Discord', value: `@${interaction.user.username}`, inline: true }
      ];
      if (inviteUrl) fields.push({ name: 'Join Server', value: inviteUrl, inline: false });

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('accept_leader_ticket')
          .setLabel('✓ Accept Nation')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('close_leader_ticket')
          .setLabel('Close & Delete Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        embeds: [{
          color: 0x22863a,
          title: 'Nation Leader Application',
          description: `<@${interaction.user.id}> is applying to be a nation leader for the **100 Player Event**.`,
          fields,
          footer: { text: 'Use the button below to close this ticket when done.' },
          timestamp: new Date().toISOString()
        }],
        components: [closeButton]
      });

      await interaction.editReply({
        content: `Your application ticket has been opened: <#${ticketChannel.id}>\n\nOur team will review your application there. This message is only visible to you.`
      });
    } catch (err) {
      console.error('Leader ticket error:', err);
      await interaction.editReply({
        content: 'Could not create a ticket channel — please contact an admin directly.'
      });
    }
  }
};
