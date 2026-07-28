const db = require('../db');
const { isNationGuild } = require('../utils/nationGuilds');
const { checkContent } = require('../utils/contentFilter');

const EVENT_KEYWORDS = [
  'when will it be', 'when is it', 'when is the event', 'when does it start',
  'when does it happen', 'when will the event', 'what time is the event',
  'when will this start', 'when will it start', 'when is it happening',
  'when event', 'when does event', 'when will event', 'event when',
  'event start', 'event date', 'event time'
];

const APPLY_KEYWORDS = [
  'how to apply', 'how do i apply', 'how do you apply', 'how can i apply',
  'how to join', 'how do i join', 'how can i join', 'how to sign up',
  'how do i sign up', 'when can i apply', 'when can we apply',
  'when do applications', 'when are applications',
  'application link', 'apply link', 'where do i apply', 'where can i apply',
  'where to apply', 'where to sign up', 'apply now', 'sign up link',
  'how do we apply', 'how do we join', 'can i apply', 'can i sign up',
  'is there an application', 'link to apply', 'link to the application'
];

const SITE = process.env.WEBSITE_URL || 'https://collective-union-events.onrender.com';

const NATION_FORUM_ID = '1531798329397215242';

module.exports = async (message) => {
  if (!message.guild) return;

  // Nation advert forum: only allow the starter message per thread; delete everything else
  if (!message.author.bot && message.channel.isThread() && message.channel.parentId === NATION_FORUM_ID) {
    // In forum threads, thread.id === starter message.id
    if (message.id !== message.channel.id) {
      message.delete().catch(() => {});
      await handleAdvertViolation(message);
      return;
    }
  }

  if (message.author.bot) return;

  // Nation server message tracking
  if (await isNationGuild(message.guild.id)) {
    const attachments = message.attachments.size
      ? JSON.stringify([...message.attachments.values()].map(a => ({ url: a.url, name: a.name })))
      : null;
    db.query(
      `INSERT INTO nation_messages (guild_id, channel_id, message_id, discord_id, username, avatar, content, attachments, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (message_id) DO NOTHING`,
      [message.guild.id, message.channel.id, message.id, message.author.id, message.author.username,
       message.author.displayAvatarURL({ size: 64, extension: 'png' }),
       message.content || null, attachments, message.createdAt]
    ).catch(console.error);
    // Update member record in case display name changed
    db.query(
      `INSERT INTO nation_members (guild_id, discord_id, username, display_name, avatar)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (guild_id, discord_id) DO UPDATE SET username=$3, display_name=$4, avatar=$5`,
      [message.guild.id, message.author.id, message.author.username,
       message.member?.displayName || message.author.username,
       message.author.displayAvatarURL({ size: 64, extension: 'png' })]
    ).catch(() => {});

    // Content moderation — alert staff if flagged word/phrase detected
    const flag = checkContent(message.content);
    if (flag) {
      alertStaff(message, flag).catch(console.error);
    }
  }

  const lower = message.content.toLowerCase();

  if (EVENT_KEYWORDS.some(kw => lower.includes(kw))) {
    return message.reply(
      'The event runs across **10 sessions** starting <t:1755360000:F>.\n' +
      '**Full schedule:**\n' +
      'Session 1 — <t:1755360000:F>\n' +
      'Session 2 — <t:1755446400:F>\n' +
      'Session 3 — <t:1755619200:F>\n' +
      'Session 4 — <t:1755792000:F>\n' +
      'Session 5 — <t:1755964800:F>\n' +
      'Session 6 — <t:1756137600:F>\n' +
      'Session 7 — <t:1756310400:F>\n' +
      'Session 8 — <t:1756483200:F>\n' +
      'Session 9 — <t:1756656000:F>\n' +
      'Session 10 — <t:1756828800:F>\n' +
      'This is **not** a 24/7 server.'
    );
  }

  if (APPLY_KEYWORDS.some(kw => lower.includes(kw))) {
    return message.reply(
      '**Applications are open!** Apply here:\n' +
      SITE + '/apply\n\n' +
      'If you are accepted you will be notified via DM and given a role.'
    );
  }

  const guildId = message.guild.id;
  const userId = message.author.id;

  await db.query(
    `INSERT INTO guild_config (guild_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [guildId]
  );

  const configRes = await db.query(
    `SELECT xp_per_message, xp_cooldown_seconds, level_up_channel_id FROM guild_config WHERE guild_id = $1`,
    [guildId]
  );
  const config = configRes.rows[0];

  await db.query(
    `INSERT INTO user_xp (discord_id, guild_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, guildId]
  );

  const userRes = await db.query(
    `SELECT xp, level, last_message_at FROM user_xp WHERE discord_id = $1 AND guild_id = $2`,
    [userId, guildId]
  );
  const user = userRes.rows[0];

  const now = new Date();
  if (user.last_message_at) {
    const secondsSinceLast = (now - new Date(user.last_message_at)) / 1000;
    if (secondsSinceLast < config.xp_cooldown_seconds) return;
  }

  const newXp = user.xp + config.xp_per_message;

  const levelRes = await db.query(
    `SELECT level_number, level_name, xp_required FROM level_config WHERE guild_id = $1 AND xp_required <= $2 ORDER BY xp_required DESC LIMIT 1`,
    [guildId, newXp]
  );

  let newLevel = user.level;
  let leveledUp = false;
  let newLevelName = null;

  if (levelRes.rows.length > 0) {
    const earned = levelRes.rows[0];
    if (earned.level_number > user.level) {
      newLevel = earned.level_number;
      newLevelName = earned.level_name;
      leveledUp = true;
    }
  }

  await db.query(
    `UPDATE user_xp SET xp = $1, level = $2, last_message_at = $3 WHERE discord_id = $4 AND guild_id = $5`,
    [newXp, newLevel, now, userId, guildId]
  );

  if (leveledUp) {
    // Assign level role
    await assignLevelRole(message.guild, message.member, guildId, newLevel);

    if (config.level_up_channel_id) {
      const channel = message.guild.channels.cache.get(config.level_up_channel_id);
      if (channel) {
        await channel.send(`${message.author} reached **Level ${newLevel}** — **${newLevelName}**!`);
      }
    }
  }
};

const NATION_LEADER_ROLE_ID = '1531798604849872976';
const MAIN_GUILD_ID = '1449004906068312189';

async function handleAdvertViolation(message) {
  const userId = message.author.id;

  const result = await db.query(
    `INSERT INTO nation_advert_violations (discord_id, count, last_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (discord_id) DO UPDATE SET count = nation_advert_violations.count + 1, last_at = NOW()
     RETURNING count`,
    [userId]
  );
  const count = result.rows[0].count;

  try {
    const dm = await message.author.createDM();

    if (count === 1) {
      await dm.send(
        '**Nation Advert Forum — Warning**\n\n' +
        'You can only post your advert once per thread. Additional messages are not allowed and will be deleted.\n\n' +
        'Use `/bump` inside your thread to bring your advert back to the top.\n\n' +
        '_This is your first warning. A second violation will result in your Nation Leader role being removed._'
      );
    } else {
      // Second+ violation — remove the Nation Leader role
      try {
        const mainGuild = await message.client.guilds.fetch(MAIN_GUILD_ID);
        const member = await mainGuild.members.fetch(userId);
        await member.roles.remove(NATION_LEADER_ROLE_ID);
      } catch (_) {}

      await dm.send(
        '**Nation Advert Forum — Role Removed**\n\n' +
        'You have posted additional messages in the nation advert forum more than once. Your **Nation Leader** role has been removed.\n\n' +
        'To get your permissions back, please open a ticket with our staff team in the Collective Union server.'
      );
    }
  } catch (_) {}
}

async function alertStaff(message, flag) {
  // Collect staff Discord IDs: DB staff_access + ADMIN_DISCORD_IDS env
  const staffRows = (await db.query(`SELECT discord_id FROM staff_access`)).rows;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allIds = [...new Set([...staffRows.map(r => r.discord_id), ...adminIds])];

  const typeLabel = flag.type === 'slur' ? 'Racist slur' : 'Extremist content';
  const dmContent = [
    `⚠️ **Flagged message detected in a nation server**`,
    ``,
    `**Type:** ${typeLabel}`,
    `**Matched:** \`${flag.matched}\``,
    `**Server:** ${message.guild.name}`,
    `**Channel:** #${message.channel.name}`,
    `**Author:** ${message.author.username} (\`${message.author.id}\`)`,
    `**Message:**`,
    `> ${message.content.slice(0, 800).replace(/\n/g, '\n> ')}`,
    ``,
    `View in staff portal: ${process.env.WEBSITE_URL || 'https://collective-union-events.onrender.com'}/admin/nations/${message.guild.id}`,
  ].join('\n');

  for (const id of allIds) {
    try {
      const user = await message.client.users.fetch(id);
      await user.send(dmContent);
    } catch (_) {}
  }
}

async function assignLevelRole(guild, member, guildId, newLevel) {
  try {
    const rolesRes = await db.query(
      `SELECT level_number, role_id FROM level_roles WHERE guild_id = $1 ORDER BY level_number`,
      [guildId]
    );
    if (!rolesRes.rows.length) return;

    // Remove all old level roles first
    for (const row of rolesRes.rows) {
      const role = guild.roles.cache.get(row.role_id);
      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role).catch(() => {});
      }
    }

    // Assign the role for the new level (highest matching role)
    const matching = rolesRes.rows.filter(r => r.level_number <= newLevel);
    if (!matching.length) return;
    const best = matching[matching.length - 1];
    const role = guild.roles.cache.get(best.role_id);
    if (role) await member.roles.add(role).catch(() => {});
  } catch (err) {
    console.error('Level role assignment error:', err.message);
  }
}
