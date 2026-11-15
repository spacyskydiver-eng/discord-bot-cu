// "Your night, as a card" (meeting 3, S40): one soldier's war window as a shareable page with a Discord preview. It leads
// with what he did (where he fought, what his nation took there with him, his kills as the game pays them, his medals and
// regiment). His deaths show only to himself (his linked account). No K/D, no ranking, no positions, money or node values.
// From the game's GET /api/public/night/<uuid>; until the web API is live, a sample card under a banner.
const crypto = require('crypto');
const { javaAccount } = require('./minecraft');
const companion = require('./companion');
const NATIONS = require('./nations').NATIONS;
const { GAME_IDS } = require('./nation-roles');

const dashed = u => u.replace(/-/g, '').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
const NODES = ['Verdun', 'Ypres', 'the Marne', 'Liège', 'Namur', 'Lille', 'Arras', 'Mons'];

function sample(name, window) {
  const h = crypto.createHash('sha256').update(name.toLowerCase() + ':' + window).digest();
  const n = NATIONS[h[0] % NATIONS.length];
  const fought = [NODES[h[1] % NODES.length], NODES[h[2] % NODES.length]].filter((x, i, a) => a.indexOf(x) === i);
  return { sample: true, name, nation: n.id, window: window || 3, from: Date.UTC(2026, 11, 21, 19), to: Date.UTC(2026, 11, 21, 22),
    rank: ['Private', 'Corporal', 'Sergeant'][h[3] % 3], regiment: h[4] % 2 ? 'BEF' : '', foughtAt: fought, helpedTake: h[5] % 2 ? [fought[0]] : [],
    kills: h[6] % 7, medals: h[7] % 3 ? [] : ['Held the Line'], deaths: h[8] % 3 };
}

/** The card for a Minecraft name and window (0 = the latest), with `own` when the viewer is that soldier. */
async function lookup(name, window, viewerDiscordId) {
  const acc = await javaAccount(name);
  if (!acc) return null;
  const uuid = dashed(acc.uuid.replace(/-/g, '').toLowerCase());
  let card;
  if (companion.isLive()) {
    try { card = await companion.publicGet(`/api/public/night/${uuid}${window ? '?window=' + window : ''}`); } catch (e) { card = null; }
  } else card = sample(acc.name, window);
  if (!card) return { account: { name: acc.name, uuid }, card: null };
  let own = false;
  if (viewerDiscordId) {
    if (card.sample) own = false;
    else { try { const me = await companion.me(viewerDiscordId); own = !!(me && String(me.uuid).replace(/-/g, '') === uuid.replace(/-/g, '')); } catch (e) { own = false; } }
  }
  const nid = GAME_IDS[card.nation] || card.nation, nation = NATIONS.find(x => x.id === nid) || null;
  const out = Object.assign({}, card, { nationName: nation ? nation.name.replace(/^The /, '') : '', flag: nation ? nation.flag : null, own });
  if (!own) delete out.deaths; // deaths only on his own view
  return { account: { name: acc.name, uuid }, card: out };
}

/** One line for the preview: what he did first, never his deaths. */
function summary(c) {
  const parts = [];
  if (c.foughtAt && c.foughtAt.length) parts.push('Fought at ' + c.foughtAt.slice(0, 3).join(', '));
  if (c.helpedTake && c.helpedTake.length) parts.push('helped take ' + c.helpedTake.join(', '));
  if (c.kills) parts.push(c.kills + (c.kills === 1 ? ' kill' : ' kills'));
  if (c.medals && c.medals.length) parts.push(c.medals.join(', '));
  return parts.length ? parts.join('; ') + '.' : 'Answered the call in window ' + c.window + '.';
}

module.exports = { lookup, summary, sample };
