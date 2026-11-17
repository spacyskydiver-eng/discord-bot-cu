// The connection to the game's web API (S81). Render's environment wins when set; otherwise the address and the web
// secret come from two site settings, game_web_url and game_web_secret (in the database, never in this public repo), and
// are filled into the environment once at start (game_profile_url, optional, for the public profile server), before any module that reads them is loaded. A change of either setting
// takes effect at the next restart. Only names are ever logged, never values.
const access = require('./access');

// the web API (behind the secret); the public profile server (service records, PROFILE_URL) is a different address
const URL_VARS = ['WAR_FEED_URL', 'GAME_API_URL', 'NATIONS_FEED_URL'];
const SECRET_VARS = ['WAR_FEED_SECRET', 'GAME_API_SECRET'];

async function hydrate() {
  try {
    const [url, secret, profile] = await Promise.all([access.getSetting('game_web_url'), access.getSetting('game_web_secret'), access.getSetting('game_profile_url')]);
    const filled = [];
    if (url) for (const k of URL_VARS) if (!process.env[k]) { process.env[k] = String(url).trim().replace(/\/$/, ''); filled.push(k); }
    if (profile && !process.env.PROFILE_URL) { process.env.PROFILE_URL = String(profile).trim().replace(/\/$/, ''); filled.push('PROFILE_URL'); }
    if (secret) for (const k of SECRET_VARS) if (!process.env[k]) { process.env[k] = String(secret).trim(); filled.push(k); }
    if (filled.length) console.log('[game-conn] from site settings:', filled.join(', '));
  } catch (e) {
    console.error('[game-conn] settings not read; the site runs on its environment only:', e.message);
  }
}

module.exports = { hydrate };
