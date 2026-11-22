// The connection to the game's web API (S81). Render's environment wins when set; otherwise the address and the web
// secret come from two site settings, game_web_url and game_web_secret (in the database, never in this public repo), and
// are filled into the environment once at start (game_profile_url, optional, for the public profile server), before any module that reads them is loaded. A change of either setting
// takes effect at the next restart. Only names are ever logged, never values.
const access = require('./access');

// the web API (behind the secret); the public profile server (service records, PROFILE_URL) is a different address
const URL_VARS = ['WAR_FEED_URL', 'GAME_API_URL', 'NATIONS_FEED_URL'];
const SECRET_VARS = ['WAR_FEED_SECRET', 'GAME_API_SECRET'];

let wait = 60 * 1000, timer = null;
function retryLater() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; hydrate(); }, wait);
  wait = Math.min(wait * 2, 30 * 60 * 1000);
}

async function hydrate() {
  try {
    const [url, secret, profile] = await Promise.all([access.getSetting('game_web_url'), access.getSetting('game_web_secret'), access.getSetting('game_profile_url')]);
    const filled = [];
    // all or nothing (S81 review): if Render's environment names ANY game address or secret (even an empty one), the
    // settings are not used at all, so a settings secret is never sent to an address the environment chose
    if ([...URL_VARS, ...SECRET_VARS].some(k => k in process.env)) {
      console.log('[game-conn] the environment sets the game connection; site settings not used');
      return;
    }
    // refuse malformed values rather than let an error message carry them
    let okUrl = false;
    try { okUrl = !!url && new URL(String(url).trim()).protocol === 'https:'; } catch (e) { okUrl = false; }
    const okSecret = !!secret && /^[\x21-\x7e]{16,256}$/.test(String(secret).trim());
    if (!okUrl || !okSecret) {
      if (url || secret) console.error('[game-conn] game_web_url / game_web_secret missing or malformed (https address and a 16-256 character secret); not used');
      // nothing read at all: most likely the database was unreachable at start (22 Nov: the site came up while Neon
      // refused connections and ran without the game until a restart); try again later, backing off to every 30 min
      else retryLater();
      return;
    }
    for (const k of URL_VARS) { process.env[k] = String(url).trim().replace(/\/$/, ''); filled.push(k); }
    if (profile && !('PROFILE_URL' in process.env)) { process.env.PROFILE_URL = String(profile).trim().replace(/\/$/, ''); filled.push('PROFILE_URL'); }
    for (const k of SECRET_VARS) { process.env[k] = String(secret).trim(); filled.push(k); }
    if (filled.length) console.log('[game-conn] from site settings:', filled.join(', '));
    wait = 60 * 1000;
  } catch (e) {
    console.error('[game-conn] settings not read; the site runs on its environment only:', e.message);
    retryLater();
  }
}

module.exports = { hydrate };
