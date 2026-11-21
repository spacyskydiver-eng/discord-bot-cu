// The public war map's region fills, built from the game's live border lines (GET /api/public/borders): every line
// with `a` (and `b`) is one edge of that region's outline (one-sided lines are coasts and the map's edge), so a region's
// outline is its lines chained end to end into closed rings. Rings nested an odd number of times are holes.
// The label spot is the point inside the region's biggest piece farthest from its edges (the pole of inaccessibility):
// it depends on the shape alone, never on a core or anything else the game keeps private (S82 finding 1).
const { decode } = require('../public/js/war-map-lines');

const key = p => p[0] + ',' + p[1];
const ringArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s / 2; };
function inRing(p, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segDist2(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
  let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l : 0; t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0], z = a[1] + t * dz - p[1]; return x * x + z * z;
}
// signed distance from p to a polygon's edges: positive inside
function polyDist(p, poly) {
  let inside = false, d = Infinity;
  for (const r of poly) {
    if (inRing(p, r)) inside = !inside;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) d = Math.min(d, segDist2(p, r[i], r[j]));
  }
  return (inside ? 1 : -1) * Math.sqrt(d);
}
// pole of inaccessibility by grid refinement (precise to ~1 block on these sizes)
function poleOf(poly) {
  const xs = poly[0].map(p => p[0]), zs = poly[0].map(p => p[1]);
  let minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  let best = null, bd = -Infinity, step = Math.max(maxX - minX, maxZ - minZ) / 24;
  for (let round = 0; round < 6 && step >= 0.5; round++) {
    for (let x = minX; x <= maxX; x += step) for (let z = minZ; z <= maxZ; z += step) {
      const d = polyDist([x, z], poly);
      if (d > bd) { bd = d; best = [x, z]; }
    }
    minX = best[0] - step; maxX = best[0] + step; minZ = best[1] - step; maxZ = best[1] + step; step /= 4;
  }
  if (!best) {   // too small to search: the middle of its outline
    const r = poly[0]; best = [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
  }
  return [Math.round(best[0]), Math.round(best[1])];
}

// chain one region's edges into closed rings; null if they don't close (then the region gets no fill)
function rings(edges) {
  const out = [], open = [];
  for (const e of edges) {
    if (e.length < 2) continue;
    if (key(e[0]) === key(e[e.length - 1])) out.push(e.slice(0, -1)); else open.push(e);
  }
  const byEnd = new Map();
  open.forEach((e, i) => { for (const k of [key(e[0]), key(e[e.length - 1])]) (byEnd.get(k) || byEnd.set(k, []).get(k)).push(i); });
  const used = new Set();
  for (let s = 0; s < open.length; s++) {
    if (used.has(s)) continue;
    used.add(s);
    let ring = open[s].slice(), guard = 0;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && guard++ < 100000) {
      const end = key(ring[ring.length - 1]);
      const next = (byEnd.get(end) || []).find(i => !used.has(i));
      if (next === undefined) return null;
      used.add(next);
      const e = open[next];
      ring = ring.concat(key(e[0]) === end ? e.slice(1) : e.slice().reverse().slice(1));
    }
    if (key(ring[0]) !== key(ring[ring.length - 1])) return null;
    out.push(ring.slice(0, -1));
  }
  return out.filter(r => r.length >= 3 && Math.abs(ringArea(r)) > 0);
}

// rings -> polygons [[outer, hole, ...], ...] by nesting depth
function polygons(rs) {
  const sorted = rs.map(r => ({ r, a: Math.abs(ringArea(r)) })).sort((x, y) => y.a - x.a);
  const polys = [];
  sorted.forEach((x, i) => {
    const containers = sorted.slice(0, i).filter(y => inRing(x.r[0], y.r));
    if (containers.length % 2 === 0) polys.push({ outer: x, holes: [] });
    else {
      const host = polys.filter(p => inRing(x.r[0], p.outer.r)).sort((p, q) => p.outer.a - q.outer.a)[0];
      if (host) host.holes.push(x);
    }
  });
  return polys.map(p => [p.outer.r, ...p.holes.map(h => h.r)]);
}

const cache = { version: null, out: null };
// borders: { version, levels, lines: [{ a, b?, pts: { level: flat } }] }; level: which traced level to build from
function build(borders, level = 4, capitalsIn = []) {
  if (!borders || !Array.isArray(borders.lines)) return null;
  const ck = borders.version + ':' + level;
  if (cache.version === ck) return withCapitals(cache.out, capitalsIn);
  const edges = {};
  for (const l of borders.lines) {
    const pts = decode(l.pts && (l.pts[level] || l.pts[String(level)]));
    if (pts.length < 2) continue;
    for (const id of [l.a, l.b]) if (id) (edges[id] = edges[id] || []).push(pts);
  }
  const regions = {}, failed = [];
  for (const [id, es] of Object.entries(edges)) {
    const rs = rings(es);
    if (!rs || !rs.length) { failed.push(id); continue; }
    const polys = polygons(rs);
    if (!polys.length) { failed.push(id); continue; }
    const biggest = polys.slice().sort((p, q) => Math.abs(ringArea(q[0])) - Math.abs(ringArea(p[0])))[0];
    regions[id] = { label: poleOf(biggest), polygons: polys };
  }
  if (failed.length) console.error('[war-map-fills] no closed outline for', failed.length, 'regions:', failed.slice(0, 10).join(', '));
  cache.version = ck; cache.out = { version: String(borders.version), regions };
  return withCapitals(cache.out, capitalsIn);
}
// capitals keep their name, nation and region; the star goes at the region's label spot, never a game position
function withCapitals(out, caps) {
  return Object.assign({}, out, { capitals: (caps || []).filter(c => out.regions[c.territory]).map(c => ({ name: c.name, nation: c.nation, territory: c.territory, pos: out.regions[c.territory].label })) });
}

module.exports = { build, rings, polygons, poleOf };
