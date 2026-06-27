require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const db = require('./db');
const fs = require('fs');
const path = require('path');
const startServer = require('./server/app');
const runVeteranCheck = require('./events/veteranCheck');

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
  // Run veteran check on startup then every 6 hours
  runVeteranCheck(client);
  setInterval(() => runVeteranCheck(client), 6 * 60 * 60 * 1000);
});

client.on('messageCreate', require('./events/messageCreate'));

client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
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
