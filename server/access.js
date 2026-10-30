// Who can see what, decided on the server for every request.
//  - Owner: the only account with the control centre.
//  - Staff: holds the GW Staff role in the CUE Discord server (checked through the bot, cached
//    briefly so removing the role takes effect within ROLE_TTL_MS), or is the owner.
//  - Maintenance mode: everyone except staff sees the maintenance page.
const db = require('../db');

const OWNER_ID = '933421117211815987';
const STAFF_GUILD_ID = '1449004906068312189';
const STAFF_ROLE_ID = '1563982613109149696';
const ROLE_TTL_MS = 2 * 60 * 1000;
const DISCORD_API = 'https://discord.com/api/v10';

const roleCache = new Map();   // discord id -> { staff, at }

async function hasStaffRole(userId) {
  const hit = roleCache.get(userId);
  if (hit && Date.now() - hit.at < ROLE_TTL_MS) return hit.staff;
  let staff = false;
  try {
    const r = await fetch(`${DISCORD_API}/guilds/${STAFF_GUILD_ID}/members/${userId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) staff = ((await r.json()).roles || []).includes(STAFF_ROLE_ID);
    else if (r.status !== 404) throw new Error('Discord member lookup failed: ' + r.status);
  } catch (e) {
    // fail closed and don't cache, so the next request asks Discord again
    console.error('[access]', e.message);
    roleCache.delete(userId);
    return false;
  }
  roleCache.set(userId, { staff, at: Date.now() });
  return staff;
}

const isOwner = user => !!user && user.id === OWNER_ID;

async function isStaff(user) {
  if (!user) return false;
  if (isOwner(user)) return true;
  return hasStaffRole(user.id);
}

/* ---------------------------------------------------------------- maintenance mode */
db.query(`CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
let maint = { on: true, at: 0 };
const MAINT_TTL_MS = 10 * 1000;

async function maintenanceOn() {
  if (Date.now() - maint.at < MAINT_TTL_MS) return maint.on;
  try {
    const row = (await db.query(`SELECT value FROM site_settings WHERE key = 'maintenance'`)).rows[0];
    // the site has been staff-only since the lockdown, so no stored value means on
    maint = { on: row ? row.value === 'on' : true, at: Date.now() };
  } catch (e) {
    console.error('[maintenance]', e.message);
    maint = { on: true, at: Date.now() };
  }
  return maint.on;
}

async function setMaintenance(on) {
  await db.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ('maintenance', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [on ? 'on' : 'off']);
  maint = { on, at: Date.now() };
}

/* ---------------------------------------------------------------- other site settings */
// small values set from the control centre (in site_settings), read at most once a minute
const settings = {};
async function getSetting(key) {
  const c = settings[key];
  if (c && Date.now() - c.at < 60 * 1000) return c.value;
  let value = null;
  try { const row = (await db.query(`SELECT value FROM site_settings WHERE key = $1`, [key])).rows[0]; value = row ? row.value : null; }
  catch (e) { console.error('[settings]', e.message); if (c) return c.value; }
  settings[key] = { value, at: Date.now() };
  return value;
}
async function setSetting(key, value) {
  if (value === null || value === '') await db.query(`DELETE FROM site_settings WHERE key = $1`, [key]);
  else await db.query(`INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [key, value]);
  settings[key] = { value: value || null, at: Date.now() };
}

module.exports = { OWNER_ID, STAFF_ROLE_ID, isOwner, isStaff, maintenanceOn, setMaintenance, getSetting, setSetting };
