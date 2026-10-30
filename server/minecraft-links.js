// Which Minecraft Java account belongs to which Discord account: one each way.
//
// Anyone signed in can link (or change) their account on the site; the name is checked with Mojang and
// stored with its UUID. Accounts already given on a tester, leader or staff application are copied in
// for anyone who hasn't linked one themselves, so most applicants are linked without doing anything.
// UUIDs are stored without dashes, in lower case, as Mojang returns them.
const db = require('../db');
const { javaAccount } = require('./minecraft');

class LinkError extends Error {}
const plainUuid = u => String(u || '').toLowerCase().replace(/-/g, '');
const isUuid = u => /^[0-9a-f]{32}$/.test(plainUuid(u));
const dashed = u => plainUuid(u).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

const ready = (async () => {
  // mc_uuid is NULL when the owner removed a link: the row stays so the copy from applications
  // doesn't bring it back
  await db.query(`CREATE TABLE IF NOT EXISTS minecraft_links (
    discord_id TEXT PRIMARY KEY,
    discord_name TEXT,
    mc_uuid TEXT UNIQUE,
    mc_name TEXT,
    source TEXT NOT NULL,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
})().catch(e => console.error('[links] setup', e.message));

// the newest account each person gave on an application, for anyone not linked yet; an account
// someone else has already linked is left alone
const SOURCES = [
  ['staff application', `SELECT discord_id, discord_name, mc_uuid, mc_name, updated_at AS at FROM staff_apps`],
  ['leader application', `SELECT discord_id, discord_name, mc_uuid, mc_name, updated_at AS at FROM leader_applications WHERE stage <> 'ended'`],
  ['leadership team', `SELECT discord_id, discord_name, mc_uuid, mc_name, responded_at AS at FROM leader_team WHERE status = 'confirmed'`],
  ['tester application', `SELECT discord_id, discord_name, mc_uuid, mc_name, applied_at AS at FROM tester_applications WHERE mc_uuid IS NOT NULL`],
];
async function copyFromApplications() {
  await ready;
  let added = 0;
  for (const [source, q] of SOURCES) {
    try {
      const r = await db.query(
        `INSERT INTO minecraft_links (discord_id, discord_name, mc_uuid, mc_name, source)
         SELECT DISTINCT ON (discord_id) discord_id, discord_name, lower(replace(mc_uuid, '-', '')), mc_name, $1
         FROM (${q}) s WHERE mc_uuid IS NOT NULL ORDER BY discord_id, at DESC NULLS LAST
         ON CONFLICT DO NOTHING`, [source]);
      added += r.rowCount;
    } catch (e) { /* that feature's table doesn't exist yet */ }
  }
  return added;
}

async function ofDiscord(discordId) {
  await ready;
  const r = (await db.query(`SELECT * FROM minecraft_links WHERE discord_id = $1 AND mc_uuid IS NOT NULL`, [discordId])).rows[0];
  return r || null;
}
async function ofUuid(uuid) {
  await ready;
  return (await db.query(`SELECT * FROM minecraft_links WHERE mc_uuid = $1`, [plainUuid(uuid)])).rows[0] || null;
}

// link (or change) the signed-in person's account. Returns { link, previousUuid }.
async function link(user, name) {
  await ready;
  name = String(name || '').trim();
  if (!name) throw new LinkError('Enter your Minecraft username.');
  let acc;
  try { acc = await javaAccount(name); } catch (e) { throw new LinkError("We couldn't check that name with Minecraft just now. Please try again in a minute."); }
  if (!acc) throw new LinkError(`"${name}" isn't a Minecraft Java account. Check the spelling (Java Edition, not Bedrock).`);
  const uuid = plainUuid(acc.uuid);
  const mine = (await db.query(`SELECT mc_uuid FROM minecraft_links WHERE discord_id = $1`, [user.id])).rows[0];
  const taken = (await db.query(`SELECT discord_id FROM minecraft_links WHERE mc_uuid = $1`, [uuid])).rows[0];
  if (taken && taken.discord_id !== user.id) throw new LinkError(`${acc.name} is already linked to another Discord account. If it's yours, ask staff in our Discord to sort it out.`);
  try {
    await db.query(
      `INSERT INTO minecraft_links (discord_id, discord_name, mc_uuid, mc_name, source) VALUES ($1, $2, $3, $4, 'site')
       ON CONFLICT (discord_id) DO UPDATE SET discord_name = EXCLUDED.discord_name, mc_uuid = EXCLUDED.mc_uuid, mc_name = EXCLUDED.mc_name,
         source = 'site', updated_at = NOW()`, [user.id, user.username, uuid, acc.name]);
  } catch (e) {
    if (e.code === '23505') throw new LinkError(`${acc.name} is already linked to another Discord account. If it's yours, ask staff in our Discord to sort it out.`);
    throw e;
  }
  return { link: await ofDiscord(user.id), previousUuid: mine && mine.mc_uuid !== uuid ? mine.mc_uuid : null };
}

// staff: take a link off someone (for a disputed account). Returns the UUID that was linked.
async function remove(discordId) {
  await ready;
  const r = (await db.query(`SELECT mc_uuid FROM minecraft_links WHERE discord_id = $1`, [discordId])).rows[0];
  await db.query(`UPDATE minecraft_links SET mc_uuid = NULL, mc_name = NULL, source = 'removed', updated_at = NOW() WHERE discord_id = $1`, [discordId]);
  return r ? r.mc_uuid : null;
}

function start() {
  const run = () => copyFromApplications().then(n => { if (n) console.log(`[links] copied ${n} Minecraft account${n === 1 ? '' : 's'} from applications`); }).catch(e => console.error('[links] copy', e.message));
  run();
  setInterval(run, 10 * 60 * 1000);
}

module.exports = { LinkError, ready, plainUuid, isUuid, dashed, ofDiscord, ofUuid, link, remove, copyFromApplications, start };
