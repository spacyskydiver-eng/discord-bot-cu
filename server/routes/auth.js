const express = require('express');
const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';

router.get('/debug', (req, res) => {
  const redirectUri = process.env.REDIRECT_URI || 'NOT SET';
  const clientId = process.env.CLIENT_ID || 'NOT SET';
  const hasSecret = !!process.env.DISCORD_CLIENT_SECRET;
  const hasSession = !!process.env.SESSION_SECRET;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify'
  });
  const oauthUrl = `https://discord.com/oauth2/authorize?${params}`;
  res.send(`
    <style>body{font-family:monospace;padding:2rem;background:#111;color:#ddd}
    .ok{color:#4ec994}.bad{color:#e05555}.label{color:#888;font-size:0.8rem}</style>
    <h2>OAuth Debug</h2>
    <p><span class="label">CLIENT_ID: </span><b>${clientId}</b></p>
    <p><span class="label">REDIRECT_URI: </span><b>${redirectUri}</b></p>
    <p><span class="label">DISCORD_CLIENT_SECRET set: </span><b class="${hasSecret ? 'ok' : 'bad'}">${hasSecret ? 'YES' : 'NO'}</b></p>
    <p><span class="label">SESSION_SECRET set: </span><b class="${hasSession ? 'ok' : 'bad'}">${hasSession ? 'YES' : 'NO'}</b></p>
    <br/>
    <p><span class="label">Full OAuth URL that will be sent to Discord:</span></p>
    <p style="word-break:break-all;background:#222;padding:1rem;border-radius:6px">${oauthUrl}</p>
    <br/>
    <p style="color:#888;font-size:0.8rem">The REDIRECT_URI above must match EXACTLY what is registered in Discord Developer Portal under OAuth2 &gt; Redirects.</p>
    <a href="/auth/discord" style="color:#5865f2">Try Discord login</a>
  `);
});

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
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.id) % 5}.png`
    };

    res.redirect('/');
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect('/auth/error?reason=oauth-failed');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
