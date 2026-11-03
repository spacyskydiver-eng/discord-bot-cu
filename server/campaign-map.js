// The campaign map (the event's territory board at /admin/campaign-map). The map is never in the repo, which is
// public: it lives in the campaign_map table, uploaded from the page itself or with tools/upload_campaign_map.js.
// A local server/data/greatwar_map.json (gitignored) is used when the table has no map, for local testing.
//
// load() hands back the map as it was uploaded, plus `borders`: pairs whose outlines touch but aren't in
// connections, so a missing entry still counts as a land border.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const FILE = path.join(__dirname, 'data/greatwar_map.json');
let cache = { stamp: null, body: null, checked: 0 };

async function ensureTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS campaign_map (id TEXT PRIMARY KEY, data TEXT NOT NULL,
    uploaded_by TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`);
}

// a terrain zone that falls wholly outside the map comes out as [[[]]]; it's skipped, not an error
const isEmptyShape = ps => Array.isArray(ps) && ps.every(p => Array.isArray(p) && p.every(r => Array.isArray(r) && !r.length));

// what the board needs to draw; returns a list of problems, empty if the map is usable
function validate(m) {
  const errs = [];
  const isPt = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  const isPolys = ps => Array.isArray(ps) && ps.length && ps.every(p => Array.isArray(p) && p.length && p.every(r => Array.isArray(r) && r.length >= 3 && r.every(isPt)));
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['The file is not a JSON object.'];
  if (!m.meta || !Array.isArray(m.meta.bounds) || m.meta.bounds.length !== 4 || !m.meta.bounds.every(Number.isFinite)) errs.push('meta.bounds must be [minX, minZ, maxX, maxZ].');
  for (const k of ['continents', 'nations', 'territories']) if (!Array.isArray(m[k]) || !m[k].length) errs.push(`${k} must be a non-empty list.`);
  if (errs.length) return errs;
  const nations = new Set(m.nations.map(n => n.id)), continents = new Set(m.continents.map(c => c.id)), ids = new Set();
  for (const t of m.territories) {
    const name = t.id || t.name || '(no id)';
    if (!t.id) errs.push(`A territory has no id (${name}).`);
    else if (ids.has(t.id)) errs.push(`Territory id ${t.id} is used twice.`);
    ids.add(t.id);
    if (!nations.has(t.owner)) errs.push(`${name}: owner "${t.owner}" isn't in nations.`);
    if (!continents.has(t.continent)) errs.push(`${name}: continent "${t.continent}" isn't in continents.`);
    if (!isPt(t.label)) errs.push(`${name}: label must be [x, z].`);
    if (!isPolys(t.polygons)) errs.push(`${name}: polygons must be a list of polygons, each a list of rings of [x, z] points.`);
  }
  for (const c of m.continents) {
    if (!Number.isFinite(c.bonus)) errs.push(`Continent ${c.id}: bonus must be a number.`);
    for (const id of c.territories || []) if (!ids.has(id)) errs.push(`Continent ${c.id} lists ${id}, which isn't a territory.`);
  }
  for (const c of m.connections || []) if (!ids.has(c.a) || !ids.has(c.b)) errs.push(`Connection ${c.a} to ${c.b} names a territory that doesn't exist.`);
  (m.terrain || []).forEach((t, i) => { if (!isEmptyShape(t.polygons) && !isPolys(t.polygons)) errs.push(`terrain[${i}] (${t.label || t.type}): bad polygons.`); });
  (m.land || []).forEach((p, i) => { if (!isPolys([p])) errs.push(`land[${i}]: bad polygon.`); });
  for (const k of ['capitals', 'chokepoints', 'passes']) (m[k] || []).forEach((x, i) => { if (!isPt(x.pos)) errs.push(`${k}[${i}] (${x.name}): pos must be [x, z].`); });
  return errs.slice(0, 20);
}

function borders(m) {
  const tol = 3, out = [];
  const listed = new Set((m.connections || []).map(c => [c.a, c.b].sort().join('|')));
  const ts = (m.territories || []).map(t => {
    const segs = [], pts = [];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const poly of t.polygons) {
      const r = poly[0];
      r.forEach((p, i) => {
        segs.push([p, r[(i + 1) % r.length]]); pts.push(p);
        x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]);
      });
    }
    return { id: t.id, segs, pts, box: [x0, z0, x1, z1] };
  });
  const near = (p, [a, b]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l));
    return Math.hypot(a[0] + u * dx - p[0], a[1] + u * dz - p[1]) <= tol;
  };
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
    const A = ts[i], B = ts[j];
    if (A.box[0] > B.box[2] + tol || B.box[0] > A.box[2] + tol || A.box[1] > B.box[3] + tol || B.box[1] > A.box[3] + tol) continue;
    if (listed.has([A.id, B.id].sort().join('|'))) continue;
    let n = 0;
    for (const p of A.pts) if (B.segs.some(s => near(p, s)) && ++n >= 2) break;
    if (n >= 2) out.push({ a: A.id, b: B.id, type: 'land' });
  }
  return out;
}

const shape = text => {
  const m = JSON.parse(text);
  if (m.terrain) m.terrain = m.terrain.filter(t => !isEmptyShape(t.polygons));
  m.borders = borders(m);
  return JSON.stringify(m);
};

// the map the board draws: the uploaded one (checked at most every 10 seconds), else the local file
async function load() {
  if (cache.body && Date.now() - cache.checked < 10 * 1000) return cache.body;
  await ensureTable();
  const row = (await db.query(`SELECT updated_at FROM campaign_map WHERE id = 'current'`)).rows[0];
  if (row) {
    const stamp = 'db:' + new Date(row.updated_at).getTime();
    if (cache.stamp !== stamp) {
      const { data } = (await db.query(`SELECT data FROM campaign_map WHERE id = 'current'`)).rows[0];
      cache = { stamp, body: shape(data) };
    }
  } else {
    const stamp = 'file:' + (await fs.promises.stat(FILE).catch(() => { throw new Error('no map uploaded yet'); })).mtimeMs;
    if (cache.stamp !== stamp) cache = { stamp, body: shape(await fs.promises.readFile(FILE, 'utf8')) };
  }
  cache.checked = Date.now();
  return cache.body;
}

// what the page shows about the current map
async function info() {
  await ensureTable();
  const row = (await db.query(`SELECT length(data) AS size, uploaded_by, updated_at FROM campaign_map WHERE id = 'current'`)).rows[0];
  return row ? { source: 'database', size: +row.size, uploadedBy: row.uploaded_by, updatedAt: row.updated_at }
    : { source: fs.existsSync(FILE) ? 'local file' : 'none' };
}

// replaces the map; text must already have passed validate()
async function save(text, uploadedBy) {
  await ensureTable();
  await db.query(`INSERT INTO campaign_map (id, data, uploaded_by, updated_at) VALUES ('current', $1, $2, NOW())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, uploaded_by = EXCLUDED.uploaded_by, updated_at = NOW()`, [text, uploadedBy || null]);
  cache = { stamp: null, body: null, checked: 0 };
}

// the private share link: /campaign-map/s/<token> shows the board read-only to anyone who has it. One link at a
// time, in site setting campaign_map_share; making a new one or switching it off kills the old one.
const access = require('./access');
const SHARE_KEY = 'campaign_map_share';
const shareToken = () => access.getSetting(SHARE_KEY);
async function newShare() { const t = crypto.randomBytes(24).toString('base64url'); await access.setSetting(SHARE_KEY, t); return t; }
const stopShare = () => access.setSetting(SHARE_KEY, null);
async function shareOk(token) {
  const t = await shareToken();
  if (!t || typeof token !== 'string' || token.length !== t.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(t));
}

module.exports = { load, info, save, validate, FILE, shareToken, newShare, stopShare, shareOk };
