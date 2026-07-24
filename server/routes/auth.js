const express = require('express');
const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';

router.get('/discord', (req, res) => {
  if (!process.env.DISCORD_CLIENT_SECRET || !process.env.REDIRECT_URI || !process.env.CLIENT_ID) {
    return res.redirect('/auth/error?reason=not-configured');
  }
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    response_type: 'code',
    scope: 'identify'
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

router.get('/error', (req, res) => {
  res.render('auth-error', { reason: req.query.reason || 'unknown' });
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/');

  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token');

    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const user = await userRes.json();

    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.id) % 5}.png`,
      guildRoleIds: []
    };

    // Fetch the user's roles in the guild so we can gate staff content
    if (process.env.DISCORD_TOKEN && process.env.GUILD_ID) {
      try {
        const memberRes = await fetch(`${DISCORD_API}/guilds/${process.env.GUILD_ID}/members/${user.id}`, {
          headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
        });
        if (memberRes.ok) {
          const member = await memberRes.json();
          req.session.user.guildRoleIds = member.roles || [];
        }
      } catch (_) {}
    }

    const home = req.session.lang === 'fr' ? '/fr/' : '/';
    res.redirect(home);
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect('/auth/error?reason=oauth-failed');
  }
});

router.get('/logout', (req, res) => {
  const home = req.session.lang === 'fr' ? '/fr/' : '/';
  req.session.destroy(() => res.redirect(home));
});

module.exports = router;
