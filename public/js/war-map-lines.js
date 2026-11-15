// The war map's border lines as the game serves them (GET /api/public/borders, S76): each line's points per level are
// one flat integer array [x0, z0, dx1, dz1, dx2, dz2, ...] in blocks: the first pair is where the line starts, each
// later pair a step from the point before. A closed ring ends on its first point again.
// Used by the page (window.WarMapLines) and by tools/war_map_borders.js and its test (require).
(function (root) {
  // flat steps -> [[x, z], ...]; anything malformed comes back empty rather than drawing a stray line
  function decode(flat) {
    if (!Array.isArray(flat) || flat.length < 2 || flat.length % 2) return [];
    var x = +flat[0], z = +flat[1], out = [[x, z]];
    for (var i = 2; i < flat.length; i += 2) { x += +flat[i]; z += +flat[i + 1]; out.push([x, z]); }
    return out.every(function (p) { return isFinite(p[0]) && isFinite(p[1]); }) ? out : [];
  }
  // [[x, z], ...] -> flat steps (points rounded to whole blocks)
  function encode(pts) {
    var out = [], px = 0, pz = 0;
    pts.forEach(function (p, i) {
      var x = Math.round(p[0]), z = Math.round(p[1]);
      if (i) out.push(x - px, z - pz); else out.push(x, z);
      px = x; pz = z;
    });
    return out;
  }
  // of the levels a line has (blocks a pixel), the one nearest the view's blocks a pixel, counted in doublings
  // (a tie goes to the finer)
  function nearestLevel(levels, bpp) {
    var best = null, bd = Infinity, want = Math.log2(bpp);
    levels.map(Number).sort(function (a, b) { return a - b; }).forEach(function (l) {
      var d = Math.abs(Math.log2(l) - want);
      if (d < bd - 1e-9) { bd = d; best = l; }
    });
    return best;
  }
  var api = { decode: decode, encode: encode, nearestLevel: nearestLevel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WarMapLines = api;
})(this);
