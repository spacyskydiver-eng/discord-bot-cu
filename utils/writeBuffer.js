// Fewer database wake-ups from the bot (22 Nov: the database is paid by the hour it's awake, and it was woken by every
// Discord message). Writes that don't need to land at once (message logs, nation chat history, member names, XP) are
// queued here and written together every FLUSH_MS, and when the process stops (Render sends SIGTERM on a deploy).
// Reads that rarely change (a guild's XP settings and levels) are cached by their callers.
const db = require('../db');

const FLUSH_MS = 15 * 60 * 1000;
const queue = [];                 // { sql, params }
const logs = new Map();           // message_id -> params of a message_logs insert not written yet
const xp = new Map();             // "guild:user" -> { guildId, userId, delta, level, last }
let flushing = null;

function enqueue(sql, params) { queue.push({ sql, params }); if (queue.length > 2000) flush(); }

// message_logs: an insert, and the delete/edit updates applied to it while it's still queued
const LOG_SQL = `INSERT INTO message_logs (message_id, guild_id, channel_id, author_id, author_tag, author_avatar, content, attachments, sent_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (message_id) DO NOTHING`;
function logMessage(params) { logs.set(params[0], { params, deleted: null, edited: null }); }
function logDeleted(messageId) {
  const l = logs.get(messageId);
  if (l) { l.deleted = new Date(); return; }
  enqueue(`UPDATE message_logs SET deleted = TRUE, deleted_at = $2 WHERE message_id = $1`, [messageId, new Date()]);
}
function logEdited(messageId, content, original) {
  const l = logs.get(messageId);
  if (l) { if (!l.edited) l.edited = { original: l.params[6] || original || '' }; l.params[6] = content; return; }
  enqueue(`UPDATE message_logs SET content = $1, edited = TRUE, original_content = COALESCE(original_content, $2) WHERE message_id = $3`, [content, original, messageId]);
}

// XP: added up in memory and written as increments, so a change made elsewhere (the site) is never overwritten
function addXp(guildId, userId, delta, level, last) {
  const k = guildId + ':' + userId;
  const e = xp.get(k) || { guildId, userId, delta: 0, level: 0, last: null };
  e.delta += delta; e.level = Math.max(e.level, level); e.last = last;
  xp.set(k, e);
}

async function flush() {
  if (flushing) return flushing;
  const items = queue.splice(0);
  for (const l of logs.values()) {
    items.push({ sql: LOG_SQL, params: l.params });
    if (l.edited) items.push({ sql: `UPDATE message_logs SET edited = TRUE, original_content = COALESCE(original_content, $2) WHERE message_id = $1`, params: [l.params[0], l.edited.original] });
    if (l.deleted) items.push({ sql: `UPDATE message_logs SET deleted = TRUE, deleted_at = $2 WHERE message_id = $1`, params: [l.params[0], l.deleted] });
  }
  logs.clear();
  for (const e of xp.values()) items.push({ sql: `UPDATE user_xp SET xp = xp + $1, level = GREATEST(level, $2), last_message_at = GREATEST(COALESCE(last_message_at, $3), $3) WHERE guild_id = $4 AND discord_id = $5`,
    params: [e.delta, e.level, e.last, e.guildId, e.userId] });
  xp.clear();
  if (!items.length) return;
  flushing = (async () => {
    let failed = 0;
    for (const it of items) { try { await db.query(it.sql, it.params); } catch (e) { failed++; } }
    if (failed) console.error(`[write-buffer] ${failed} of ${items.length} queued writes failed`);
  })().finally(() => { flushing = null; });
  return flushing;
}

setInterval(() => flush().catch(e => console.error('[write-buffer]', e.message)), FLUSH_MS).unref();
let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, async () => {
  if (stopping) return; stopping = true;
  try { await Promise.race([flush(), new Promise(r => setTimeout(r, 8000))]); } catch (e) { /* exit anyway */ }
  process.exit(0);
});

module.exports = { enqueue, logMessage, logDeleted, logEdited, addXp, flush, FLUSH_MS };
