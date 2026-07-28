const { ChannelType } = require('discord.js');
const db = require('../db');
const { isNationGuild } = require('../utils/nationGuilds');

const TEXT_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);

function setupNationTracking(client) {

  client.on('channelCreate', async channel => {
    if (!channel.guild) return;
    if (!await isNationGuild(channel.guild.id)) return;
    const catName = channel.parent?.name || null;
    await db.query(
      `INSERT INTO nation_channels (guild_id, channel_id, channel_name, channel_type, position, category_name)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (channel_id) DO UPDATE SET channel_name=$3, position=$5`,
      [channel.guild.id, channel.id, channel.name, channel.type, channel.position || 0, catName]
    ).catch(console.error);
  });

  client.on('channelDelete', async channel => {
    if (!channel.guild) return;
    await db.query(
      `UPDATE nation_channels SET deleted=true, deleted_at=NOW() WHERE channel_id=$1`,
      [channel.id]
    ).catch(console.error);
  });

  client.on('channelUpdate', async (_, newChannel) => {
    if (!newChannel.guild) return;
    if (!await isNationGuild(newChannel.guild.id)) return;
    const catName = newChannel.parent?.name || null;
    await db.query(
      `UPDATE nation_channels SET channel_name=$1, position=$2, category_name=$3 WHERE channel_id=$4`,
      [newChannel.name, newChannel.position || 0, catName, newChannel.id]
    ).catch(console.error);
  });

  client.on('guildMemberAdd', async member => {
    if (!await isNationGuild(member.guild.id)) return;
    await db.query(
      `INSERT INTO nation_members (guild_id, discord_id, username, display_name, avatar, joined_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (guild_id, discord_id) DO UPDATE SET username=$3, display_name=$4, avatar=$5, left_at=NULL`,
      [member.guild.id, member.user.id, member.user.username, member.displayName,
       member.user.displayAvatarURL({ size: 64, extension: 'png' })]
    ).catch(console.error);
  });

  client.on('guildMemberRemove', async member => {
    await db.query(
      `UPDATE nation_members SET left_at=NOW() WHERE guild_id=$1 AND discord_id=$2`,
      [member.guild.id, member.user.id]
    ).catch(console.error);
  });
}

module.exports = { setupNationTracking };
