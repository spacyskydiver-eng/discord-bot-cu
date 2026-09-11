require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const db = require('./db');
const fs = require('fs');
const path = require('path');
const startServer = require('./server/app');
const runVeteranCheck = require('./events/veteranCheck');
const { setupNationTracking } = require('./events/nationTracking');
const { syncNationServer } = require('./utils/nationSync');
const { invalidate: invalidateNationCache } = require('./utils/nationGuilds');
const { sendDiscordDM } = require('./server/discord-dm');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ]
});

client.commands = new Collection();

const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);
  runVeteranCheck(client);
  setInterval(() => runVeteranCheck(client), 6 * 60 * 60 * 1000);
  setupNationTracking(client);

  // Sync existing bans from the CU guild into the moderation DB
  const cuGuild = await client.guilds.fetch(CU_GUILD_ID).catch(() => null);
  if (cuGuild) syncBansFromGuild(cuGuild);
});

client.on('guildBanAdd', async (ban) => {
  if (ban.guild.id !== CU_GUILD_ID) return;
  try {
    const avatarUrl = ban.user.avatar
      ? `https://cdn.discordapp.com/avatars/${ban.user.id}/${ban.user.avatar}.png`
      : null;
    await db.query(
      `INSERT INTO moderation_bans (discord_id, discord_tag, discord_avatar, reason, banned_by)
       SELECT $1,$2,$3,$4,'Discord'
       WHERE NOT EXISTS (SELECT 1 FROM moderation_bans WHERE discord_id=$1)`,
      [ban.user.id, ban.user.username, avatarUrl, ban.reason || '']
    );
  } catch (err) {
    console.error('guildBanAdd DB error:', err);
  }
});

client.on('guildBanRemove', async (ban) => {
  if (ban.guild.id !== CU_GUILD_ID) return;
  try {
    await db.query(`DELETE FROM moderation_bans WHERE discord_id=$1`, [ban.user.id]);
  } catch (err) {
    console.error('guildBanRemove DB error:', err);
  }
});

client.on('messageCreate', require('./events/messageCreate'));

client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  db.query(
    `UPDATE message_logs SET deleted = TRUE, deleted_at = NOW() WHERE message_id = $1`,
    [message.id]
  ).catch(() => {});
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!newMsg.guild || newMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  db.query(
    `UPDATE message_logs SET content = $1, edited = TRUE, original_content = COALESCE(original_content, $2)
     WHERE message_id = $3`,
    [newMsg.content || '', oldMsg.content || '', newMsg.id]
  ).catch(() => {});
});

const CU_GUILD_ID = '1449004906068312189';
const NATION_FORUM_ID = '1531798329397215242';
const NATION_LEADER_ROLE_ID = '1531798604849872976';

async function syncBansFromGuild(guild) {
  try {
    const bans = await guild.bans.fetch();
    for (const [, ban] of bans) {
      const avatarUrl = ban.user.avatar
        ? `https://cdn.discordapp.com/avatars/${ban.user.id}/${ban.user.avatar}.png`
        : null;
      await db.query(
        `INSERT INTO moderation_bans (discord_id, discord_tag, discord_avatar, reason, banned_by)
         SELECT $1,$2,$3,$4,'Discord (sync)'
         WHERE NOT EXISTS (SELECT 1 FROM moderation_bans WHERE discord_id=$1)`,
        [ban.user.id, ban.user.username, avatarUrl, ban.reason || '']
      );
    }
    console.log(`Ban sync: ${bans.size} bans processed`);
  } catch (err) {
    console.error('Ban sync error:', err);
  }
}

client.on('threadCreate', async (thread) => {
  if (thread.parentId !== NATION_FORUM_ID) return;
  try {
    const member = await thread.guild.members.fetch(thread.ownerId).catch(() => null);
    if (!member || !member.roles.cache.has(NATION_LEADER_ROLE_ID)) return;

    const { buildBotMessage } = require('./commands/bump');
    const msg = await thread.send(buildBotMessage(null));

    await db.query(
      `INSERT INTO nation_advert_posts (thread_id, bot_message_id, discord_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (thread_id) DO UPDATE SET bot_message_id = $2`,
      [thread.id, msg.id, thread.ownerId]
    );
  } catch (err) {
    console.error('threadCreate auto-post error:', err);
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    // Close leader ticket
    if (interaction.customId === 'close_leader_ticket') {
      try {
        await interaction.reply({ content: 'Closing ticket...', ephemeral: true });
        await interaction.channel.delete('Leader ticket closed by staff');
      } catch (err) {
        console.error('Close ticket error:', err);
        await interaction.reply({ content: 'Could not delete the channel.', ephemeral: true }).catch(() => {});
      }
      return;
    }

    // Accept nation leader application
    if (interaction.customId === 'accept_leader_ticket') {
      await interaction.deferReply({ ephemeral: true });
      try {
        // Parse applicant Discord ID from channel topic
        const topic = interaction.channel.topic || '';
        const match = topic.match(/nation-leader-(\d+)/);
        if (!match) {
          return interaction.editReply({ content: 'Could not determine applicant from channel topic.' });
        }
        const applicantId = match[1];

        // Look up their nation server
        const row = (await db.query(
          `SELECT guild_id, server_name FROM nation_leader_applications WHERE discord_id = $1`,
          [applicantId]
        )).rows[0];
        if (!row) {
          return interaction.editReply({ content: 'No nation leader application found for this user.' });
        }

        // Mark accepted
        await db.query(
          `UPDATE nation_leader_applications SET accepted=true, accepted_at=NOW() WHERE discord_id=$1`,
          [applicantId]
        );
        invalidateNationCache();

        // Initial server sync (runs in background)
        syncNationServer(client, row.guild_id).catch(console.error);

        // Give Nation Leader role in the main CU guild
        try {
          const mainGuild = await client.guilds.fetch('1449004906068312189');
          const member = await mainGuild.members.fetch(applicantId);
          await member.roles.add('1531798604849872976');
        } catch (err) {
          console.error('Failed to assign Nation Leader role:', err.message);
        }

        // DM the applicant
        sendDiscordDM(applicantId,
          `**Nation Leader Application — Accepted!**\n\nYour nation server **${row.server_name}** has been approved. You are now a recognised nation leader for the 150 Player Event. Our bot will monitor your server throughout the event — keep it there and its permissions intact.\n\nYou have been given the **Nation Leader** role in the server.`
        );

        // Update the ticket message to reflect acceptance
        await interaction.channel.send({
          content: `✅ <@${applicantId}>'s nation leader application has been **accepted** by <@${interaction.user.id}>. Closing ticket.`
        });

        await interaction.editReply({ content: 'Application accepted. Closing ticket...' });
        setTimeout(() => interaction.channel.delete('Nation leader accepted').catch(() => {}), 3000);
      } catch (err) {
        console.error('Accept leader error:', err);
        await interaction.editReply({ content: 'Something went wrong. Please try again.' });
      }
      return;
    }

    // Kill ticket — open
    if (interaction.customId.startsWith('kill_ticket_open:')) {
      const configId = interaction.customId.split(':')[1];
      await interaction.deferReply({ ephemeral: true });
      try {
        const cfgRes = await db.query(`SELECT * FROM kill_ticket_config WHERE id=$1`, [configId]);
        const cfg = cfgRes.rows[0];
        if (!cfg) return interaction.editReply({ content: 'Ticket system not configured. Contact staff.' });
        if (cfg.enabled === false || cfg.enabled === null) return interaction.editReply({ content: 'Kill tickets are currently disabled. Please check back later.' });

        const guild = interaction.guild;
        const member = interaction.member;
        const staffRoleIds = (cfg.staff_role_ids || '').split(',').map(s => s.trim()).filter(Boolean);

        const permOverwrites = [
          { id: guild.id, deny: ['ViewChannel'] },
          { id: member.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
          { id: client.user.id, allow: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ReadMessageHistory'] }
        ];
        for (const roleId of staffRoleIds) {
          permOverwrites.push({ id: roleId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] });
        }

        const safeName = member.user.username.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'player';
        const channel = await guild.channels.create({
          name: `kill-${safeName}`,
          type: 0,
          parent: cfg.category_id || null,
          topic: `kill-ticket:${configId}:${member.id}`,
          permissionOverwrites: permOverwrites
        });

        const introText = cfg.ticket_intro ||
          `**Kill Request**\n\nHello <@${member.id}>! Please explain **who you want to kill** and **why**. Staff will review your request here.\n\n_Use this channel to provide evidence, context, or screenshots._`;

        await channel.send({
          content: introText,
          components: [{
            type: 1,
            components: [{
              type: 2,
              style: 4,
              label: '🔒 Close Ticket',
              custom_id: 'kill_ticket_close'
            }]
          }]
        });

        await interaction.editReply({ content: `Your kill request ticket has been created: <#${channel.id}>` });
      } catch (err) {
        console.error('Kill ticket open error:', err);
        await interaction.editReply({ content: 'Could not create ticket. Please contact staff.' });
      }
      return;
    }

    // Kill ticket — close
    if (interaction.customId === 'kill_ticket_close') {
      try {
        const topic = interaction.channel.topic || '';
        const cfgMatch = topic.match(/kill-ticket:(\d+):(\d+)/);
        if (!cfgMatch) {
          await interaction.reply({ content: '⚠️ Could not identify ticket config. Staff: delete this channel manually.', ephemeral: true });
          return;
        }
        const configId = cfgMatch[1];
        const cfgRes = await db.query(`SELECT staff_role_ids FROM kill_ticket_config WHERE id=$1`, [configId]);
        const cfg = cfgRes.rows[0];
        const staffRoleIds = cfg ? (cfg.staff_role_ids || '').split(',').map(s => s.trim()).filter(Boolean) : [];
        const isStaff = staffRoleIds.length === 0 ||
          staffRoleIds.some(rid => interaction.member.roles.cache.has(rid)) ||
          interaction.member.permissions.has('ManageChannels');

        if (!isStaff) {
          return interaction.reply({ content: '❌ Only staff can close tickets.', ephemeral: true });
        }

        await interaction.reply({ content: `Ticket closed by <@${interaction.user.id}>. Deleting channel in 5 seconds...` });
        setTimeout(() => interaction.channel.delete('Kill ticket closed').catch(() => {}), 5000);
      } catch (err) {
        console.error('Kill ticket close error:', err);
        await interaction.reply({ content: 'Could not close ticket.', ephemeral: true }).catch(() => {});
      }
      return;
    }

    try {
      const row = await db.query('SELECT response_text, response_payload FROM button_responses WHERE custom_id = $1', [interaction.customId]);
      if (row.rows.length) {
        const { response_text, response_payload } = row.rows[0];
        if (response_payload) {
          await interaction.reply({ ...response_payload, ephemeral: true });
        } else if (response_text) {
          await interaction.reply({ content: response_text, ephemeral: true });
        }
      }
    } catch (err) {
      console.error('Button interaction error:', err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    const msg = { content: 'An error occurred.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

startServer();

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('Discord login failed:', err.message);
});

process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
