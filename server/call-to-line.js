// Call to the line (meeting 3, S39): a linked soldier who opts in gets a Discord DM when one of his own nation's nodes is
// under attack in a war window and he isn't online: "Verdun is under attack". Only which node: no numbers, no attackers,
// nothing his own map wouldn't show. Off by default for every player; at most one DM per 20 minutes; never in his quiet
// hours (22:00-08:00 in his own time zone, taken from his browser when he turns it on). The whole thing is behind the site
// setting `call_to_line` (off / dry / on; dry logs who would be told).
const db = require('../db');
const access = require('./access');
const companion = require('./companion');

const COOLDOWN_MS = 20 * 60 * 1000, QUIET_FROM = 22, QUIET_TO = 8, ME_CACHE_MS = 10 * 60 * 1000;

const ready = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS call_to_line (discord_id TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT FALSE,
    tz TEXT, last_sent TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
})().catch(e => console.error('[call-to-line] setup', e.message));

function validTz(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 64) return null;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return tz; } catch (e) { return null; }
}

async function settings(discordId) {
  await ready;
  const r = (await db.query(`SELECT enabled, tz FROM call_to_line WHERE discord_id = $1`, [discordId])).rows[0];
  return { enabled: !!(r && r.enabled), tz: (r && r.tz) || 'Europe/London' };
}

async function set(discordId, enabled, tz) {
  await ready;
  const zone = validTz(tz) || 'Europe/London';
  await db.query(`INSERT INTO call_to_line (discord_id, enabled, tz) VALUES ($1, $2, $3)
    ON CONFLICT (discord_id) DO UPDATE SET enabled = EXCLUDED.enabled, tz = EXCLUDED.tz, updated_at = NOW()`, [discordId, !!enabled, zone]);
  return { enabled: !!enabled, tz: zone };
}

/** The hour in a time zone (0-23). */
function hourIn(tz, at) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: validTz(tz) || 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(at));
}
function quiet(tz, at) {
  const h = hourIn(tz, at);
  return QUIET_FROM > QUIET_TO ? (h >= QUIET_FROM || h < QUIET_TO) : (h >= QUIET_FROM && h < QUIET_TO);
}

/** Who should be told about this alert, from the opted-in rows (pure: the tests drive it). */
function recipients(alert, rows, meOf, online, now) {
  const out = [];
  for (const r of rows) {
    if (!r.enabled) continue;
    const me = meOf(r.discord_id);
    if (!me || me.nation !== alert.nation || !me.alive) continue;
    if (online.has(me.uuid)) continue;
    if (quiet(r.tz, now)) continue;
    if (r.last_sent && now - new Date(r.last_sent).getTime() < COOLDOWN_MS) continue;
    out.push(r.discord_id);
  }
  return out;
}

function text(alert) {
  return `Call to the line: ${alert.nodeName} is under attack. The war window is open.\n` +
    `(You get this because you turned on alerts in the War Office at cuevents.xyz/war-office. Turn them off there any time.)`;
}

async function dm(discordId, content) {
  const ch = await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
    'Content-Type': 'application/json' }, body: JSON.stringify({ recipient_id: discordId }), signal: AbortSignal.timeout(8000) });
  if (!ch.ok) throw new Error('dm channel ' + ch.status);
  const { id } = await ch.json();
  const r = await fetch(`https://discord.com/api/v10/channels/${id}/messages`, { method: 'POST', headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
    'Content-Type': 'application/json' }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('dm ' + r.status);
}

let since = Date.now() - 5 * 60 * 1000;
const meCache = new Map();

async function poll() {
  const mode = await access.getSetting('call_to_line', 30 * 60 * 1000);
  if (mode !== 'on' && mode !== 'dry') return;
  if (!companion.isLive()) return;
  await ready;
  const feed = await companion.publicGet(`/api/public/alerts?since=${since}`);
  if (!feed || !Array.isArray(feed.alerts) || !feed.alerts.length) return;
  since = Math.max(since, ...feed.alerts.map(a => a.at));
  const rows = (await db.query(`SELECT discord_id, enabled, tz, last_sent FROM call_to_line WHERE enabled`)).rows;
  if (!rows.length) return;
  const now = Date.now();
  for (const r of rows) {
    const hit = meCache.get(r.discord_id);
    if (!hit || now - hit.at > ME_CACHE_MS) meCache.set(r.discord_id, { at: now, me: await companion.me(r.discord_id).catch(() => null) });
  }
  const online = new Set(feed.online || []);
  for (const alert of feed.alerts) {
    for (const id of recipients(alert, rows, d => (meCache.get(d) || {}).me, online, now)) {
      if (mode === 'dry') { console.log(`[call-to-line] dry: would tell ${id}: ${alert.nodeName}`); continue; }
      try {
        await dm(id, text(alert));
        await db.query(`UPDATE call_to_line SET last_sent = NOW() WHERE discord_id = $1`, [id]);
        const row = rows.find(x => x.discord_id === id); if (row) row.last_sent = new Date();
      } catch (e) { console.error('[call-to-line] dm', id, e.message); }
    }
  }
}

function start() {
  setInterval(() => poll().catch(e => console.error('[call-to-line] poll', e.message)), 60 * 1000);
}

module.exports = { settings, set, recipients, quiet, text, start, COOLDOWN_MS };
