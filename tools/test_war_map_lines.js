// The war map's border-line decoding (public/js/war-map-lines.js) against a line worked out by hand.
//   node tools/test_war_map_lines.js
const assert = require('assert');
const { decode, encode, nearestLevel } = require('../public/js/war-map-lines');

// a closed square ring of side 10 starting at (100, -50): the start is absolute, then four steps back to the start
const flat = [100, -50, 10, 0, 0, 10, -10, 0, 0, -10];
const ring = [[100, -50], [110, -50], [110, -40], [100, -40], [100, -50]];
assert.deepStrictEqual(decode(flat), ring);
assert.deepStrictEqual(ring[0], ring[ring.length - 1], 'a closed ring ends on its first point');
assert.deepStrictEqual(encode(ring), flat);

// an open line with negative coordinates and a single point
assert.deepStrictEqual(decode([-3, -4, -1, 2, 5, 0]), [[-3, -4], [-4, -2], [1, -2]]);
assert.deepStrictEqual(decode([7, 8]), [[7, 8]]);
assert.deepStrictEqual(encode(decode([-3, -4, -1, 2, 5, 0])), [-3, -4, -1, 2, 5, 0]);

// malformed input draws nothing
for (const bad of [null, [], [1], [1, 2, 3], [1, 'x', 2, 2], 'abc']) assert.deepStrictEqual(decode(bad), [], JSON.stringify(bad));

// the level nearest the view, in doublings; ties go to the finer level
const levels = [1, 2, 4, 8, 16, 32, 64];
assert.strictEqual(nearestLevel(levels, 0.5), 1);
assert.strictEqual(nearestLevel(levels, 5), 4);
assert.strictEqual(nearestLevel(levels, 6), 8);
assert.strictEqual(nearestLevel(levels, 5.6568), 4); // 2^2.5: halfway, the finer
assert.strictEqual(nearestLevel(levels, 200), 64);
assert.strictEqual(nearestLevel(['16', '2'], 8), 16); // keys as the JSON has them

console.log('war map lines: ok');
