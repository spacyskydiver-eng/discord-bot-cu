const DISCORD_API = 'https://discord.com/api/v10';

async function sendDiscordDM(userId, content) {
  if (!process.env.DISCORD_TOKEN || !userId) return;
  try {
    const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: userId })
    });
    if (!dmRes.ok) return;
    const { id: channelId } = await dmRes.json();
    if (!channelId) return;
    await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
  } catch (_) {}
}

module.exports = { sendDiscordDM };
