// Builds the war map's placeholder region data from the game map's territory polygons (nodes.json, block coordinates):
//   server/data/war-map-borders.json  the same shape the game will serve at GET /api/public/borders:
//                                     { version, levels, lines: [{ a, b, pts: { "<level>": [[x, z], ...] } }] }
//                                     (a line between two regions, or b null for a coast or the map's edge)
//   server/data/war-map-regions.json  what the borders don't carry yet: each region's fill polygons, its label spot,
//                                     and the capitals. Ids, shapes and names only: no node values, bonuses or notes.
// The site uses the game's borders when its war feed is live, and these files until then (and always for the fills,
// until the fills are built from the traced lines).
//
//   node tools/war_map_borders.js path/to/nodes.json
const fs = require('fs');
const path = require('path');

const LEVELS = [1, 2, 4, 8, 16, 32, 64]; // blocks per pixel, as the terrain tiles
const TOL = 4;                            // blocks: two outlines this close count as one border

const src = JSON.parse(fs.readFileSync(process.argv[2] || 'nodes.json', 'utf8'));
const T = src.territories;

function segDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1;
  const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l));
  return Math.hypot(a[0] + u * dx - p[0], a[1] + u * dz - p[1]);
}
const terr = T.map(t => {
  const segs = []; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  t.polygons.forEach(poly => poly.forEach(r => r.forEach((p, i) => {
    segs.push([p, r[(i + 1) % r.length]]);
    x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]);
  })));
  return { id: t.id, t, segs, box: [x0 - TOL, z0 - TOL, x1 + TOL, z1 + TOL] };
});
const inBox = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
const distTo = (p, o) => o.segs.reduce((m, [a, b]) => Math.min(m, segDist(p, a, b)), Infinity);

// which region is on the other side of the outline at point p of region `self` (null: sea or the map's edge)
function across(self, p) {
  let best = null, bd = Infinity;
  for (const o of terr) {
    if (o === self || !inBox(p, o.box)) continue;
    const d = distTo(p, o);
    if (d <= TOL && d < bd) { best = o.id; bd = d; }
  }
  return best;
}
// The outlines were drawn region by region, so a shared border doesn't always share vertices (one side's long straight
// edge against the other's several short ones). Each ring is walked in short steps and every step is classed by
// what's across it; the steps then join into runs, one run a line.
const STEP = 4;
function densify(ring) {
  const out = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
    for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  });
  return out;
}

// Douglas-Peucker, keeping the ends
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  let idx = 0, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], pts[0], pts[pts.length - 1]); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax <= eps) return [pts[0], pts[pts.length - 1]];
  return simplify(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplify(pts.slice(idx), eps));
}

const lines = [];
for (const self of terr) {
  self.t.polygons.forEach(poly => poly.forEach(ring => {
    const pts = densify(ring), n = pts.length;
    // a step is classed at its middle; a lone odd step (a corner where three regions meet) takes its neighbours' class
    const nb = pts.map((p, i) => { const q = pts[(i + 1) % n]; return across(self, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); });
    for (let i = 0; i < n; i++) { const a = nb[(i + n - 1) % n], c = nb[(i + 1) % n]; if (a === c && nb[i] !== a) nb[i] = a; }
    // start the walk where the class changes, so a run never wraps round the ring's start
    let s = nb.findIndex((v, i) => v !== nb[(i + n - 1) % n]);
    if (s < 0) s = 0;
    let run = null;
    const flush = () => {
      if (!run) return;
      const b = run.b;
      // each border is walked from both sides: keep it once, from the side whose id sorts first
      if (b === null || self.id < b) lines.push({ a: self.id, b, raw: run.pts });
      run = null;
    };
    for (let k = 0; k < n; k++) {
      const i = (s + k) % n;
      if (run && run.b !== nb[i]) flush();
      if (!run) run = { b: nb[i], pts: [pts[i]] };
      run.pts.push(pts[(i + 1) % n]);
    }
    flush();
  }));
}

let total = 0;
const out = lines.map(l => {
  const pts = {}; let prev = null;
  for (const L of LEVELS) {
    const s = simplify(l.raw, L * 0.6).map(p => [Math.round(p[0]), Math.round(p[1])]);
    const key = JSON.stringify(s);
    if (key !== prev) { pts[L] = s; total += s.length; } // a level that's the same as the finer one is left out
    prev = key;
  }
  return { a: l.a, b: l.b, pts };
});

const dir = path.join(__dirname, '../server/data');
const borders = { version: 'placeholder-' + (src.meta && src.meta.version), levels: LEVELS, lines: out };
fs.writeFileSync(path.join(dir, 'war-map-borders.json'), JSON.stringify(borders));
const regions = {
  version: borders.version,
  regions: Object.fromEntries(T.map(t => [t.id, { label: t.label, polygons: t.polygons.map(p => p.map(r => r.map(q => [Math.round(q[0]), Math.round(q[1])]))) }])),
  capitals: (src.capitals || []).map(c => ({ name: c.name, nation: c.nation, territory: c.territory, pos: c.pos })),
};
fs.writeFileSync(path.join(dir, 'war-map-regions.json'), JSON.stringify(regions));
const pairs = new Set(out.filter(l => l.b).map(l => l.a + '|' + l.b));
console.log(`${out.length} lines (${pairs.size} region pairs, ${out.filter(l => !l.b).length} coast/edge), ${total} points`);
