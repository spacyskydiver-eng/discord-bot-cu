const db = require('../db');

let cached = new Set();
let lastRefreshed = 0;

async function isNationGuild(guildId) {
  if (Date.now() - lastRefreshed > 90000) {
    const rows = (await db.query(`SELECT guild_id FROM nation_leader_applications`)).rows;
    cached = new Set(rows.map(r => r.guild_id));
    lastRefreshed = Date.now();
  }
  return cached.has(guildId);
}

function invalidate() { lastRefreshed = 0; }

module.exports = { isNationGuild, invalidate };
