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
    GatewayIntentBits.GuildMembers
  ]
});

client.commands = new Collection();

const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
  runVeteranCheck(client);
  setInterval(() => runVeteranCheck(client), 6 * 60 * 60 * 1000);
  setupNationTracking(client);
});

client.on('messageCreate', require('./events/messageCreate'));

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
          `**Nation Leader Application — Accepted!**\n\nYour nation server **${row.server_name}** has been approved. You are now a recognised nation leader for the 100 Player Event. Our bot will monitor your server throughout the event — keep it there and its permissions intact.\n\nYou have been given the **Nation Leader** role in the server.`
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
