// The comeback (S59): nations rallying after losing ground in two windows running, from the game's GET /api/public/comeback,
// so the nations page can point new and returning players to them. Nothing until the web API is live (no invented rallies).
const companion = require('./companion');
const { GAME_IDS } = require('./nation-roles');

let cache = null;

/** Site nation ids rallying now ([] when the game isn't connected or has no such route). */
async function rallying() {
  if (!companion.isLive()) return [];
  if (cache && Date.now() - cache.at < 60 * 1000) return cache.ids;
  let ids = [];
  try {
    const b = await companion.publicGet('/api/public/comeback');
    ids = (b.rallying || []).map(r => GAME_IDS[r.nation] || r.nation);
    // S82: a rally starts when a window closes: shown 10 minutes later (server/hold.js)
    ids = await require('./hold').holdValue('rallying', ids.slice().sort(), []);
  } catch (e) { ids = []; }
  cache = { at: Date.now(), ids };
  return ids;
}

module.exports = { rallying };
