// Leader applications for The Great War.
//
// An applicant names a leadership team of four (each a member of our Discord server with a real Minecraft
// Java account), each teammate confirms or declines, and the applicant fills in the application, with a
// voice pitch. An application is complete only when all four have confirmed before applications close;
// staff review complete ones (scores, brief attendance, shortlist, accept as Leader of a nation, decline).
// Accepted Leaders get a cabinet page: their team holds four seats, they can fill the other four from
// their assigned players, and set the succession, which is exported to the game server's web API.
//
// Times are stored as timestamptz (UTC) and leave this module as Unix seconds. Bot messages use Discord
// timestamps (<t:...>) so each member reads them in their own timezone.
const db = require('../db');
const C = require('./leaders.config');
const { javaAccount } = require('./minecraft');

const GUILD_ID = '1449004906068312189';
const DISCORD_API = 'https://discord.com/api/v10';
const SITE = (() => { try { return new URL(process.env.REDIRECT_URI).origin; } catch (e) { return ''; } })();
const NATION = Object.fromEntries(C.nations.map(n => [n.key, n]));
const ACTIVE = `('draft', 'submitted', 'shortlisted', 'attended', 'accepted')`;   // stages that hold a team
const now = () => Math.floor(Date.now() / 1000);
const isOpen = () => now() <= C.closesAt;

/* ---------------------------------------------------------------- outside services */
const botRest = (method, path, body) => fetch(DISCORD_API + path, {
  method,
  headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json', 'X-Audit-Log-Reason': 'Great War leader applications' },
  body: body ? JSON.stringify(body) : undefined,
  signal: AbortSignal.timeout(8000),
});
const services = {
  // a member of our server with exactly this username, { id, username }; null if there's none; throws if
  // Discord can't be reached
  async findMember(username) {
    const r = await botRest('GET', `/guilds/${GUILD_ID}/members/search?query=${encodeURIComponent(username)}&limit=25`);
    if (!r.ok) throw new Error('member search failed: ' + r.status);
    const hit = (await r.json()).find(m => m.user && m.user.username.toLowerCase() === username.toLowerCase());
    return hit ? { id: hit.user.id, username: hit.user.username } : null;
  },
  async addRole(discordId, roleId) {
    const r = await botRest('PUT', `/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`);
    return r.ok;
  },
  async dm(discordId, content) {
    try {
      const ch = await botRest('POST', '/users/@me/channels', { recipient_id: discordId });
      if (!ch.ok) return false;
      const { id } = await ch.json();
      return (await botRest('POST', `/channels/${id}/messages`, { content })).ok;
    } catch (e) { return false; }
  },
  javaAccount,
  // members of our server holding a role (the server has under 1,000 members; pages through if it grows)
  async membersWithRole(roleId) {
    const out = [];
    let after = '0';
    for (let page = 0; page < 20; page++) {
      const r = await botRest('GET', `/guilds/${GUILD_ID}/members?limit=1000&after=${after}`);
      if (!r.ok) throw new Error('member list failed: ' + r.status);
      const batch = await r.json();
      for (const m of batch) if ((m.roles || []).includes(roleId) && !m.user.bot) out.push({ id: m.user.id, username: m.user.username });
      if (batch.length < 1000) break;
      after = batch[batch.length - 1].user.id;
    }
    return out;
  },
  // an existing YouTube video (public or unlisted); true if YouTube can't be reached, so an outage never blocks anyone
  async youtubeExists(id) {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { signal: AbortSignal.timeout(6000) });
      if (r.status === 401 || r.status === 403 || r.status === 404 || r.status === 400) return false;
      return true;
    } catch (e) { return true; }
  },
  // the game server's web API (greatwar docs/WEB_API.md): POST /api/act as a linked operator
  async gameAct(body) {
    const g = C.gameApi;
    if (!g.url || !g.secret || !g.token) return { ok: false, message: 'The game server API is not configured (GW_API_URL, GW_API_SECRET, GW_API_TOKEN).' };
    try {
      const r = await fetch(g.url.replace(/\/$/, '') + '/api/act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Greatwar-Secret': g.secret, Authorization: `Bearer ${g.token}` },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      const d = await r.json().catch(() => ({}));
      return { ok: r.ok && !!d.ok, message: d.message || (r.ok ? '' : 'HTTP ' + r.status) };
    } catch (e) { return { ok: false, message: 'Could not reach the game server: ' + e.message }; }
  },
};

/* ---------------------------------------------------------------- tables */
const ready = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS leader_applications (
    id SERIAL PRIMARY KEY,
    discord_id TEXT NOT NULL UNIQUE,
    discord_name TEXT,
    mc_name TEXT NOT NULL,
    mc_uuid TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'draft' CHECK (stage IN ('draft', 'submitted', 'shortlisted', 'attended', 'accepted', 'declined', 'ended')),
    nation_prefs JSONB,
    timezone TEXT,
    experience TEXT,
    ref_server TEXT,
    ref_person TEXT,
    answers JSONB,
    plan TEXT,
    voice_kind TEXT CHECK (voice_kind IN ('recording', 'youtube')),
    youtube_id TEXT,
    agreed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    brief_attended BOOLEAN NOT NULL DEFAULT false,
    accepted_nation TEXT,
    decided_at TIMESTAMPTZ,
    decided_by TEXT,
    discord_deadline TIMESTAMPTZ,
    roles_result JSONB,
    ended_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.query(`CREATE TABLE IF NOT EXISTS leader_team (
    id SERIAL PRIMARY KEY,
    app_id INT NOT NULL REFERENCES leader_applications(id) ON DELETE CASCADE,
    slot INT NOT NULL CHECK (slot BETWEEN 1 AND 4),
    discord_id TEXT NOT NULL,
    discord_name TEXT,
    mc_name TEXT NOT NULL,
    mc_uuid TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined', 'released')),
    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    dm_sent BOOLEAN)`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS leader_team_slot ON leader_team (app_id, slot) WHERE status IN ('pending', 'confirmed')`);
  await db.query(`CREATE TABLE IF NOT EXISTS leader_recordings (
    app_id INT PRIMARY KEY REFERENCES leader_applications(id) ON DELETE CASCADE,
    mime TEXT NOT NULL,
    seconds REAL,
    size INT NOT NULL,
    data BYTEA NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.query(`CREATE TABLE IF NOT EXISTS leader_scores (
    app_id INT NOT NULL REFERENCES leader_applications(id) ON DELETE CASCADE,
    reviewer_id TEXT NOT NULL,
    reviewer_name TEXT,
    communication INT CHECK (communication BETWEEN 1 AND 5),
    judgement INT CHECK (judgement BETWEEN 1 AND 5),
    availability INT CHECK (availability BETWEEN 1 AND 5),
    experience INT CHECK (experience BETWEEN 1 AND 5),
    attitude INT CHECK (attitude BETWEEN 1 AND 5),
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (app_id, reviewer_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS leader_cabinet (
    app_id INT NOT NULL REFERENCES leader_applications(id) ON DELETE CASCADE,
    position INT NOT NULL,
    discord_id TEXT,
    discord_name TEXT,
    mc_name TEXT NOT NULL,
    mc_uuid TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('team', 'player')),
    PRIMARY KEY (app_id, position))`);
  await db.query(`CREATE TABLE IF NOT EXISTS leader_exports (
    id SERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    by_name TEXT,
    results JSONB NOT NULL)`);
})().catch(e => console.error('[leaders] setup', e.message));

/* ---------------------------------------------------------------- helpers */
class LeaderError extends Error {
  constructor(message, fields) { super(message); this.fields = fields || null; }
}
const cleanName = s => String(s || '').trim().replace(/^@/, '');
const dashed = u => String(u || '').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
const when = ts => `<t:${ts}:F> (<t:${ts}:R>)`;
const briefText = () => C.briefAt ? when(C.briefAt) : `**${C.briefDate}** (time to be announced)`;
const closesText = () => when(C.closesAt);
const nationName = key => (NATION[key] || {}).name || key;

// one team change at a time, everywhere: keeps "one team per person" exact
async function teamLock(fn) {
  await ready;
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(9138, 1)');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

const APP_COLS = `a.*, extract(epoch from a.submitted_at)::bigint AS submitted_ts, extract(epoch from a.decided_at)::bigint AS decided_ts,
  extract(epoch from a.discord_deadline)::bigint AS deadline_ts, extract(epoch from a.created_at)::bigint AS created_ts`;
async function teamOf(appId, q = db) {
  return (await q.query(
    `SELECT id, slot, discord_id, discord_name, mc_name, mc_uuid, reason, status, extract(epoch from responded_at)::bigint AS responded_ts
     FROM leader_team WHERE app_id = $1 AND status IN ('pending', 'confirmed', 'declined') ORDER BY slot, id`, [appId])).rows
    .map(r => ({ ...r, responded_ts: r.responded_ts ? Number(r.responded_ts) : null }));
}
// the current holder of each slot (a declined row only shows while nobody has been named in its place)
function currentTeam(rows) {
  const out = [];
  for (let s = 1; s <= C.teamSize; s++) {
    const live = rows.find(r => r.slot === s && r.status !== 'declined');
    const declined = rows.filter(r => r.slot === s && r.status === 'declined').pop();
    out.push(live || declined || { slot: s, status: 'empty' });
  }
  return out;
}
const complete = team => team.length === C.teamSize && team.every(m => m.status === 'confirmed');

function statusLabel(app, team) {
  if (!app) return null;
  switch (app.stage) {
    case 'ended': return 'Ended';
    case 'declined': return 'Declined';
    case 'accepted': return `Accepted (Leader of ${nationName(app.accepted_nation)})`;
    case 'attended': return 'Attended brief';
    case 'shortlisted': return 'Shortlisted';
    case 'submitted': return complete(team) ? 'Submitted' : 'Incomplete';
    default: return 'Incomplete';
  }
}

/* ---------------------------------------------------------------- step 1: the team */
// Everyone named is checked before anything is saved: a member of our server, a real Java account, nobody
// twice, nobody already on another team. Every failure is reported against its own field.
async function saveTeam(user, input) {
  if (!isOpen()) throw new LeaderError('Leader applications are closed.');
  const errors = {};
  const me = { discord: cleanName(input.self && input.self.discord), mc: cleanName(input.self && input.self.mc) };
  const want = [];
  for (let s = 1; s <= C.teamSize; s++) {
    const m = (input.members || []).find(x => +x.slot === s) || {};
    want.push({ slot: s, discord: cleanName(m.discord), mc: cleanName(m.mc), reason: String(m.reason || '').trim() });
  }
  await ready;
  const existing = (await db.query(`SELECT * FROM leader_applications WHERE discord_id = $1`, [user.id])).rows[0];
  if (existing && !['draft', 'submitted', 'ended'].includes(existing.stage)) throw new LeaderError('Your team can no longer be changed.');
  const keep = existing && existing.stage !== 'ended' ? await teamOf(existing.id) : [];
  const locked = new Set(keep.filter(r => r.status === 'confirmed').map(r => r.slot));

  // the applicant
  if (!me.discord) errors['self.discord'] = 'Enter your Discord username.';
  else if (me.discord.toLowerCase() !== String(user.username).toLowerCase()) errors['self.discord'] = `That isn't the Discord account you're signed in with (${user.username}).`;
  if (!me.mc) errors['self.mc'] = 'Enter your Minecraft username.';
  for (const m of want) {
    if (locked.has(m.slot)) continue;
    if (!m.discord) errors[`m${m.slot}.discord`] = 'Enter their Discord username.';
    if (!m.mc) errors[`m${m.slot}.mc`] = 'Enter their Minecraft username.';
    if (!m.reason) errors[`m${m.slot}.reason`] = 'Say briefly why you chose them.';
    else if (m.reason.length > C.reasonMax) errors[`m${m.slot}.reason`] = `Keep this under ${C.reasonMax} characters.`;
  }
  if (Object.keys(errors).length) throw new LeaderError('Some details are missing.', errors);

  // look everyone up: Discord membership and Mojang
  const lookups = [];
  const discordOf = async (name, field) => {
    try {
      const hit = await services.findMember(name);
      if (!hit) errors[field] = `"${name}" isn't a member of our Discord server. Check it's their username (not their display name) and that they've joined.`;
      return hit;
    } catch (e) { errors[field] = "We couldn't check this Discord username just now. Please try again in a minute."; return null; }
  };
  const mcOf = async (name, field) => {
    try {
      const acc = await services.javaAccount(name);
      if (!acc) errors[field] = `"${name}" isn't a Minecraft Java account we can find. Check the spelling.`;
      return acc;
    } catch (e) { errors[field] = "We couldn't check this Minecraft username just now. Please try again in a minute."; return null; }
  };
  const meDiscord = errors['self.discord'] ? null : await discordOf(me.discord, 'self.discord');
  const meMc = await mcOf(me.mc, 'self.mc');
  for (const m of want) {
    if (locked.has(m.slot)) { const r = keep.find(x => x.slot === m.slot && x.status === 'confirmed'); lookups.push({ ...m, d: { id: r.discord_id, username: r.discord_name }, a: { name: r.mc_name, uuid: r.mc_uuid }, locked: true }); continue; }
    lookups.push({ ...m, d: await discordOf(m.discord, `m${m.slot}.discord`), a: await mcOf(m.mc, `m${m.slot}.mc`) });
  }
  if (meDiscord && meDiscord.id !== user.id) errors['self.discord'] = `That isn't the Discord account you're signed in with (${user.username}).`;

  // nobody twice in this team
  const seenD = new Map([[user.id, 'self']]), seenM = new Map(meMc ? [[meMc.uuid, 'self']] : []);
  for (const m of lookups) {
    if (m.d) {
      if (seenD.has(m.d.id)) errors[`m${m.slot}.discord`] = seenD.get(m.d.id) === 'self' ? "You can't name yourself; you're the Leader." : `${m.d.username} is already in your team.`;
      else seenD.set(m.d.id, m.slot);
    }
    if (m.a) {
      if (seenM.has(m.a.uuid)) errors[`m${m.slot}.mc`] = seenM.get(m.a.uuid) === 'self' ? "That's your own Minecraft account." : `${m.a.name} is already in your team.`;
      else seenM.set(m.a.uuid, m.slot);
    }
  }
  if (Object.keys(errors).length) throw new LeaderError('Please fix the highlighted names.', errors);

  const invited = [], released = [];
  const appId = await teamLock(async c => {
    // nobody on another team (as Leader or teammate), checked under the lock
    const others = (await c.query(
      `SELECT a.discord_id AS d, a.mc_uuid AS u, a.discord_name AS lead, 'leader' AS role FROM leader_applications a WHERE a.stage IN ${ACTIVE} AND a.discord_id <> $1
       UNION ALL
       SELECT t.discord_id, t.mc_uuid, a.discord_name, 'member' FROM leader_team t JOIN leader_applications a ON a.id = t.app_id
       WHERE t.status IN ('pending', 'confirmed') AND a.stage IN ${ACTIVE} AND a.discord_id <> $1`, [user.id])).rows;
    const takenD = new Map(others.map(o => [o.d, o])), takenM = new Map(others.map(o => [o.u, o]));
    const clash = o => o.role === 'leader' ? `is already applying as a Leader` : `is already in ${o.lead}'s leadership team`;
    if (takenD.has(user.id)) errors['self.discord'] = `You ${takenD.get(user.id).role === 'member' ? `are already in ${takenD.get(user.id).lead}'s leadership team` : 'already have an application'}. A person can only be on one team.`;
    if (meMc && takenM.has(meMc.uuid)) errors['self.mc'] = `${meMc.name} ${clash(takenM.get(meMc.uuid))}. A person can only be on one team.`;
    for (const m of lookups) {
      if (m.locked) continue;
      if (m.d && takenD.has(m.d.id)) errors[`m${m.slot}.discord`] = `${m.d.username} ${clash(takenD.get(m.d.id))}. A person can only be on one team.`;
      if (m.a && takenM.has(m.a.uuid)) errors[`m${m.slot}.mc`] = `${m.a.name} ${clash(takenM.get(m.a.uuid))}. A person can only be on one team.`;
    }
    if (Object.keys(errors).length) throw new LeaderError('Please fix the highlighted names.', errors);

    let app = (await c.query(`SELECT * FROM leader_applications WHERE discord_id = $1 FOR UPDATE`, [user.id])).rows[0];
    if (app && app.stage === 'ended') {
      await c.query(`DELETE FROM leader_applications WHERE id = $1`, [app.id]);
      app = null;
    }
    if (!app) {
      app = (await c.query(`INSERT INTO leader_applications (discord_id, discord_name, mc_name, mc_uuid) VALUES ($1, $2, $3, $4) RETURNING *`,
        [user.id, user.username, meMc.name, meMc.uuid])).rows[0];
    } else {
      await c.query(`UPDATE leader_applications SET discord_name = $2, mc_name = $3, mc_uuid = $4, updated_at = NOW() WHERE id = $1`, [app.id, user.username, meMc.name, meMc.uuid]);
    }
    const rows = await teamOf(app.id, c);
    for (const m of lookups) {
      if (m.locked) continue;
      const live = rows.find(r => r.slot === m.slot && r.status === 'pending');
      if (live && live.discord_id === m.d.id && live.mc_uuid === m.a.uuid) {
        await c.query(`UPDATE leader_team SET reason = $2 WHERE id = $1`, [live.id, m.reason]);
        continue;
      }
      if (live) { await c.query(`UPDATE leader_team SET status = 'released', responded_at = NOW() WHERE id = $1`, [live.id]); released.push(live); }
      const row = (await c.query(
        `INSERT INTO leader_team (app_id, slot, discord_id, discord_name, mc_name, mc_uuid, reason) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [app.id, m.slot, m.d.id, m.d.username, m.a.name, m.a.uuid, m.reason])).rows[0];
      invited.push({ id: row.id, discord_id: m.d.id, mc_name: m.a.name });
    }
    return app.id;
  });
  for (const r of released) await services.dm(r.discord_id, `${user.username} has changed their Great War leadership team and you're no longer named in it. You're free to join another team or apply yourself.`);
  for (const i of invited) {
    const ok = await services.dm(i.discord_id,
      `**${user.username}** has named you in their leadership team for **The Great War**, playing as **${i.mc_name}**.\n`
      + `Sign in at ${SITE}/leaders to confirm or decline before applications close on ${closesText()}. Their application only counts if all four teammates confirm.`);
    await db.query(`UPDATE leader_team SET dm_sent = $2 WHERE id = $1`, [i.id, ok]);
  }
  return mine(user);
}

/* ---------------------------------------------------------------- teammates confirm or decline */
async function invitations(discordId) {
  await ready;
  return (await db.query(
    `SELECT t.id, t.slot, t.mc_name, t.status, a.discord_name AS leader, a.stage
     FROM leader_team t JOIN leader_applications a ON a.id = t.app_id
     WHERE t.discord_id = $1 AND t.status IN ('pending', 'confirmed') AND a.stage IN ${ACTIVE} ORDER BY t.invited_at`, [discordId])).rows;
}

async function respond(user, rowId, accept, agreed) {
  if (!isOpen()) throw new LeaderError('Leader applications are closed, so invitations can no longer be answered.');
  if (accept && !agreed) throw new LeaderError('Tick the box to confirm your Minecraft username and that you want to join.');
  const out = await teamLock(async c => {
    const r = (await c.query(
      `SELECT t.*, a.discord_id AS leader_id, a.discord_name AS leader, a.stage FROM leader_team t JOIN leader_applications a ON a.id = t.app_id
       WHERE t.id = $1 AND t.discord_id = $2 FOR UPDATE OF t`, [rowId, user.id])).rows[0];
    if (!r || r.status !== 'pending' || !['draft', 'submitted'].includes(r.stage)) throw new LeaderError('This invitation is no longer open.');
    if (accept) {
      // they may have joined another team since being named
      const other = (await c.query(
        `SELECT a.discord_name FROM leader_team t JOIN leader_applications a ON a.id = t.app_id
         WHERE t.discord_id = $1 AND t.status = 'confirmed' AND a.stage IN ${ACTIVE} AND t.id <> $2
         UNION ALL SELECT discord_name FROM leader_applications WHERE discord_id = $1 AND stage IN ${ACTIVE}`, [user.id, rowId])).rows[0];
      if (other) throw new LeaderError(`You're already in ${other.discord_name}'s team. A person can only be on one team.`);
    }
    await c.query(`UPDATE leader_team SET status = $2, responded_at = NOW() WHERE id = $1`, [rowId, accept ? 'confirmed' : 'declined']);
    // confirming one team releases any other pending invitations
    const freed = accept ? (await c.query(
      `UPDATE leader_team t SET status = 'declined', responded_at = NOW() FROM leader_applications a
       WHERE a.id = t.app_id AND t.discord_id = $1 AND t.status = 'pending' AND t.id <> $2 RETURNING a.discord_id AS leader_id`, [user.id, rowId])).rows : [];
    const team = currentTeam(await teamOf(r.app_id, c));
    return { r, freed, nowComplete: accept && complete(team), submitted: r.stage === 'submitted' };
  });
  const { r } = out;
  if (accept) {
    await services.dm(r.leader_id, `**${user.username}** (${r.mc_name}) confirmed they're in your Great War leadership team.`
      + (out.nowComplete ? (out.submitted ? ' All four have confirmed, so your application is complete and goes to staff for review.' : ' All four have confirmed. Submit your application before ' + closesText() + '.') : ''));
    for (const f of out.freed) await services.dm(f.leader_id, `**${user.username}** has joined another leadership team, so they've declined your invitation. Name someone else at ${SITE}/leaders.`);
  } else {
    await services.dm(r.leader_id, `**${user.username}** declined your invitation to your Great War leadership team. Name someone else in their place at ${SITE}/leaders before ${closesText()}.`);
  }
  return { ok: true };
}

/* ---------------------------------------------------------------- step 2: the application */
const COMMITMENTS = 8;      // the boxes on the form (leaders.js on the page holds their text)
const SCENARIOS = ['a', 'b', 'c', 'd'];
function parseYouTube(url) {
  const s = String(url || '').trim();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#].*)?$/);
  return m ? m[1] : null;
}
function validTimezone(tz) {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch (e) { return false; }
}

async function submit(user, f) {
  if (!isOpen()) throw new LeaderError('Leader applications are closed.');
  await ready;
  const app = (await db.query(`SELECT * FROM leader_applications WHERE discord_id = $1`, [user.id])).rows[0];
  if (!app || app.stage === 'ended') throw new LeaderError('Name your leadership team first (step 1).');
  if (!['draft', 'submitted'].includes(app.stage)) throw new LeaderError('Your application is with staff and can no longer be changed.');
  const errors = {};
  const prefs = Array.isArray(f.nation_prefs) ? f.nation_prefs.map(String) : [];
  if (prefs.length !== C.nations.length || new Set(prefs).size !== C.nations.length || !prefs.every(k => NATION[k])) errors.nation_prefs = `Rank all ${C.nations.length} nations, each once.`;
  if (!f.timezone || !validTimezone(f.timezone)) errors.timezone = 'Choose your timezone.';
  if (f.attend_brief !== 'yes' || f.attend_sessions !== 'yes') errors.availability = 'unavailable';
  const exp = String(f.experience || '').trim();
  if (exp.length < 40) errors.experience = 'Tell us where you led, how many people, and what happened (at least a few sentences).';
  else if (exp.length > C.experienceMax) errors.experience = `Keep this under ${C.experienceMax} characters.`;
  const refServer = String(f.ref_server || '').trim(), refPerson = String(f.ref_person || '').trim();
  if (!refServer) errors.ref_server = 'Name the server or community.';
  if (!refPerson) errors.ref_person = 'Name someone there who can vouch for you, and how to reach them.';
  const answers = {};
  for (const k of SCENARIOS) {
    const v = String((f.answers || {})[k] || '').trim();
    if (v.length < 20) errors['answers.' + k] = 'Answer this question.';
    else if (v.length > C.scenarioMax) errors['answers.' + k] = `Keep this under ${C.scenarioMax} characters.`;
    answers[k] = v;
  }
  const plan = String(f.plan || '').trim();
  if (plan.length < 40) errors.plan = "Describe your nation's first week.";
  else if (plan.length > C.planMax) errors.plan = `Keep this under ${C.planMax} characters.`;
  let youtubeId = null;
  if (f.voice_kind === 'youtube') {
    youtubeId = parseYouTube(f.youtube_url);
    if (!youtubeId) errors.voice = 'Paste a YouTube link (an unlisted video is fine).';
    else if (!(await services.youtubeExists(youtubeId))) errors.voice = "We can't open that video. Check the link, and make sure it's unlisted or public, not private.";
  } else if (f.voice_kind === 'recording') {
    const rec = (await db.query(`SELECT seconds FROM leader_recordings WHERE app_id = $1`, [app.id])).rows[0];
    if (!rec) errors.voice = 'Record your pitch and upload it, or paste a YouTube link.';
  } else errors.voice = 'A voice pitch is required: record it here or paste a YouTube link.';
  const agree = Array.isArray(f.agree) ? f.agree.map(Number) : [];
  for (let i = 1; i <= COMMITMENTS; i++) if (!agree.includes(i)) { errors.agree = 'Tick every commitment.'; break; }
  if (errors.availability) throw new LeaderError('unavailable', errors);
  if (Object.keys(errors).length) throw new LeaderError('Please fix the highlighted answers.', errors);
  await db.query(
    `UPDATE leader_applications SET nation_prefs = $2, timezone = $3, experience = $4, ref_server = $5, ref_person = $6, answers = $7, plan = $8,
       voice_kind = $9, youtube_id = $10, agreed_at = NOW(), submitted_at = COALESCE(submitted_at, NOW()), stage = 'submitted', updated_at = NOW()
     WHERE id = $1`,
    [app.id, JSON.stringify(prefs), f.timezone, exp, refServer, refPerson, JSON.stringify(answers), plan, f.voice_kind, youtubeId]);
  if (f.voice_kind === 'youtube') await db.query(`DELETE FROM leader_recordings WHERE app_id = $1`, [app.id]);
  return mine(user);
}

// "No" to the brief or the sessions: the application ends and the team is released
async function end(user, reason) {
  const out = await teamLock(async c => {
    const app = (await c.query(`SELECT * FROM leader_applications WHERE discord_id = $1 FOR UPDATE`, [user.id])).rows[0];
    if (!app || !['draft', 'submitted'].includes(app.stage)) throw new LeaderError('There is no open application to end.');
    await c.query(`UPDATE leader_applications SET stage = 'ended', ended_reason = $2, updated_at = NOW() WHERE id = $1`, [app.id, reason]);
    return (await c.query(`UPDATE leader_team SET status = 'released', responded_at = NOW() WHERE app_id = $1 AND status IN ('pending', 'confirmed') RETURNING discord_id`, [app.id])).rows;
  });
  for (const m of out) await services.dm(m.discord_id, `${user.username} has withdrawn their Great War leader application, so you're no longer in their leadership team. You're free to join another team, apply yourself, or play in the event.`);
  return { ok: true };
}

/* ---------------------------------------------------------------- the voice recording */
async function saveRecording(user, buf, mime, seconds) {
  if (!isOpen()) throw new LeaderError('Leader applications are closed.');
  await ready;
  const app = (await db.query(`SELECT id, stage FROM leader_applications WHERE discord_id = $1`, [user.id])).rows[0];
  if (!app || !['draft', 'submitted'].includes(app.stage)) throw new LeaderError('Name your leadership team first (step 1).');
  if (!/^(audio|video)\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)(;.*)?$/.test(mime || '')) throw new LeaderError('That recording format is not supported.');
  if (!buf || !buf.length) throw new LeaderError('The recording is empty.');
  if (buf.length > C.recording.maxBytes) throw new LeaderError('The recording is too large.');
  const s = Number(seconds);
  if (!(s >= C.recording.minSeconds)) throw new LeaderError(`Your pitch should be 2 to 3 minutes. This one is under ${Math.round(C.recording.minSeconds / 60)} minute.`);
  if (s > C.recording.maxSeconds + 2) throw new LeaderError('Recordings can be at most 5 minutes.');
  await db.query(
    `INSERT INTO leader_recordings (app_id, mime, seconds, size, data) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (app_id) DO UPDATE SET mime = EXCLUDED.mime, seconds = EXCLUDED.seconds, size = EXCLUDED.size, data = EXCLUDED.data, uploaded_at = NOW()`,
    [app.id, mime, s, buf.length, buf]);
  return { ok: true, seconds: s };
}
async function recording(appId) {
  await ready;
  return (await db.query(`SELECT mime, size, data FROM leader_recordings WHERE app_id = $1`, [appId])).rows[0] || null;
}
// the applicant's own recording, for playback before they submit
async function myRecording(discordId) {
  await ready;
  return (await db.query(`SELECT r.mime, r.size, r.data FROM leader_recordings r JOIN leader_applications a ON a.id = r.app_id WHERE a.discord_id = $1`, [discordId])).rows[0] || null;
}

/* ---------------------------------------------------------------- what the applicant sees */
// their own application only: no scores, notes or other applicants
async function mine(user) {
  await ready;
  const app = (await db.query(`SELECT ${APP_COLS} FROM leader_applications a WHERE a.discord_id = $1`, [user.id])).rows[0] || null;
  const inv = await invitations(user.id);
  if (!app) return { app: null, invitations: inv };
  const team = currentTeam(await teamOf(app.id));
  const rec = (await db.query(`SELECT seconds, size, extract(epoch from uploaded_at)::bigint AS at FROM leader_recordings WHERE app_id = $1`, [app.id])).rows[0];
  const out = {
    status: statusLabel(app, team), stage: app.stage, complete: complete(team),
    me: { discord: app.discord_name, mc: app.mc_name },
    team: team.map(m => ({ slot: m.slot, status: m.status, discord: m.discord_name || null, mc: m.mc_name || null, reason: m.reason || '' })),
    form: app.stage === 'ended' ? null : {
      nation_prefs: app.nation_prefs, timezone: app.timezone, experience: app.experience, ref_server: app.ref_server, ref_person: app.ref_person,
      answers: app.answers, plan: app.plan, voice_kind: app.voice_kind, youtube_url: app.youtube_id ? 'https://youtu.be/' + app.youtube_id : '',
      submitted_at: app.submitted_ts ? Number(app.submitted_ts) : null,
    },
    recording: rec ? { seconds: rec.seconds, at: Number(rec.at) } : null,
    accepted_nation: app.stage === 'accepted' ? { key: app.accepted_nation, name: nationName(app.accepted_nation) } : null,
    discord_deadline: app.deadline_ts ? Number(app.deadline_ts) : null,
  };
  if (app.stage === 'accepted') out.cabinet = await cabinet(app);
  return { app: out, invitations: inv };
}

// the public part: the timeline and the nations
function publicInfo() {
  return {
    closesAt: C.closesAt, briefDate: C.briefDate, briefAt: C.briefAt, decideBy: C.decideBy, decideByLabel: C.decideByLabel,
    discordSetupDays: C.discordSetupDays, cabinetOpensAt: C.cabinetOpensAt, open: isOpen(), teamSize: C.teamSize, seats: C.seats,
    nations: C.nations.map(n => ({ key: n.key, name: n.name })),
    limits: { scenario: C.scenarioMax, plan: C.planMax, experience: C.experienceMax, reason: C.reasonMax },
    recording: { min: C.recording.minSeconds, max: C.recording.maxSeconds, maxBytes: C.recording.maxBytes },
    keepDaysAfterEvent: C.keepDaysAfterEvent,
  };
}

/* ---------------------------------------------------------------- staff review */
const SCORE_KEYS = ['communication', 'judgement', 'availability', 'experience', 'attitude'];
async function list({ nation, rank, status } = {}) {
  await ready;
  let hiddenIncomplete = 0;
  const apps = (await db.query(`SELECT ${APP_COLS} FROM leader_applications a WHERE a.stage <> 'ended' ORDER BY a.submitted_at NULLS LAST, a.id`)).rows;
  const teams = (await db.query(`SELECT app_id, status, slot, id FROM leader_team WHERE status IN ('pending', 'confirmed', 'declined')`)).rows;
  const scores = (await db.query(`SELECT * FROM leader_scores`)).rows;
  const out = [];
  for (const a of apps) {
    const team = currentTeam(teams.filter(t => t.app_id === a.id));
    const label = statusLabel(a, team);
    const prefs = a.nation_prefs || [];
    if (nation) {
      const pos = prefs.indexOf(nation);
      if (pos < 0 || pos >= (+rank || 1)) continue;
    }
    const st = (a.stage === 'submitted' && !complete(team)) || a.stage === 'draft' ? 'incomplete' : a.stage;
    if (status ? status !== st : st === 'incomplete') { if (!status && st === 'incomplete') hiddenIncomplete++; continue; }
    const mine = scores.filter(s => s.app_id === a.id);
    out.push({
      id: a.id, discord_name: a.discord_name, mc_name: a.mc_name, status: label, stage: a.stage, complete: complete(team),
      confirmed: team.filter(m => m.status === 'confirmed').length, prefs, brief_attended: a.brief_attended,
      submitted_at: a.submitted_ts ? Number(a.submitted_ts) : null, voice_kind: a.voice_kind, accepted_nation: a.accepted_nation,
      reviews: mine.length, average: averages(mine).overall,
    });
  }
  out.hiddenIncomplete = hiddenIncomplete;
  return out;
}
function averages(rows) {
  const out = {};
  for (const k of SCORE_KEYS) {
    const v = rows.map(r => r[k]).filter(x => x);
    out[k] = v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length * 10) / 10 : null;
  }
  const all = SCORE_KEYS.map(k => out[k]).filter(x => x !== null);
  out.overall = all.length ? Math.round(all.reduce((s, x) => s + x, 0) / all.length * 10) / 10 : null;
  return out;
}
async function detail(appId, reviewerId) {
  await ready;
  const a = (await db.query(`SELECT ${APP_COLS} FROM leader_applications a WHERE a.id = $1`, [appId])).rows[0];
  if (!a) return null;
  const allRows = (await db.query(
    `SELECT slot, discord_id, discord_name, mc_name, reason, status, extract(epoch from invited_at)::bigint AS invited_ts, extract(epoch from responded_at)::bigint AS responded_ts
     FROM leader_team WHERE app_id = $1 ORDER BY slot, id`, [appId])).rows;
  const team = currentTeam(allRows.filter(r => r.status !== 'released'));
  const scores = (await db.query(`SELECT * FROM leader_scores WHERE app_id = $1 ORDER BY updated_at`, [appId])).rows;
  const rec = (await db.query(`SELECT mime, seconds, size FROM leader_recordings WHERE app_id = $1`, [appId])).rows[0] || null;
  const my = scores.find(s => s.reviewer_id === reviewerId) || null;
  const taken = (await db.query(`SELECT accepted_nation, discord_name FROM leader_applications WHERE stage = 'accepted' AND id <> $1`, [appId])).rows;
  return {
    app: { ...a, submitted_at: a.submitted_ts ? Number(a.submitted_ts) : null, decided_at: a.decided_ts ? Number(a.decided_ts) : null },
    status: statusLabel(a, team), complete: complete(team), team, history: allRows.filter(r => r.status === 'declined' || r.status === 'released'),
    recording: rec, my, scored: !!my,
    // each reviewer scores on their own: the averages and other reviewers' scores show once you've scored
    averages: my ? averages(scores) : null, reviews: my ? scores : null, reviewCount: scores.length,
    takenNations: Object.fromEntries(taken.map(t => [t.accepted_nation, t.discord_name])),
    cabinet: a.stage === 'accepted' ? await cabinet(a) : null,
  };
}
async function score(appId, reviewer, f) {
  await ready;
  const vals = SCORE_KEYS.map(k => { const v = parseInt(f[k], 10); return v >= 1 && v <= 5 ? v : null; });
  if (vals.some(v => v === null)) throw new LeaderError('Score every heading from 1 to 5.');
  await db.query(
    `INSERT INTO leader_scores (app_id, reviewer_id, reviewer_name, communication, judgement, availability, experience, attitude, notes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (app_id, reviewer_id) DO UPDATE SET reviewer_name = EXCLUDED.reviewer_name, communication = EXCLUDED.communication, judgement = EXCLUDED.judgement,
       availability = EXCLUDED.availability, experience = EXCLUDED.experience, attitude = EXCLUDED.attitude, notes = EXCLUDED.notes, updated_at = NOW()`,
    [appId, reviewer.id, reviewer.username, ...vals, String(f.notes || '').trim().slice(0, 4000)]);
}

async function staffState(appId) {
  const a = (await db.query(`SELECT * FROM leader_applications WHERE id = $1`, [appId])).rows[0];
  if (!a) throw new LeaderError('No such application.');
  return { a, team: currentTeam(await teamOf(appId)) };
}
async function shortlist(appId, on) {
  const { a, team } = await staffState(appId);
  if (on) {
    if (a.stage !== 'submitted' || !complete(team)) throw new LeaderError('Only complete, submitted applications can be shortlisted.');
    await db.query(`UPDATE leader_applications SET stage = 'shortlisted', updated_at = NOW() WHERE id = $1`, [appId]);
  } else if (a.stage === 'shortlisted') {
    await db.query(`UPDATE leader_applications SET stage = 'submitted', updated_at = NOW() WHERE id = $1`, [appId]);
  }
}
async function briefAttendance(appId, attended) {
  const { a, team } = await staffState(appId);
  if (!complete(team) || !['submitted', 'shortlisted', 'attended'].includes(a.stage)) throw new LeaderError('Brief attendance is only recorded for complete applications under review.');
  const stage = attended ? 'attended' : (a.stage === 'attended' ? 'shortlisted' : a.stage);
  await db.query(`UPDATE leader_applications SET brief_attended = $2, stage = $3, updated_at = NOW() WHERE id = $1`, [appId, !!attended, stage]);
}

async function accept(appId, nationKey, staff) {
  if (!NATION[nationKey]) throw new LeaderError('Choose a nation.');
  const { a, team, taken } = await teamLock(async c => {
    const a = (await c.query(`SELECT * FROM leader_applications WHERE id = $1 FOR UPDATE`, [appId])).rows[0];
    if (!a) throw new LeaderError('No such application.');
    const team = currentTeam(await teamOf(appId, c));
    if (a.stage === 'accepted') throw new LeaderError('Already accepted.');
    if (!complete(team)) throw new LeaderError('All four teammates must have confirmed.');
    if (!a.brief_attended || a.stage !== 'attended') throw new LeaderError('Only applicants who attended the leader brief can be accepted.');
    const taken = (await c.query(`SELECT discord_name FROM leader_applications WHERE stage = 'accepted' AND accepted_nation = $1`, [nationKey])).rows[0];
    if (taken) throw new LeaderError(`${nationName(nationKey)} already has a Leader (${taken.discord_name}).`);
    const deadline = now() + C.discordSetupDays * 86400;
    await c.query(`UPDATE leader_applications SET stage = 'accepted', accepted_nation = $2, decided_at = NOW(), decided_by = $3, discord_deadline = to_timestamp($4), updated_at = NOW() WHERE id = $1`,
      [appId, nationKey, staff.username, deadline]);
    // the cabinet starts with the team, in slot order
    await c.query(`DELETE FROM leader_cabinet WHERE app_id = $1`, [appId]);
    let pos = 1;
    for (const m of team) {
      await c.query(`INSERT INTO leader_cabinet (app_id, position, discord_id, discord_name, mc_name, mc_uuid, source) VALUES ($1, $2, $3, $4, $5, $6, 'team')`,
        [appId, pos++, m.discord_id, m.discord_name, m.mc_name, m.mc_uuid]);
    }
    return { a: { ...a, discord_deadline: deadline }, team, taken: null };
  });
  // roles: the Leader gets the Leader role and the nation role; the team the nation role and Leadership
  const n = NATION[nationKey];
  const results = [];
  const give = async (who, id, roleId, what) => {
    if (!roleId) { results.push({ who, role: what, ok: false, note: 'role ID not set in leaders.config.js' }); return; }
    let ok = false;
    try { ok = await services.addRole(id, roleId); } catch (e) { ok = false; }
    results.push({ who, role: what, ok });
  };
  await give(a.discord_name, a.discord_id, C.roles.leader, 'Leader');
  await give(a.discord_name, a.discord_id, n.roleId, n.name);
  for (const m of team) {
    await give(m.discord_name, m.discord_id, n.roleId, n.name);
    await give(m.discord_name, m.discord_id, C.roles.leadership, 'Leadership');
  }
  await db.query(`UPDATE leader_applications SET roles_result = $2 WHERE id = $1`, [appId, JSON.stringify(results)]);
  const deadline = a.discord_deadline;
  await services.dm(a.discord_id,
    `Congratulations: you've been chosen as **Leader of ${n.name}** for The Great War.\n`
    + `You have until ${when(deadline)} to set up ${n.name}'s Discord server to staff standards and invite the CUE bot. `
    + `Your team (${team.map(m => m.discord_name).join(', ')}) hold your first four cabinet seats; from ${when(C.cabinetOpensAt)} you can fill the other four and set your succession at ${SITE}/leaders.`);
  for (const m of team) {
    await services.dm(m.discord_id, `**${a.discord_name}** has been chosen as **Leader of ${n.name}** for The Great War, and you're in their leadership team, holding a cabinet seat. `
      + `${a.discord_name} has until ${when(deadline)} to set up the nation's Discord server.`);
  }
  return { results };
}
async function decline(appId, staff) {
  const { a, team } = await staffState(appId);
  if (a.stage === 'accepted' || a.stage === 'declined' || a.stage === 'ended') throw new LeaderError('This application has already been decided.');
  await db.query(`UPDATE leader_applications SET stage = 'declined', decided_at = NOW(), decided_by = $2, updated_at = NOW() WHERE id = $1`, [appId, staff.username]);
  const playerLine = `You're very welcome to apply as a player instead: ${SITE}/apply`;
  await services.dm(a.discord_id, `Thank you for applying to lead a nation in The Great War. We had many strong applications and haven't chosen yours this time. ${playerLine}`);
  for (const m of team) if (m.discord_id && m.status !== 'declined') {
    await services.dm(m.discord_id, `${a.discord_name}'s leader application for The Great War wasn't chosen this time, so their leadership team won't go ahead. Thank you for standing with them. ${playerLine}`);
  }
}

/* ---------------------------------------------------------------- the cabinet */
async function cabinet(app) {
  const rows = (await db.query(`SELECT position, discord_id, discord_name, mc_name, mc_uuid, source FROM leader_cabinet WHERE app_id = $1 ORDER BY position`, [app.id])).rows;
  return { seats: rows, open: now() >= C.cabinetOpensAt, opensAt: C.cabinetOpensAt, size: C.seats };
}
async function acceptedApp(user) {
  const a = (await db.query(`SELECT * FROM leader_applications WHERE discord_id = $1 AND stage = 'accepted'`, [user.id])).rows[0];
  if (!a) throw new LeaderError('Only an accepted Leader has a cabinet.');
  return a;
}
// the Leader's assigned players: members of our server with their nation's role, not already seated. The
// Minecraft name is filled in where we already know it (a tester or leadership application).
async function assignedPlayers(user) {
  const a = await acceptedApp(user);
  const n = NATION[a.accepted_nation];
  if (!n.roleId) return { players: [], note: `The ${n.name} role isn't set up yet, so there are no assigned players to show.` };
  let members;
  try { members = await services.membersWithRole(n.roleId); } catch (e) { throw new LeaderError("We couldn't load your players from Discord just now. Please try again in a minute."); }
  const seated = new Set((await db.query(`SELECT discord_id FROM leader_cabinet WHERE app_id = $1`, [a.id])).rows.map(r => r.discord_id));
  const players = members.filter(m => m.id !== a.discord_id && !seated.has(m.id));
  const ids = players.map(p => p.id);
  const known = ids.length ? (await db.query(
    `SELECT DISTINCT ON (discord_id) discord_id, mc_name FROM (
       SELECT discord_id, mc_name, applied_at AS at FROM tester_applications WHERE discord_id = ANY($1)
       UNION ALL SELECT discord_id, mc_name, invited_at FROM leader_team WHERE discord_id = ANY($1)) k
     ORDER BY discord_id, at DESC`, [ids]).catch(() => ({ rows: [] }))).rows : [];
  const mc = Object.fromEntries(known.map(k => [k.discord_id, k.mc_name]));
  return { players: players.map(p => ({ discord_id: p.id, discord_name: p.username, mc_name: mc[p.id] || '' })), note: null };
}
async function cabinetAdd(user, discordId, mcName) {
  const a = await acceptedApp(user);
  if (now() < C.cabinetOpensAt) throw new LeaderError('The extra seats open after the Leaders are chosen.');
  const pick = (await assignedPlayers(user)).players.find(p => p.discord_id === discordId);
  if (!pick) throw new LeaderError("That player isn't one of your assigned players.");
  const name = cleanName(mcName) || pick.mc_name;
  if (!name) throw new LeaderError(`Enter ${pick.discord_name}'s Minecraft username.`);
  let acc;
  try { acc = await services.javaAccount(name); } catch (e) { throw new LeaderError("We couldn't check that Minecraft username just now. Please try again in a minute."); }
  if (!acc) throw new LeaderError(`${name} isn't a Minecraft Java account we can find.`);
  await teamLock(async c => {
    const n = (await c.query(`SELECT count(*)::int AS n FROM leader_cabinet WHERE app_id = $1`, [a.id])).rows[0].n;
    if (n >= C.seats) throw new LeaderError(`All ${C.seats} seats are filled.`);
    await c.query(`INSERT INTO leader_cabinet (app_id, position, discord_id, discord_name, mc_name, mc_uuid, source) VALUES ($1, $2, $3, $4, $5, $6, 'player')`,
      [a.id, n + 1, pick.discord_id, pick.discord_name, acc.name, acc.uuid]);
  });
}
async function cabinetRemove(user, discordId) {
  const a = await acceptedApp(user);
  await teamLock(async c => {
    const r = (await c.query(`DELETE FROM leader_cabinet WHERE app_id = $1 AND discord_id = $2 AND source = 'player' RETURNING position`, [a.id, discordId])).rows[0];
    if (!r) throw new LeaderError('Only the extra seats can be emptied; your team keeps theirs.');
    await renumber(c, a.id, (await c.query(`SELECT discord_id FROM leader_cabinet WHERE app_id = $1 ORDER BY position`, [a.id])).rows.map(x => x.discord_id));
  });
}
// succession: the order the seats are in (the game fills seats and succession in this order)
async function cabinetOrder(user, order) {
  const a = await acceptedApp(user);
  await teamLock(async c => {
    const have = (await c.query(`SELECT discord_id FROM leader_cabinet WHERE app_id = $1`, [a.id])).rows.map(r => r.discord_id);
    if (!Array.isArray(order) || order.length !== have.length || new Set(order).size !== have.length || !order.every(id => have.includes(id))) throw new LeaderError('Order every seat holder once.');
    await renumber(c, a.id, order);
  });
}
async function renumber(c, appId, order) {
  await c.query(`UPDATE leader_cabinet SET position = position + 100 WHERE app_id = $1`, [appId]);
  for (let i = 0; i < order.length; i++) await c.query(`UPDATE leader_cabinet SET position = $3 WHERE app_id = $1 AND discord_id = $2`, [appId, order[i], i + 1]);
}

/* ---------------------------------------------------------------- export to the game server */
// For each Leader: APPOINT_LEADER, then SET_SEATS with the seat holders in succession order
// (greatwar StaffActions). Everyone must already be a member of their nation in game.
async function exportToGame(by) {
  await ready;
  const leaders = (await db.query(`SELECT * FROM leader_applications WHERE stage = 'accepted' ORDER BY accepted_nation`)).rows;
  const results = [];
  for (const a of leaders) {
    const n = NATION[a.accepted_nation];
    const seats = (await db.query(`SELECT mc_name, mc_uuid FROM leader_cabinet WHERE app_id = $1 ORDER BY position`, [a.id])).rows;
    const lead = await services.gameAct({ system: 'staff', kind: 'APPOINT_LEADER', target: dashed(a.mc_uuid), nation: n.gameId });
    const set = lead.ok ? await services.gameAct({ system: 'staff', kind: 'SET_SEATS', nation: n.gameId, chain: seats.map(s => dashed(s.mc_uuid)) })
      : { ok: false, message: 'skipped: the Leader was not appointed' };
    results.push({ nation: n.name, gameId: n.gameId, leader: a.mc_name, seats: seats.map(s => s.mc_name), appoint: lead, seatsResult: set });
  }
  await db.query(`INSERT INTO leader_exports (by_name, results) VALUES ($1, $2)`, [by, JSON.stringify(results)]);
  return results;
}
async function exports() {
  await ready;
  return (await db.query(`SELECT id, extract(epoch from at)::bigint AS at, by_name, results FROM leader_exports ORDER BY at DESC LIMIT 10`)).rows.map(r => ({ ...r, at: Number(r.at) }));
}
// at event start, once
function startAutoExport() {
  if (!C.eventStartsAt) return;
  const check = async () => {
    try {
      if (now() < C.eventStartsAt) return;
      const done = (await db.query(`SELECT 1 FROM leader_exports WHERE by_name = 'event start' LIMIT 1`)).rows.length;
      if (!done) await exportToGame('event start');
    } catch (e) { console.error('[leaders] auto export', e.message); }
  };
  setInterval(check, 60 * 1000);
}

module.exports = {
  C, LeaderError, publicInfo, saveTeam, invitations, respond, submit, end, saveRecording, recording, myRecording, mine,
  list, detail, score, shortlist, briefAttendance, accept, decline, assignedPlayers, cabinetAdd, cabinetRemove, cabinetOrder,
  exportToGame, exports, startAutoExport, parseYouTube, statusLabel, SCORE_KEYS, NATION, ready,
};
