// The player modpack release served from cuevents.xyz. Its details live in site setting `pack_release` (JSON), set when a
// release is published, so switching versions needs no deploy and the storage address stays out of this public repo:
//   { "version": "v0.21", "file": "the-great-war-v0.21.mrpack", "size": 18888976, "sha256": "...", "source": "<bucket url>" }
// /download/<file> streams it from the bucket; the pack page shows the version, size and checksum.
const { Readable } = require('stream');
const access = require('./access');
const config = require('./pack.config');

async function current() {
  try { const r = JSON.parse((await access.getSetting('pack_release')) || 'null'); return r && r.file && r.source ? r : null; }
  catch (e) { return null; }
}
const human = n => n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';

// what the pages see: never the storage address
async function publicInfo() {
  const r = await current();
  const base = { lockEnforced: config.lockEnforced };
  if (!r) return Object.assign(base, { version: config.version, url: config.url, size: config.size });
  return Object.assign(base, { version: r.version, url: '/download/' + r.file, size: r.size ? human(r.size) : null, sha256: r.sha256 || null, file: r.file });
}

async function serve(req, res, next) {
  const r = await current();
  if (!r || req.params.file !== r.file) return next();
  try {
    const up = await fetch(r.source, { signal: AbortSignal.timeout(60000) });
    if (!up.ok || !up.body) return res.status(502).send('The download is unavailable right now. Please try again in a minute.');
    res.set({ 'Content-Type': 'application/x-modrinth-modpack+zip', 'Content-Disposition': `attachment; filename="${r.file}"`, 'Cache-Control': 'public, max-age=300' });
    const len = up.headers.get('content-length'); if (len) res.set('Content-Length', len);
    Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
  } catch (e) { console.error('[pack] download', e.message); if (!res.headersSent) res.status(502).send('The download is unavailable right now. Please try again in a minute.'); }
}

module.exports = { current, publicInfo, serve };
