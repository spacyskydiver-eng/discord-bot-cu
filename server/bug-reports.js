// Tester bug reports (/report): what happened, when, the Minecraft name, and the files that let a bug be found in the
// server's logs (latest.log, crash reports, screenshots). Files are stored gzipped in the database; staff read them on
// /staff/bug-reports. Nothing here is public.
const zlib = require('zlib');
const db = require('../db');

const MAX_FILES = 4, MAX_BYTES = 10 * 1024 * 1024, PER_DAY = 10;
class BugReportError extends Error {}

const ready = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS bug_reports (
    id SERIAL PRIMARY KEY,
    discord_id TEXT NOT NULL,
    discord_name TEXT,
    mc_name TEXT,
    happened TEXT NOT NULL,
    expected TEXT,
    happened_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.query(`CREATE TABLE IF NOT EXISTS bug_report_files (
    id SERIAL PRIMARY KEY,
    report_id INT NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime TEXT,
    size INT NOT NULL,
    gz BYTEA NOT NULL)`);
})().catch(e => console.error('[bug-reports] setup', e.message));

async function submit(user, f, files) {
  await ready;
  const happened = String(f.happened || '').trim().slice(0, 4000);
  if (happened.length < 10) throw new BugReportError('Say what happened, in a sentence or two.');
  const recent = (await db.query(`SELECT count(*)::int AS n FROM bug_reports WHERE discord_id = $1 AND created_at > NOW() - interval '1 day'`, [user.id])).rows[0].n;
  if (recent >= PER_DAY) throw new BugReportError(`That's ${PER_DAY} reports today. Thanks! If there's more, add it to a ticket on our Discord.`);
  const at = f.happened_at ? new Date(f.happened_at) : null;
  const r = (await db.query(
    `INSERT INTO bug_reports (discord_id, discord_name, mc_name, happened, expected, happened_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [user.id, user.username, String(f.mc_name || '').trim().slice(0, 16) || null, happened, String(f.expected || '').trim().slice(0, 2000) || null,
      at && !isNaN(at) && Math.abs(at - Date.now()) < 30 * 86400e3 ? at : null])).rows[0];
  for (const file of (files || []).slice(0, MAX_FILES))
    await db.query(`INSERT INTO bug_report_files (report_id, name, mime, size, gz) VALUES ($1, $2, $3, $4, $5)`,
      [r.id, String(file.originalname || 'file').slice(0, 120), file.mimetype || null, file.size, zlib.gzipSync(file.buffer)]);
  return r.id;
}

async function list() {
  await ready;
  return (await db.query(`SELECT r.*, extract(epoch from r.created_at)::bigint AS at, extract(epoch from r.happened_at)::bigint AS when_ts,
      (SELECT json_agg(json_build_object('id', f.id, 'name', f.name, 'size', f.size) ORDER BY f.id) FROM bug_report_files f WHERE f.report_id = r.id) AS files
    FROM bug_reports r ORDER BY r.created_at DESC LIMIT 300`)).rows;
}
async function file(reportId, fileId) {
  await ready;
  const f = (await db.query(`SELECT name, mime, gz FROM bug_report_files WHERE id = $1 AND report_id = $2`, [fileId, reportId])).rows[0];
  return f ? { name: f.name, mime: f.mime, data: zlib.gunzipSync(f.gz) } : null;
}
async function setStatus(id, status) {
  if (!['new', 'seen', 'fixed', 'not a bug'].includes(status)) return;
  await db.query(`UPDATE bug_reports SET status = $2 WHERE id = $1`, [id, status]);
}

module.exports = { BugReportError, submit, list, file, setStatus, MAX_FILES, MAX_BYTES, ready };
