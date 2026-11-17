// The connection to the game's web API (S81). Render's environment wins when set; otherwise the address and the web
// secret come from two site settings, game_web_url and game_web_secret (in the database, never in this public repo), and
// are filled into the environment once at start, before any module that reads them is loaded. A change of either setting
// takes effect at the next restart. Only names are ever logged, never values.
const access = require('./access');

const URL_VARS = ['WAR_FEED_URL', 'GAME_API_URL', 'NATIONS_FEED_URL', 'PROFILE_URL'];
const SECRET_VARS = ['WAR_FEED_SECRET', 'GAME_API_SECRET'];

async function hydrate() {
  try {
    const [url, secret] = await Promise.all([access.getSetting('game_web_url'), access.getSetting('game_web_secret')]);
    const filled = [];
    if (url) for (const k of URL_VARS) if (!process.env[k]) { process.env[k] = String(url).trim().replace(/\/$/, ''); filled.push(k); }
    if (secret) for (const k of SECRET_VARS) if (!process.env[k]) { process.env[k] = String(secret).trim(); filled.push(k); }
    if (filled.length) console.log('[game-conn] from site settings:', filled.join(', '));
  } catch (e) {
    console.error('[game-conn] settings not read; the site runs on its environment only:', e.message);
  }
}

module.exports = { hydrate };
