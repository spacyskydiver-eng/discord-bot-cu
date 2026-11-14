// The Great War's player application (17 Dec). Closed until the owner opens it (site setting gw_apply_open). Private:
// it lives only in the database, and only staff see it, with counts by play style, time zone and hours so nations and
// war windows can be planned around real players. One Minecraft account per person: an account already linked to, or
// applied with by, another Discord account is refused, with the way to appeal.
const db = require('../db');
const access = require('./access');
const links = require('./minecraft-links');
const { javaAccount } = require('./minecraft');

const STYLES = [
  ['fighter', 'Fighter', 'A fight every evening: rifleman, sniper, tanker, raider'],
  ['builder', 'Builder', 'Trenches, forts and towns'],
  ['roleplayer', 'Role-player', 'Playing a soldier, officer, medic, diplomat or spy'],
  ['trader', 'Trader', 'Mining, farming, crafting, markets'],
  ['leader', 'Leader', 'Running a nation, making deals'],
  ['explorer', 'Explorer', 'Seeing the whole map, collecting everything'],
];
const HOURS = [['lt1', 'Under an hour a day'], ['1to2', '1 to 2 hours a day'], ['2to4', '2 to 4 hours a day'], ['4plus', 'More than 4 hours a day']];
const TIMES = [['weekday_day', 'Weekday daytimes'], ['weekday_eve', 'Weekday evenings'], ['weekend_day', 'Weekend daytimes'], ['weekend_eve', 'Weekend evenings'], ['late', 'Late at night']];
const KEY = 'gw_apply_open';
// the event's first war window (19 Dec 2026, 19:00 UK = UTC in December): each applicant's local hour for it
const FIRST_WINDOW = Date.UTC(2026, 11, 19, 19);

class GwApplyError extends Error { constructor(message, field) { super(message); this.field = field; } }

const ready = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS gw_applications (
    discord_id TEXT PRIMARY KEY,
    discord_name TEXT,
    mc_uuid TEXT NOT NULL,
    mc_name TEXT NOT NULL,
    timezone TEXT NOT NULL,
    hours TEXT NOT NULL,
    times TEXT[] NOT NULL DEFAULT '{}',
    styles TEXT[] NOT NULL DEFAULT '{}',
    new_to_modded BOOLEAN NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
})().catch(e => console.error('[gw-apply] setup', e.message));

const isOpen = async () => (await access.getSetting(KEY)) === 'open';
const setOpen = open => access.setSetting(KEY, open ? 'open' : 'closed');
const validZone = z => { try { new Intl.DateTimeFormat('en-GB', { timeZone: z }); return /\//.test(z) || z === 'UTC'; } catch (e) { return false; } };
const localHour = zone => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(FIRST_WINDOW);

async function mine(discordId) {
  await ready;
  return (await db.query(`SELECT * FROM gw_applications WHERE discord_id = $1`, [discordId])).rows[0] || null;
}

// apply, or update your own application while it's open
async function submit(user, f) {
  await ready;
  if (!(await isOpen())) throw new GwApplyError('Applications for The Great War aren\'t open yet.');
  const name = String(f.mc_name || '').trim();
  if (!name) throw new GwApplyError('Enter your Minecraft username.', 'mc_name');
  let acc;
  try { acc = await javaAccount(name); } catch (e) { throw new GwApplyError("We couldn't check your Minecraft username just now. Please try again in a minute.", 'mc_name'); }
  if (!acc) throw new GwApplyError(`"${name}" isn't a Minecraft Java account. Check the spelling (Java Edition, not Bedrock).`, 'mc_name');
  const uuid = links.plainUuid(acc.uuid);
  // one Minecraft account, one person (S19)
  const linked = await links.ofUuid(uuid);
  const other = (await db.query(`SELECT discord_id FROM gw_applications WHERE mc_uuid = $1 AND discord_id <> $2`, [uuid, user.id])).rows[0];
  if ((linked && linked.discord_id !== user.id && linked.mc_uuid) || other)
    throw new GwApplyError(`${acc.name} is already linked to another Discord account, so it can't be used here. If it's yours, open a ticket in #create-a-ticket on our Discord and staff will sort it out.`, 'mc_name');
  const zone = String(f.timezone || '').trim();
  if (!validZone(zone)) throw new GwApplyError('Pick your time zone from the list.', 'timezone');
  const hours = HOURS.some(h => h[0] === f.hours) ? f.hours : null;
  if (!hours) throw new GwApplyError('Say how long you expect to play on a typical day.', 'hours');
  const arr = v => (Array.isArray(v) ? v : v ? [v] : []).map(String);
  const times = arr(f.times).filter(t => TIMES.some(x => x[0] === t));
  if (!times.length) throw new GwApplyError('Tick at least one time you expect to play.', 'times');
  const styles = arr(f.styles).filter(s => STYLES.some(x => x[0] === s));
  if (!styles.length) throw new GwApplyError('Tick at least one way you like to play.', 'styles');
  if (f.new_to_modded !== 'yes' && f.new_to_modded !== 'no') throw new GwApplyError('Say whether you\'re new to modded Minecraft.', 'new_to_modded');
  await db.query(
    `INSERT INTO gw_applications (discord_id, discord_name, mc_uuid, mc_name, timezone, hours, times, styles, new_to_modded)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (discord_id) DO UPDATE SET discord_name = EXCLUDED.discord_name, mc_uuid = EXCLUDED.mc_uuid, mc_name = EXCLUDED.mc_name,
       timezone = EXCLUDED.timezone, hours = EXCLUDED.hours, times = EXCLUDED.times, styles = EXCLUDED.styles,
       new_to_modded = EXCLUDED.new_to_modded, updated_at = NOW()`,
    [user.id, user.username, uuid, acc.name, zone, hours, times, styles, f.new_to_modded === 'yes']);
  return mine(user.id);
}

// staff: every application, and the counts that plan nations and windows
async function overview() {
  await ready;
  const apps = (await db.query(`SELECT *, extract(epoch from applied_at)::bigint AS at FROM gw_applications ORDER BY applied_at DESC`)).rows;
  const tally = (list, key) => list.map(([k, label]) => ({ key: k, label, n: apps.filter(a => key(a, k)).length }));
  const windowHour = {};
  apps.forEach(a => { const h = localHour(a.timezone); windowHour[h] = (windowHour[h] || 0) + 1; });
  const zones = {};
  apps.forEach(a => { zones[a.timezone] = (zones[a.timezone] || 0) + 1; });
  return {
    apps, total: apps.length, newcomers: apps.filter(a => a.new_to_modded).length,
    styles: tally(STYLES, (a, k) => a.styles.includes(k)),
    hours: tally(HOURS, (a, k) => a.hours === k),
    times: tally(TIMES, (a, k) => a.times.includes(k)),
    windowHour: Object.entries(windowHour).sort((a, b) => a[0].localeCompare(b[0])),
    zones: Object.entries(zones).sort((a, b) => b[1] - a[1]),
  };
}

function csv(apps) {
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  return [['discord', 'discord_id', 'minecraft', 'timezone', 'first_window_local', 'hours', 'times', 'styles', 'new_to_modded', 'applied']]
    .concat(apps.map(a => [a.discord_name, a.discord_id, a.mc_name, a.timezone, localHour(a.timezone), a.hours, a.times.join(' '), a.styles.join(' '), a.new_to_modded ? 'yes' : 'no', new Date(a.at * 1000).toISOString()]))
    .map(r => r.map(q).join(',')).join('\n') + '\n';
}

module.exports = { STYLES, HOURS, TIMES, GwApplyError, isOpen, setOpen, mine, submit, overview, csv, localHour, ready };
