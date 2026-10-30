// Staff applications for The Great War.
//
// One form, three tracks (Event Staff, Operator, Event Creator): the applicant ticks one or more and ranks
// them. Everyone answers the common questions; each ticked track adds its own. The owner reviews them in
// the control centre and accepts or rejects each track on its own, with a reason that only staff see.
// Accepting gives the GW Staff role and the track's role and the bot sends the track and its rules;
// rejecting sends a short, polite message.
//
// Times are stored as timestamptz (UTC) and leave this module as Unix seconds. Bot messages use Discord
// timestamps (<t:...>) so each member reads them in their own timezone.
const db = require('../db');
const C = require('./staff-apply.config');
const { javaAccount } = require('./minecraft');

const GUILD_ID = '1449004906068312189';
const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_INVITE = 'https://discord.gg/tF5hWxaQQj';
const SITE = (() => { try { return new URL(process.env.REDIRECT_URI).origin; } catch (e) { return ''; } })();
const TRACK = Object.fromEntries(C.tracks.map(t => [t.key, t]));
const now = () => Math.floor(Date.now() / 1000);
const isOpen = () => now() <= C.closesAt;

// the Operator's tools, the Event Creator's crafts and tools (the page shows these labels)
const OP_TOOLS = [['luckperms', 'LuckPerms'], ['coreprotect', 'CoreProtect or rollbacks'], ['console', 'Console'], ['panel', 'Pterodactyl or similar']];
const CRAFTS = [['building', 'Building'], ['terraforming', 'Terraforming'], ['redstone', 'Redstone or commands'], ['lore', 'Lore and writing'], ['quests', 'Quests'], ['texturing', 'Texturing or modelling'], ['other', 'Other']];
const TOOLS = [['worldedit', 'WorldEdit'], ['voxelsniper', 'VoxelSniper'], ['worldpainter', 'WorldPainter'], ['axiom', 'Axiom'], ['blockbench', 'Blockbench'], ['other', 'Other']];
// the questions, worded once for the form and the review page
const QUESTIONS = {
  discord: 'Discord username',
  mc_name: 'Minecraft username',
  age: 'Age',
  timezone: 'Time zone',
  hours_weekdays: "Hours you're usually free on weekdays",
  hours_weekends: "Hours you're usually free at weekends",
  tracks: "Which tracks you're applying for, ranked",
  staff_experience: 'Past staff experience: server name, role, how long, and why you left. Include links if you have them.',
  played_before: 'Have you played a Collective event before?',
  played_detail: 'Which one, and with which nation?',
  why: 'Why do you want to be staff for The Great War?',
  combat_log: 'A player reports another player for combat logging, and the accused is your friend. What do you do, step by step?',
  toxic_chat: "Two nations' players are arguing in global chat and it's turning toxic. What do you do?",
  punished: 'Have you ever been banned or punished on any server?',
  punished_note: "Being honest here won't count against you. Lying will.",
  punished_detail: 'What happened?',
  agree: 'I agree to the rules of the track(s) I picked, and that all staff actions are logged.',
  es_understand: "Do you understand you'll get no advantage, and that you must pass anything involving your own nation to an Operator?",
  es_understand_why: 'In a sentence: why does that matter?',
  es_report: "You see a report showing an enemy nation is about to attack your nation's capital. What do you do with that?",
  es_hours: 'How many hours per week during the event can you spend moderating, not playing?',
  op_tools: 'Experience with server tools. Rate each 1 to 5 and give an example.',
  op_dupe: "A bug is duplicating items and a nation has already used it. Walk us through what you'd do.",
  op_shifts: 'Which event days and times can you commit to for shifts? Pick from the event schedule.',
  op_shifts_text: "Which event days and times can you commit to for shifts? The schedule isn't final yet, so tell us the days and times you could do.",
  op_known: "List anyone you know who's playing.",
  voice: 'Optional: a 1 to 2 minute voice note introducing yourself',
  cr_makes: 'What do you make?',
  cr_portfolio: 'Portfolio: screenshots, a video or a world download, at least 3 pieces. Upload or link.',
  cr_tools: 'Tools you use',
  cr_hours: 'Hours per week you can give before the event',
  cr_accept: "Do you accept that you can't lead a nation in an event you helped build, and that you play on a random nation?",
};

/* ---------------------------------------------------------------- outside services */
const botRest = (method, path, body) => fetch(DISCORD_API + path, {
  method,
  headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json', 'X-Audit-Log-Reason': 'Great War staff applications' },
  body: body ? JSON.stringify(body) : undefined,
  signal: AbortSignal.timeout(8000),
});
const services = {
  // true if they're in our server, false if not; throws if Discord can't be reached
  async isMember(discordId) {
    const r = await botRest('GET', `/guilds/${GUILD_ID}/members/${discordId}`);
    if (r.status === 404) return false;
    if (!r.ok) throw new Error('member lookup failed: ' + r.status);
    return true;
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
  // an existing YouTube video (public or unlisted); true if YouTube can't be reached, so an outage never blocks anyone
  async youtubeExists(id) {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { signal: AbortSignal.timeout(6000) });
      if (r.status === 401 || r.status === 403 || r.status === 404 || r.status === 400) return false;
      return true;
    } catch (e) { return true; }
  },
};

/* ---------------------------------------------------------------- tables */
const ready = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS staff_apps (
    id SERIAL PRIMARY KEY,
    discord_id TEXT NOT NULL UNIQUE,
    discord_name TEXT,
    mc_name TEXT NOT NULL,
    mc_uuid TEXT NOT NULL,
    age INT,
    timezone TEXT,
    hours_weekdays TEXT,
    hours_weekends TEXT,
    tracks JSONB NOT NULL,
    answers JSONB NOT NULL,
    voice_kind TEXT CHECK (voice_kind IN ('recording', 'youtube')),
    youtube_id TEXT,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'withdrawn')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  // one decision per track; the reason is for staff only
  await db.query(`CREATE TABLE IF NOT EXISTS staff_app_decisions (
    app_id INT NOT NULL REFERENCES staff_apps(id) ON DELETE CASCADE,
    track TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
    reason TEXT,
    decided_by TEXT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    roles_result JSONB,
    dm_sent BOOLEAN,
    PRIMARY KEY (app_id, track))`);
  // uploaded before the form is sent, so they belong to the person rather than the application
  await db.query(`CREATE TABLE IF NOT EXISTS staff_app_recordings (
    discord_id TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    seconds REAL,
    size INT NOT NULL,
    data BYTEA NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.query(`CREATE TABLE IF NOT EXISTS staff_app_files (
    id SERIAL PRIMARY KEY,
    discord_id TEXT NOT NULL,
    mime TEXT NOT NULL,
    name TEXT,
    size INT NOT NULL,
    data BYTEA NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.query(`CREATE INDEX IF NOT EXISTS staff_app_files_owner ON staff_app_files (discord_id)`);
})().catch(e => console.error('[staff-apply] setup', e.message));

/* ---------------------------------------------------------------- helpers */
class StaffAppError extends Error {
  constructor(message, fields) { super(message); this.fields = fields || null; }
}
const cleanName = s => String(s || '').trim().replace(/^@/, '');
const when = ts => `<t:${ts}:F> (<t:${ts}:R>)`;
const trackName = key => (TRACK[key] || {}).name || key;
const list = names => names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
function parseYouTube(url) {
  const s = String(url || '').trim();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#].*)?$/);
  return m ? m[1] : null;
}
function validTimezone(tz) {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch (e) { return false; }
}
function cleanUrl(u) {
  const s = String(u || '').trim();
  if (!s) return null;
  try {
    const x = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    return /^https?:$/.test(x.protocol) && x.hostname.includes('.') && s.length <= 500 ? x.href : false;
  } catch (e) { return false; }
}
// the image types we keep, recognised from the bytes themselves, never from what the browser says
function imageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/* ---------------------------------------------------------------- the form */
async function submit(user, f) {
  if (!isOpen()) throw new StaffAppError('Staff applications are closed.');
  await ready;
  const existing = (await db.query(`SELECT id, status FROM staff_apps WHERE discord_id = $1`, [user.id])).rows[0];
  if (existing && existing.status === 'submitted' && (await decisionsFor(existing.id)).length) throw new StaffAppError('Staff have started deciding on your application, so it can no longer be changed.');
  const L = C.limits, errors = {}, answers = {};
  const text = (key, min, max, msg, value = f[key]) => {
    const v = String(value == null ? '' : value).trim();
    if (v.length < min) errors[key] = msg;
    else if (v.length > max) errors[key] = `Keep this under ${max} characters.`;
    return v;
  };
  const yesNo = (key, msg) => {
    const v = f[key] === 'yes' ? 'yes' : f[key] === 'no' ? 'no' : '';
    if (!v) errors[key] = msg;
    return v;
  };
  const number = (key, min, max, msg) => {
    const v = Number(String(f[key] == null ? '' : f[key]).trim());
    if (String(f[key] == null ? '' : f[key]).trim() === '' || !Number.isInteger(v) || v < min || v > max) { errors[key] = msg; return null; }
    return v;
  };

  // who they are
  const mcName = cleanName(f.mc_name);
  if (!mcName) errors.mc_name = 'Enter your Minecraft username.';
  const age = number('age', 1, 120, 'Enter your age in years.');
  if (age !== null && age < C.minAge) errors.age = `You need to be ${C.minAge} or over to apply.`;
  if (!f.timezone || !validTimezone(f.timezone)) errors.timezone = 'Choose your timezone.';
  const hoursWeekdays = text('hours_weekdays', 2, L.hours, 'Say which hours you are usually free on weekdays.');
  const hoursWeekends = text('hours_weekends', 2, L.hours, 'Say which hours you are usually free at weekends.');

  // the tracks, in their order of preference
  const tracks = Array.isArray(f.tracks) ? f.tracks.map(String) : [];
  if (!tracks.length || new Set(tracks).size !== tracks.length || !tracks.every(k => TRACK[k])) errors.tracks = 'Tick at least one track.';
  const has = k => tracks.includes(k);

  // everyone
  answers.staff_experience = text('staff_experience', 2, L.long, 'Tell us about your past staff experience, or write "None".');
  answers.played_before = yesNo('played_before', 'Say whether you have played a Collective event before.');
  if (answers.played_before === 'yes') answers.played_detail = text('played_detail', 3, L.short, 'Which event, and with which nation?');
  answers.why = text('why', 20, L.answer, 'Tell us why you want to be staff for The Great War.');
  answers.combat_log = text('combat_log', 20, L.answer, 'Walk us through what you would do.');
  answers.toxic_chat = text('toxic_chat', 20, L.answer, 'Tell us what you would do.');
  answers.punished = yesNo('punished', 'Say whether you have ever been banned or punished on a server.');
  if (answers.punished === 'yes') answers.punished_detail = text('punished_detail', 10, L.answer, 'Tell us what happened.');
  if (f.agree !== true) errors.agree = 'Tick the box to agree to the rules of the tracks you picked.';

  // Event Staff
  if (has('event_staff')) {
    answers.es_understand = yesNo('es_understand', 'Answer yes or no.');
    if (answers.es_understand === 'no') errors.es_understand = 'Event Staff must accept this. Untick Event Staff if you can\'t.';
    answers.es_understand_why = text('es_understand_why', 10, L.short * 2, 'Add a sentence on why that matters.');
    answers.es_report = text('es_report', 20, L.answer, 'Tell us what you would do with that report.');
    answers.es_hours = number('es_hours', 0, 168, 'Enter a number of hours per week.');
  }

  // Operator
  if (has('operator')) {
    answers.op_tools = {};
    for (const [k] of OP_TOOLS) {
      const t = (f.op_tools || {})[k] || {};
      const rating = parseInt(t.rating, 10);
      const example = String(t.example || '').trim();
      if (!(rating >= 1 && rating <= 5)) errors['op_tools.' + k] = 'Rate this from 1 to 5.';
      else if (rating > 1 && example.length < 5) errors['op_tools.' + k] = 'Give an example of how you have used it.';
      else if (example.length > L.example) errors['op_tools.' + k] = `Keep this under ${L.example} characters.`;
      answers.op_tools[k] = { rating: rating || null, example };
    }
    answers.op_dupe = text('op_dupe', 20, L.answer, 'Walk us through what you would do.');
    if (C.schedule.length) {
      const picks = Array.isArray(f.op_shifts) ? [...new Set(f.op_shifts.map(Number))].filter(i => Number.isInteger(i) && C.schedule[i]) : [];
      if (!picks.length) errors.op_shifts = 'Pick at least one session you can commit to.';
      answers.op_shifts = picks.sort((a, b) => a - b).map(i => ({ startsAt: C.schedule[i].startsAt, minutes: C.schedule[i].minutes, label: C.schedule[i].label }));
    } else {
      answers.op_shifts_text = text('op_shifts_text', 5, L.answer, 'Tell us which event days and times you could commit to.');
    }
    answers.op_known = text('op_known', 2, L.answer, 'List anyone you know who is playing, or write "None".');
  }

  // Event Creator
  if (has('creator')) {
    const crafts = Array.isArray(f.cr_makes) ? f.cr_makes.map(String).filter(k => CRAFTS.some(c => c[0] === k)) : [];
    if (!crafts.length) errors.cr_makes = 'Tick what you make.';
    answers.cr_makes = [...new Set(crafts)];
    if (crafts.includes('other')) answers.cr_makes_other = text('cr_makes_other', 2, L.short, 'Say what else you make.');
    const tools = Array.isArray(f.cr_tools) ? f.cr_tools.map(String).filter(k => TOOLS.some(c => c[0] === k)) : [];
    if (!tools.length) errors.cr_tools = 'Tick the tools you use.';
    answers.cr_tools = [...new Set(tools)];
    if (tools.includes('other')) answers.cr_tools_other = text('cr_tools_other', 2, L.short, 'Say which other tools you use.');
    const links = [];
    for (const raw of (Array.isArray(f.cr_links) ? f.cr_links : []).slice(0, C.portfolio.maxLinks)) {
      const u = cleanUrl(raw);
      if (u === false) { errors.cr_portfolio = `"${String(raw).slice(0, 80)}" isn't a web link we can open. Links start with https://.`; break; }
      if (u && !links.includes(u)) links.push(u);
    }
    answers.cr_links = links;
    const files = (await db.query(`SELECT count(*)::int AS n FROM staff_app_files WHERE discord_id = $1`, [user.id])).rows[0].n;
    if (!errors.cr_portfolio && files + links.length < C.portfolio.minPieces) errors.cr_portfolio = `Add at least ${C.portfolio.minPieces} pieces: uploads and links together. You have ${files + links.length}.`;
    answers.cr_hours = number('cr_hours', 0, 168, 'Enter a number of hours per week.');
    answers.cr_accept = yesNo('cr_accept', 'Answer yes or no.');
    if (answers.cr_accept === 'no') errors.cr_accept = 'Event Creators must accept this. Untick Event Creator if you can\'t.';
  }

  // the Operator's voice note is optional
  let voiceKind = null, youtubeId = null;
  if (has('operator') && f.voice_kind === 'youtube' && String(f.youtube_url || '').trim()) {
    youtubeId = parseYouTube(f.youtube_url);
    if (!youtubeId) errors.voice = 'Paste a YouTube link (an unlisted video is fine), or leave it empty.';
    else if (!(await services.youtubeExists(youtubeId))) errors.voice = "We can't open that video. Check the link, and make sure it's unlisted or public, not private.";
    else voiceKind = 'youtube';
  } else if (has('operator') && f.voice_kind === 'recording') {
    const rec = (await db.query(`SELECT 1 FROM staff_app_recordings WHERE discord_id = $1`, [user.id])).rows[0];
    if (rec) voiceKind = 'recording';
  }

  if (Object.keys(errors).length) throw new StaffAppError('Please fix the highlighted answers.', errors);

  // they must be in our server: that's where the roles and the bot's messages are
  let member = true;
  try { member = await services.isMember(user.id); } catch (e) { member = true; }
  if (!member) throw new StaffAppError(`Join our Discord server first (${DISCORD_INVITE}). Staff roles and our messages to you go through it.`, { discord: 'You are not in our Discord server yet.' });
  let acc;
  try { acc = await services.javaAccount(mcName); } catch (e) { throw new StaffAppError("We couldn't check your Minecraft username just now. Please try again in a minute.", { mc_name: 'Try again in a minute.' }); }
  if (!acc) throw new StaffAppError('Please fix the highlighted answers.', { mc_name: `"${mcName}" isn't a Minecraft Java account we can find. Check the spelling.` });

  await db.query(
    `INSERT INTO staff_apps (discord_id, discord_name, mc_name, mc_uuid, age, timezone, hours_weekdays, hours_weekends, tracks, answers, voice_kind, youtube_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (discord_id) DO UPDATE SET discord_name = EXCLUDED.discord_name, mc_name = EXCLUDED.mc_name, mc_uuid = EXCLUDED.mc_uuid, age = EXCLUDED.age,
       timezone = EXCLUDED.timezone, hours_weekdays = EXCLUDED.hours_weekdays, hours_weekends = EXCLUDED.hours_weekends, tracks = EXCLUDED.tracks,
       answers = EXCLUDED.answers, voice_kind = EXCLUDED.voice_kind, youtube_id = EXCLUDED.youtube_id,
       submitted_at = CASE WHEN staff_apps.status = 'withdrawn' THEN NOW() ELSE staff_apps.submitted_at END, status = 'submitted', updated_at = NOW()`,
    [user.id, user.username, acc.name, acc.uuid, age, f.timezone, hoursWeekdays, hoursWeekends, JSON.stringify(tracks), JSON.stringify(answers), voiceKind, youtubeId]);
  // keep only what the application uses
  if (voiceKind !== 'recording') await db.query(`DELETE FROM staff_app_recordings WHERE discord_id = $1`, [user.id]);
  if (!has('creator')) await db.query(`DELETE FROM staff_app_files WHERE discord_id = $1`, [user.id]);
  return mine(user);
}

async function withdraw(user) {
  await ready;
  const app = (await db.query(`SELECT id, status FROM staff_apps WHERE discord_id = $1`, [user.id])).rows[0];
  if (!app || app.status !== 'submitted') throw new StaffAppError('There is no application to withdraw.');
  if ((await decisionsFor(app.id)).length) throw new StaffAppError('Staff have already decided on part of your application. Message a staff member in Discord instead.');
  await db.query(`UPDATE staff_apps SET status = 'withdrawn', updated_at = NOW() WHERE id = $1`, [app.id]);
  return mine(user);
}

/* ---------------------------------------------------------------- the voice note and the portfolio */
async function saveRecording(user, buf, mime, seconds) {
  if (!isOpen()) throw new StaffAppError('Staff applications are closed.');
  await ready;
  await notLocked(user);
  if (!/^(audio|video)\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)(;.*)?$/.test(mime || '')) throw new StaffAppError('That recording format is not supported.');
  if (!buf || !buf.length) throw new StaffAppError('The recording is empty.');
  if (buf.length > C.voiceNote.maxBytes) throw new StaffAppError('The recording is too large.');
  const s = Number(seconds);
  if (!(s >= C.voiceNote.minSeconds)) throw new StaffAppError('Your voice note should be 1 to 2 minutes long.');
  if (s > C.voiceNote.maxSeconds + 2) throw new StaffAppError(`Voice notes can be at most ${Math.floor(C.voiceNote.maxSeconds / 60)} and a half minutes.`);
  await db.query(
    `INSERT INTO staff_app_recordings (discord_id, mime, seconds, size, data) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (discord_id) DO UPDATE SET mime = EXCLUDED.mime, seconds = EXCLUDED.seconds, size = EXCLUDED.size, data = EXCLUDED.data, uploaded_at = NOW()`,
    [user.id, mime, s, buf.length, buf]);
  return { ok: true, seconds: s };
}
async function deleteRecording(user) {
  await ready;
  await notLocked(user);
  await db.query(`DELETE FROM staff_app_recordings WHERE discord_id = $1`, [user.id]);
  return { ok: true };
}
async function recordingOf(discordId) {
  await ready;
  return (await db.query(`SELECT mime, size, data FROM staff_app_recordings WHERE discord_id = $1`, [discordId])).rows[0] || null;
}

async function saveFile(user, buf, name) {
  if (!isOpen()) throw new StaffAppError('Staff applications are closed.');
  await ready;
  await notLocked(user);
  const mime = imageType(buf);
  if (!mime) throw new StaffAppError('Upload images only (PNG, JPEG, GIF or WebP). Put videos and world downloads in as links.');
  if (buf.length > C.portfolio.maxFileBytes) throw new StaffAppError(`Each image can be at most ${Math.round(C.portfolio.maxFileBytes / 1024 / 1024)} MB.`);
  const n = (await db.query(`SELECT count(*)::int AS n FROM staff_app_files WHERE discord_id = $1`, [user.id])).rows[0].n;
  if (n >= C.portfolio.maxFiles) throw new StaffAppError(`You can upload up to ${C.portfolio.maxFiles} images. Add more as links.`);
  await db.query(`INSERT INTO staff_app_files (discord_id, mime, name, size, data) VALUES ($1, $2, $3, $4, $5)`,
    [user.id, mime, String(name || 'image').replace(/[^\w .()-]+/g, '_').slice(0, 120), buf.length, buf]);
  return { files: await filesOf(user.id) };
}
async function deleteFile(user, id) {
  await ready;
  await notLocked(user);
  await db.query(`DELETE FROM staff_app_files WHERE id = $1 AND discord_id = $2`, [id, user.id]);
  return { files: await filesOf(user.id) };
}
async function filesOf(discordId) {
  return (await db.query(`SELECT id, name, size, mime FROM staff_app_files WHERE discord_id = $1 ORDER BY id`, [discordId])).rows;
}
async function file(id, discordId) {
  await ready;
  return (await db.query(`SELECT mime, size, data FROM staff_app_files WHERE id = $1 AND discord_id = $2`, [id, discordId])).rows[0] || null;
}
// uploads can't change once staff have started deciding
async function notLocked(user) {
  const app = (await db.query(`SELECT id, status FROM staff_apps WHERE discord_id = $1`, [user.id])).rows[0];
  if (app && app.status === 'submitted' && (await decisionsFor(app.id)).length) throw new StaffAppError('Staff have started deciding on your application, so it can no longer be changed.');
}

/* ---------------------------------------------------------------- what the applicant sees */
async function decisionsFor(appId) {
  return (await db.query(`SELECT track, decision, reason, decided_by, extract(epoch from decided_at)::bigint AS decided_ts, roles_result, dm_sent FROM staff_app_decisions WHERE app_id = $1`, [appId])).rows
    .map(d => ({ ...d, decided_ts: Number(d.decided_ts) }));
}
// per track: under review, accepted or not selected
function trackStates(app, decisions) {
  return app.tracks.map(k => {
    const d = decisions.find(x => x.track === k);
    return { key: k, name: trackName(k), state: d ? d.decision : 'review' };
  });
}
function statusLabel(app, states) {
  if (app.status === 'withdrawn') return 'Withdrawn';
  const got = states.filter(s => s.state === 'accepted').map(s => s.name);
  if (got.length) return 'Accepted as ' + list(got);
  if (states.every(s => s.state === 'rejected')) return 'Not selected';
  return 'Submitted';
}

// their own application only: never the reasons, who decided, or anyone else's
async function mine(user) {
  await ready;
  const app = (await db.query(`SELECT *, extract(epoch from submitted_at)::bigint AS submitted_ts FROM staff_apps WHERE discord_id = $1`, [user.id])).rows[0] || null;
  const rec = (await db.query(`SELECT seconds, extract(epoch from uploaded_at)::bigint AS at FROM staff_app_recordings WHERE discord_id = $1`, [user.id])).rows[0];
  const files = await filesOf(user.id);
  const uploads = { recording: rec ? { seconds: rec.seconds, at: Number(rec.at) } : null, files };
  if (!app) return { app: null, ...uploads };
  const decisions = app.status === 'submitted' ? await decisionsFor(app.id) : [];
  const states = trackStates(app, decisions);
  return {
    app: {
      status: statusLabel(app, states), withdrawn: app.status === 'withdrawn', locked: decisions.length > 0,
      submitted_at: Number(app.submitted_ts),
      tracks: states.map(s => ({ key: s.key, name: s.name, state: s.state })),
      form: {
        mc_name: app.mc_name, age: app.age, timezone: app.timezone, hours_weekdays: app.hours_weekdays, hours_weekends: app.hours_weekends,
        tracks: app.tracks, answers: app.answers, voice_kind: app.voice_kind, youtube_url: app.youtube_id ? 'https://youtu.be/' + app.youtube_id : '',
      },
    },
    ...uploads,
  };
}

// the public part: dates, the tracks and the limits
function publicInfo() {
  let briefDate = null;
  try { briefDate = require('./leaders.config').briefDate; } catch (e) { /* no leader applications */ }
  return {
    closesAt: C.closesAt, decideBy: C.decideBy, decideByLabel: C.decideByLabel, briefDate, open: isOpen(),
    tracks: C.tracks.map(t => ({ key: t.key, name: t.name, tagline: t.tagline, intro: t.intro, allowed: t.allowed, notAllowed: t.notAllowed, rules: t.rules })),
    schedule: C.schedule, minAge: C.minAge, limits: C.limits, voiceNote: C.voiceNote, portfolio: C.portfolio,
    questions: QUESTIONS, opTools: OP_TOOLS, crafts: CRAFTS, tools: TOOLS, keepDaysAfterEvent: C.keepDaysAfterEvent, discord: DISCORD_INVITE,
  };
}

/* ---------------------------------------------------------------- the review queue (control centre) */
const COLS = `a.*, extract(epoch from a.submitted_at)::bigint AS submitted_ts, extract(epoch from a.updated_at)::bigint AS updated_ts`;
// filters: track (applied for it), first (only as their first choice), status (of that track, or of the
// whole application when no track is chosen): review, accepted, rejected, withdrawn
async function queue({ track, first, status } = {}) {
  await ready;
  const apps = (await db.query(`SELECT ${COLS} FROM staff_apps a ORDER BY a.submitted_at, a.id`)).rows;
  const decisions = (await db.query(`SELECT app_id, track, decision FROM staff_app_decisions`)).rows;
  const out = [];
  for (const a of apps) {
    const states = trackStates(a, decisions.filter(d => d.app_id === a.id));
    if (track) {
      const pos = a.tracks.indexOf(track);
      if (pos < 0 || (first && pos !== 0)) continue;
    }
    const st = a.status === 'withdrawn' ? 'withdrawn' : track ? states.find(s => s.key === track).state
      : states.some(s => s.state === 'review') ? 'review' : states.some(s => s.state === 'accepted') ? 'accepted' : 'rejected';
    if (status ? status !== st : st === 'withdrawn') continue;
    out.push({
      id: a.id, discord_name: a.discord_name, mc_name: a.mc_name, age: a.age, timezone: a.timezone, withdrawn: a.status === 'withdrawn',
      tracks: states, status: statusLabel(a, states), submitted_at: Number(a.submitted_ts),
    });
  }
  return out;
}
async function counts() {
  await ready;
  const apps = (await db.query(`SELECT id, tracks, status FROM staff_apps`)).rows;
  const decisions = (await db.query(`SELECT app_id, track, decision FROM staff_app_decisions`)).rows;
  const out = Object.fromEntries(C.tracks.map(t => [t.key, { applied: 0, first: 0, review: 0, accepted: 0, rejected: 0 }]));
  for (const a of apps) {
    if (a.status === 'withdrawn') continue;
    a.tracks.forEach((k, i) => {
      if (!out[k]) return;
      const d = decisions.find(x => x.app_id === a.id && x.track === k);
      out[k].applied++; if (i === 0) out[k].first++;
      out[k][d ? d.decision : 'review']++;
    });
  }
  return out;
}

async function detail(appId) {
  await ready;
  const a = (await db.query(`SELECT ${COLS} FROM staff_apps a WHERE a.id = $1`, [appId])).rows[0];
  if (!a) return null;
  const decisions = await decisionsFor(appId);
  const rec = (await db.query(`SELECT mime, seconds, size FROM staff_app_recordings WHERE discord_id = $1`, [a.discord_id])).rows[0] || null;
  const files = await filesOf(a.discord_id);
  // other Great War applications that matter here: Operators can't play, Event Creators can't lead
  const conflicts = [];
  try {
    const lead = (await db.query(`SELECT stage, accepted_nation FROM leader_applications WHERE discord_id = $1 AND stage NOT IN ('ended', 'declined')`, [a.discord_id])).rows[0];
    if (lead) conflicts.push(`Has a leader application (${lead.stage}${lead.accepted_nation ? ', ' + lead.accepted_nation : ''}).`);
    const team = (await db.query(
      `SELECT l.discord_name, t.status FROM leader_team t JOIN leader_applications l ON l.id = t.app_id
       WHERE t.discord_id = $1 AND t.status IN ('pending', 'confirmed') AND l.stage NOT IN ('ended', 'declined')`, [a.discord_id])).rows;
    for (const t of team) conflicts.push(`Named in ${t.discord_name}'s leadership team (${t.status}).`);
  } catch (e) { /* the leader tables may not exist yet */ }
  return {
    app: { ...a, submitted_at: Number(a.submitted_ts), updated_at: Number(a.updated_ts) },
    states: trackStates(a, decisions), status: statusLabel(a, trackStates(a, decisions)),
    decisions: Object.fromEntries(decisions.map(d => [d.track, d])), recording: rec, files, conflicts,
  };
}
async function adminRecording(appId) {
  await ready;
  return (await db.query(`SELECT r.mime, r.size, r.data FROM staff_app_recordings r JOIN staff_apps a ON a.discord_id = r.discord_id WHERE a.id = $1`, [appId])).rows[0] || null;
}
async function adminFile(appId, fileId) {
  await ready;
  return (await db.query(`SELECT f.mime, f.size, f.data FROM staff_app_files f JOIN staff_apps a ON a.discord_id = f.discord_id WHERE a.id = $1 AND f.id = $2`, [appId, fileId])).rows[0] || null;
}

/* ---------------------------------------------------------------- decisions */
function acceptMessage(t) {
  const lines = [`Congratulations: you've been accepted as **${t.name}** for The Great War. ${t.tagline}.`, '', t.intro];
  if (t.allowed.length) lines.push('', '**Allowed:** ' + t.allowed.join('; ') + '.');
  if (t.notAllowed.length) lines.push('**Not allowed:** ' + t.notAllowed.join(', ') + '.');
  lines.push('', '**Rules**', ...t.rules.map(r => '- ' + r));
  lines.push('', `Your application is at ${SITE}/staff-apply. Staff will be in touch about what happens next.`);
  return lines.join('\n');
}

async function decide(appId, trackKey, accept, reason, by) {
  await ready;
  const t = TRACK[trackKey];
  if (!t) throw new StaffAppError('Choose a track.');
  reason = String(reason || '').trim().slice(0, 2000);
  if (!accept && !reason) throw new StaffAppError('Give a reason for rejecting (only staff see it).');
  const c = await db.connect();
  let a, others;
  try {
    await c.query('BEGIN');
    a = (await c.query(`SELECT * FROM staff_apps WHERE id = $1 FOR UPDATE`, [appId])).rows[0];
    if (!a) throw new StaffAppError('No such application.');
    if (a.status === 'withdrawn') throw new StaffAppError('This application was withdrawn.');
    if (!a.tracks.includes(trackKey)) throw new StaffAppError(`They didn't apply for ${t.name}.`);
    others = (await c.query(`SELECT track, decision FROM staff_app_decisions WHERE app_id = $1`, [appId])).rows;
    if (others.some(d => d.track === trackKey)) throw new StaffAppError(`${t.name} has already been decided.`);
    // Operators don't play; Event Staff do
    const clash = { event_staff: 'operator', operator: 'event_staff' }[trackKey];
    if (accept && clash && others.some(d => d.track === clash && d.decision === 'accepted')) throw new StaffAppError(`They're already accepted as ${trackName(clash)}. Operators can't play the event, so nobody can be both.`);
    await c.query(`INSERT INTO staff_app_decisions (app_id, track, decision, reason, decided_by) VALUES ($1, $2, $3, $4, $5)`,
      [appId, trackKey, accept ? 'accepted' : 'rejected', reason, by.username]);
    await c.query(`UPDATE staff_apps SET updated_at = NOW() WHERE id = $1`, [appId]);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }

  const results = [];
  let dm;
  if (accept) {
    const give = async (roleId, what) => {
      if (!roleId) { results.push({ role: what, ok: false, note: 'role ID not set in staff-apply.config.js' }); return; }
      let ok = false;
      try { ok = await services.addRole(a.discord_id, roleId); } catch (e) { ok = false; }
      results.push({ role: what, ok });
    };
    await give(C.staffRoleId, 'GW Staff');
    await give(t.roleId, t.name);
    dm = await services.dm(a.discord_id, acceptMessage(t));
  } else {
    const decided = new Set([...others.map(d => d.track), trackKey]);
    const waiting = a.tracks.filter(k => !decided.has(k)).map(trackName);
    const accepted = others.some(d => d.decision === 'accepted');
    dm = await services.dm(a.discord_id, `Thank you for applying to be **${t.name}** for The Great War. We had a lot of strong applications and haven't picked you for ${t.name} this time.`
      + (waiting.length ? ` We're still looking at your application for ${list(waiting)}.` : accepted ? '' : " You're very welcome to play in the event, and we hope to see you there."));
  }
  await db.query(`UPDATE staff_app_decisions SET roles_result = $3, dm_sent = $4 WHERE app_id = $1 AND track = $2`, [appId, trackKey, accept ? JSON.stringify(results) : null, dm]);
  return { results, dm };
}

module.exports = {
  C, StaffAppError, TRACK, QUESTIONS, OP_TOOLS, CRAFTS, TOOLS, services, ready, publicInfo, parseYouTube,
  submit, withdraw, saveRecording, deleteRecording, recordingOf, saveFile, deleteFile, file, mine,
  queue, counts, detail, adminRecording, adminFile, decide,
};
