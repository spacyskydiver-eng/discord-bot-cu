const { ChannelType } = require('discord.js');
const db = require('../db');

const TEXT_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);

async function syncNationServer(client, guildId) {
  let guild;
  try {
    guild = await client.guilds.fetch(guildId);
  } catch (_) {
    console.error('syncNationServer: could not fetch guild', guildId);
    return;
  }

  // Channels
  const channels = await guild.channels.fetch().catch(() => null);
  if (channels) {
    const categories = {};
    for (const [, ch] of channels) {
      if (!ch) continue;
      if (ch.type === ChannelType.GuildCategory) categories[ch.id] = ch.name;
    }
    for (const [, ch] of channels) {
      if (!ch) continue;
      const catName = ch.parentId ? (categories[ch.parentId] || null) : null;
      await db.query(
        `INSERT INTO nation_channels (guild_id, channel_id, channel_name, channel_type, position, category_name)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (channel_id) DO UPDATE SET channel_name=$3, position=$5, category_name=$6`,
        [guildId, ch.id, ch.name, ch.type, ch.position || 0, catName]
      ).catch(() => {});
    }
  }

  // Members
  const members = await guild.members.fetch().catch(() => null);
  if (members) {
    for (const [, m] of members) {
      await db.query(
        `INSERT INTO nation_members (guild_id, discord_id, username, display_name, avatar, joined_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (guild_id, discord_id) DO UPDATE SET username=$3, display_name=$4, avatar=$5`,
        [guildId, m.user.id, m.user.username, m.displayName,
         m.user.displayAvatarURL({ size: 64, extension: 'png' }), m.joinedAt || new Date()]
      ).catch(() => {});
    }
  }

  // Message history — last 100 per text channel
  if (channels) {
    for (const [, ch] of channels) {
      if (!ch || !TEXT_TYPES.has(ch.type)) continue;
      try {
        const msgs = await ch.messages.fetch({ limit: 100 });
        for (const [, msg] of msgs) {
          const attachments = msg.attachments.size
            ? JSON.stringify([...msg.attachments.values()].map(a => ({ url: a.url, name: a.name })))
            : null;
          await db.query(
            `INSERT INTO nation_messages (guild_id, channel_id, message_id, discord_id, username, avatar, content, attachments, sent_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (message_id) DO NOTHING`,
            [guildId, ch.id, msg.id, msg.author.id, msg.author.username,
             msg.author.displayAvatarURL({ size: 64, extension: 'png' }),
             msg.content || null, attachments, msg.createdAt]
          ).catch(() => {});
        }
      } catch (_) {}
    }
  }
}

module.exports = { syncNationServer };
