// Tester applications for the Great War test sessions.
// Each session has its own applications: accepted up to the slot count, then a waitlist in the
// order people applied. Anyone with an accepted place in a session that hasn't ended holds the
// GW Testers role; the role is given and taken by the bot as places change.
// Session times are stored as timestamptz (UTC) and leave this module as Unix seconds.
const db = require('../db');
const { firstSession } = require('./test-sessions.config');

const GUILD_ID = '1449004906068312189';
const TESTER_ROLE_ID = '1563982664686506237';
const DISCORD_API = 'https://discord.com/api/v10';
const SITE = (() => { try { return new URL(process.env.REDIRECT_URI).origin; } catch (e) { return ''; } })();

/* ---------------------------------------------------------------- tables */
const ready = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS test_sessions (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    slots INT NOT NULL DEFAULT 50,
    team_size INT NOT NULL DEFAULT 25,
    open BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW())`);
  await db.query(`CREATE TABLE IF NOT EXISTS tester_applications (
    id SERIAL PRIMARY KEY,
    session_id INT NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
    discord_id TEXT NOT NULL,
    discord_name TEXT,
    mc_name TEXT NOT NULL,
    mc_uuid TEXT,
    status TEXT NOT NULL CHECK (status IN ('accepted', 'waitlisted', 'withdrawn', 'removed')),
    team TEXT CHECK (team IN ('A', 'B')),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    agreed_at TIMESTAMPTZ NOT NULL,
    UNIQUE (session_id, discord_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS tester_interest (
    discord_id TEXT PRIMARY KEY,
    discord_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW())`);
  const n = (await db.query(`SELECT count(*)::int AS n FROM test_sessions`)).rows[0].n;
  if (!n) {
    const s = firstSession;
    await db.query(`INSERT INTO test_sessions (title, starts_at, duration_minutes, slots, team_size) VALUES ($1, to_timestamp($2), $3, $4, $5)`,
      [s.title, s.starts_at, s.duration_minutes, s.slots, s.team_size]);
  }
})().catch(e => console.error('[testers] setup', e.message));

const SESSION_COLS = `s.id, s.title, extract(epoch from s.starts_at)::bigint AS starts_at, s.duration_minutes, s.slots, s.team_size, s.open,
  (SELECT count(*)::int FROM tester_applications a WHERE a.session_id = s.id AND a.status = 'accepted') AS taken,
  (SELECT count(*)::int FROM tester_applications a WHERE a.session_id = s.id AND a.status = 'waitlisted') AS waitlisted`;
const ENDS = `s.starts_at + make_interval(mins => s.duration_minutes)`;
const toSession = r => r && { ...r, starts_at: Number(r.starts_at) };

async function upcomingSessions() {
  await ready;
  return (await db.query(`SELECT ${SESSION_COLS} FROM test_sessions s WHERE ${ENDS} > NOW() ORDER BY s.starts_at`)).rows.map(toSession);
}
async function allSessions() {
  await ready;
  return (await db.query(`SELECT ${SESSION_COLS} FROM test_sessions s ORDER BY s.starts_at DESC`)).rows.map(toSession);
}
async function getSession(id, q = db) {
  return toSession((await q.query(`SELECT ${SESSION_COLS} FROM test_sessions s WHERE s.id = $1`, [id])).rows[0]);
}

/* ---------------------------------------------------------------- Discord */
const bot = (method, path, body) => fetch(DISCORD_API + path, {
  method,
  headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json', 'X-Audit-Log-Reason': 'Great War tester applications' },
  body: body ? JSON.stringify(body) : undefined,
  signal: AbortSignal.timeout(8000),
});

// The role follows the data: held while the member has an accepted place in a session that hasn't ended.
async function syncRole(discordId) {
  const place = (await db.query(
    `SELECT 1 FROM tester_applications a JOIN test_sessions s ON s.id = a.session_id
     WHERE a.discord_id = $1 AND a.status = 'accepted' AND ${ENDS} > NOW() LIMIT 1`, [discordId])).rows.length > 0;
  const m = await bot('GET', `/guilds/${GUILD_ID}/members/${discordId}`);
  if (m.status === 404) return { inServer: false, hasRole: false, shouldHave: place };
  if (!m.ok) throw new Error('member lookup failed: ' + m.status);
  const has = ((await m.json()).roles || []).includes(TESTER_ROLE_ID);
  if (place && !has) {
    const r = await bot('PUT', `/guilds/${GUILD_ID}/members/${discordId}/roles/${TESTER_ROLE_ID}`);
    if (!r.ok) throw new Error('could not give the tester role: ' + r.status);
  } else if (!place && has) {
    const r = await bot('DELETE', `/guilds/${GUILD_ID}/members/${discordId}/roles/${TESTER_ROLE_ID}`);
    if (!r.ok) throw new Error('could not remove the tester role: ' + r.status);
  }
  return { inServer: true, hasRole: place, shouldHave: place };
}
// read-only: is this member in the server, and do they hold the role?
async function memberState(discordId) {
  try {
    const m = await bot('GET', `/guilds/${GUILD_ID}/members/${discordId}`);
    if (m.status === 404) return { inServer: false, hasRole: false };
    if (!m.ok) return null;
    return { inServer: true, hasRole: ((await m.json()).roles || []).includes(TESTER_ROLE_ID) };
  } catch (e) { return null; }
}
const syncQuietly = id => syncRole(id).catch(e => { console.error('[testers] role', id, e.message); return { error: e.message }; });

async function dm(discordId, content) {
  try {
    const ch = await bot('POST', '/users/@me/channels', { recipient_id: discordId });
    if (!ch.ok) return false;
    const { id } = await ch.json();
    return (await bot('POST', `/channels/${id}/messages`, { content })).ok;
  } catch (e) { return false; }
}
// Discord shows <t:...> in each member's own timezone
const when = ts => `<t:${ts}:F> (<t:${ts}:R>)`;
function promotedMessage(session) {
  return `A place has opened up for **${session.title}** on ${when(session.starts_at)}, and it's yours. `
    + `You've been given the GW Testers role. If you can't make it any more, please withdraw on ${SITE}/testers so the next person gets the slot.`;
}

/* ---------------------------------------------------------------- applying, withdrawing, the waitlist */
// One session at a time: an advisory lock per session keeps the slot count exact under load.
async function inSession(sessionId, fn) {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(9137, $1)', [sessionId]);
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

// fill free places from the waitlist, oldest application first
async function promote(c, session) {
  const promoted = [];
  let free = session.slots - (await c.query(`SELECT count(*)::int AS n FROM tester_applications WHERE session_id = $1 AND status = 'accepted'`, [session.id])).rows[0].n;
  while (free > 0) {
    const next = (await c.query(
      `UPDATE tester_applications SET status = 'accepted', status_at = NOW()
       WHERE id = (SELECT id FROM tester_applications WHERE session_id = $1 AND status = 'waitlisted' ORDER BY applied_at, id LIMIT 1)
       RETURNING discord_id`, [session.id])).rows[0];
    if (!next) break;
    promoted.push(next.discord_id);
    free--;
  }
  return promoted;
}
async function afterPromotion(session, promoted) {
  for (const id of promoted) {
    await syncQuietly(id);
    await dm(id, promotedMessage(session));
  }
}

class ApplyError extends Error { constructor(code, message) { super(message); this.code = code; } }

async function apply(sessionId, user, mc) {
  await ready;
  const result = await inSession(sessionId, async c => {
    const s = await getSession(sessionId, c);
    if (!s || !s.open || s.starts_at <= Date.now() / 1000) throw new ApplyError('closed', 'Applications for this session are closed.');
    const prev = (await c.query(`SELECT status FROM tester_applications WHERE session_id = $1 AND discord_id = $2`, [sessionId, user.id])).rows[0];
    if (prev && (prev.status === 'accepted' || prev.status === 'waitlisted')) return { status: prev.status, already: true };
    if (prev && prev.status === 'removed') throw new ApplyError('removed', 'Staff have removed you from this session. Ask in the Discord if you think this is a mistake.');
    const status = s.taken < s.slots ? 'accepted' : 'waitlisted';
    await c.query(
      `INSERT INTO tester_applications (session_id, discord_id, discord_name, mc_name, mc_uuid, status, team, applied_at, status_at, agreed_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NOW(), NOW(), NOW())
       ON CONFLICT (session_id, discord_id) DO UPDATE SET discord_name = EXCLUDED.discord_name, mc_name = EXCLUDED.mc_name,
         mc_uuid = EXCLUDED.mc_uuid, status = EXCLUDED.status, team = NULL, applied_at = NOW(), status_at = NOW(), agreed_at = NOW()`,
      [sessionId, user.id, user.username, mc.name, mc.uuid, status]);
    return { status };
  });
  if (result.status === 'accepted') result.role = await syncQuietly(user.id);
  return result;
}

async function withdraw(sessionId, discordId) {
  await ready;
  const { session, promoted, changed } = await inSession(sessionId, async c => {
    const r = await c.query(
      `UPDATE tester_applications SET status = 'withdrawn', team = NULL, status_at = NOW()
       WHERE session_id = $1 AND discord_id = $2 AND status IN ('accepted', 'waitlisted') RETURNING status`, [sessionId, discordId]);
    const s = await getSession(sessionId, c);
    return { session: s, changed: r.rowCount > 0, promoted: s && s.starts_at + s.duration_minutes * 60 > Date.now() / 1000 ? await promote(c, s) : [] };
  });
  if (changed) await syncQuietly(discordId);
  await afterPromotion(session, promoted);
  return { changed, promoted: promoted.length };
}

async function joinInterest(user) {
  await ready;
  await db.query(`INSERT INTO tester_interest (discord_id, discord_name) VALUES ($1, $2) ON CONFLICT (discord_id) DO UPDATE SET discord_name = EXCLUDED.discord_name`, [user.id, user.username]);
}

// what the applicant sees: their own rows only
async function mine(discordId) {
  await ready;
  const rows = (await db.query(
    `SELECT a.session_id, a.status, a.team, a.mc_name, extract(epoch from a.applied_at)::bigint AS applied_at,
       CASE WHEN a.status = 'waitlisted' THEN (SELECT count(*)::int + 1 FROM tester_applications b
         WHERE b.session_id = a.session_id AND b.status = 'waitlisted' AND (b.applied_at, b.id) < (a.applied_at, a.id)) END AS position
     FROM tester_applications a WHERE a.discord_id = $1`, [discordId])).rows;
  const interest = (await db.query(`SELECT 1 FROM tester_interest WHERE discord_id = $1`, [discordId])).rows.length > 0;
  return { applications: rows.map(r => ({ ...r, applied_at: Number(r.applied_at) })), interest };
}

/* ---------------------------------------------------------------- control centre */
async function applications(sessionId) {
  return (await db.query(
    `SELECT id, discord_id, discord_name, mc_name, status, team, extract(epoch from applied_at)::bigint AS applied_at
     FROM tester_applications WHERE session_id = $1
     ORDER BY CASE status WHEN 'accepted' THEN 0 WHEN 'waitlisted' THEN 1 ELSE 2 END, applied_at, id`, [sessionId])).rows
    .map(r => ({ ...r, applied_at: Number(r.applied_at) }));
}

async function adminSetStatus(appId, status) {
  const app = (await db.query(`SELECT session_id, discord_id FROM tester_applications WHERE id = $1`, [appId])).rows[0];
  if (!app) return;
  const { session, promoted } = await inSession(app.session_id, async c => {
    await c.query(`UPDATE tester_applications SET status = $2::text, status_at = NOW(), team = CASE WHEN $2::text = 'accepted' THEN team ELSE NULL END WHERE id = $1`, [appId, status]);
    const s = await getSession(app.session_id, c);
    return { session: s, promoted: status === 'removed' ? await promote(c, s) : [] };
  });
  await syncQuietly(app.discord_id);
  await afterPromotion(session, promoted);
}

async function saveSession(id, f) {
  await ready;
  if (id) {
    await db.query(`UPDATE test_sessions SET title = $2, starts_at = to_timestamp($3), duration_minutes = $4, slots = $5, team_size = $6, open = $7 WHERE id = $1`,
      [id, f.title, f.starts_at, f.duration_minutes, f.slots, f.team_size, f.open]);
    // more slots can let people in from the waitlist
    const { session, promoted } = await inSession(id, async c => { const s = await getSession(id, c); return { session: s, promoted: await promote(c, s) }; });
    await afterPromotion(session, promoted);
    // a moved start time can change who should hold the role
    for (const a of await applications(id)) if (a.status === 'accepted') await syncQuietly(a.discord_id);
    return id;
  }
  return (await db.query(`INSERT INTO test_sessions (title, starts_at, duration_minutes, slots, team_size, open) VALUES ($1, to_timestamp($2), $3, $4, $5, $6) RETURNING id`,
    [f.title, f.starts_at, f.duration_minutes, f.slots, f.team_size, f.open])).rows[0].id;
}

// two teams of team_size from the accepted players, keeping anyone already placed where they are
async function autoTeams(sessionId) {
  const s = await getSession(sessionId);
  const acc = (await applications(sessionId)).filter(a => a.status === 'accepted');
  const count = { A: acc.filter(a => a.team === 'A').length, B: acc.filter(a => a.team === 'B').length };
  const unplaced = acc.filter(a => !a.team);
  for (let i = unplaced.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [unplaced[i], unplaced[j]] = [unplaced[j], unplaced[i]]; }
  for (const a of unplaced) {
    const t = count.A <= count.B ? 'A' : 'B';
    if (count[t] >= s.team_size) continue;
    await db.query(`UPDATE tester_applications SET team = $2 WHERE id = $1`, [a.id, t]);
    count[t]++;
  }
}
async function setTeam(appId, team) {
  await db.query(`UPDATE tester_applications SET team = $2 WHERE id = $1 AND status = 'accepted'`, [appId, team === 'A' || team === 'B' ? team : null]);
}
async function clearTeams(sessionId) { await db.query(`UPDATE tester_applications SET team = NULL WHERE session_id = $1`, [sessionId]); }

// staff roster: accepted players by team, for upcoming sessions
async function roster() {
  const out = [];
  for (const s of await upcomingSessions()) {
    const acc = (await applications(s.id)).filter(a => a.status === 'accepted').map(a => ({ discord_name: a.discord_name, mc_name: a.mc_name, team: a.team }));
    out.push({ ...s, players: acc });
  }
  return out;
}

/* ---------------------------------------------------------------- keeping roles right over time */
// after a session ends its testers lose the role (unless they have a place in another), and
// accepted players who joined the server since applying get it
async function sweep() {
  await ready;
  const ids = (await db.query(
    `SELECT DISTINCT a.discord_id FROM tester_applications a JOIN test_sessions s ON s.id = a.session_id
     WHERE a.status = 'accepted' AND ${ENDS} > NOW() - interval '3 days'`)).rows.map(r => r.discord_id);
  for (const id of ids) await syncQuietly(id);
}
function startSweeps() {
  setTimeout(sweep, 60 * 1000);
  setInterval(sweep, 10 * 60 * 1000);
}
async function onMemberJoin(member) {
  if (member.guild.id !== GUILD_ID) return;
  const has = (await db.query(`SELECT 1 FROM tester_applications WHERE discord_id = $1 AND status = 'accepted' LIMIT 1`, [member.id])).rows.length;
  if (has) await syncQuietly(member.id);
}

module.exports = {
  GUILD_ID, TESTER_ROLE_ID, ApplyError,
  upcomingSessions, allSessions, getSession, apply, withdraw, joinInterest, mine, syncRole, memberState,
  applications, adminSetStatus, saveSession, autoTeams, setTeam, clearTeams, roster, sweep, startSweeps, onMemberJoin,
};
