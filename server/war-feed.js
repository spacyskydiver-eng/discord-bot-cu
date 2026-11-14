// The war, for people who aren't online: the War Report (/war) and the Daily Front (/daily-front). Read from the game's
// public feed (docs/WAR_FEED.md) when WAR_FEED_URL is set; until then, sample data built from the real public map, so
// the pages can be seen and tested. Never node values, coordinates or scouting intel, live or sample.
const campaignMap = require('./campaign-map');

const LIVE = process.env.WAR_FEED_URL ? process.env.WAR_FEED_URL.replace(/\/$/, '') : null;
const cache = {};
async function live(path) {
  const hit = cache[path];
  if (hit && Date.now() - hit.at < 60 * 1000) return hit.body;
  const r = await fetch(LIVE + path, { headers: { 'X-Greatwar-Secret': process.env.WAR_FEED_SECRET || '' }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('war feed ' + r.status);
  const body = await r.json();
  cache[path] = { at: Date.now(), body };
  return body;
}

// ---------------------------------------------------------------- sample data
// A believable day 4 built from the real map: a few captures along real borders between nations put at war here.
// Seeded, so it reads the same every time.
const DAY = 86400 * 1000, H = 3600 * 1000;
async function sample() {
  const m = JSON.parse(await campaignMap.loadPublic());
  const owner = Object.fromEntries(m.territories.map(t => [t.id, t.owner]));
  const name = Object.fromEntries(m.territories.map(t => [t.id, t.name]));
  const start = Date.UTC(2026, 11, 17), now = start + 3 * DAY + 15 * H, win = d => start + (d - 1) * DAY + 19 * H;
  const wars = [['de', 'fr'], ['de', 'ru'], ['ah', 'ru'], ['gb', 'ot']];
  const links = [...(m.connections || []), ...(m.borders || [])];
  const events = [], battles = [];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [win3, day] of [[win(3), 3], [win(5), 5]]) {
    for (const [a, b] of wars) {
      const front = links.filter(c => (owner[c.a] === a && owner[c.b] === b) || (owner[c.a] === b && owner[c.b] === a));
      if (!front.length) continue;
      const c = front[Math.floor(rnd() * front.length)], att = rnd() < 0.6 ? a : b, node = owner[c.a] === att ? c.b : c.a, def = owner[node];
      if (!def || def === att || /capital/.test(node)) continue;
      const took = rnd() < 0.55 && !(m.capitals || []).some(x => x.territory === node);
      if (took && day < 5) { owner[node] = att; events.push({ at: win3 + (1 + rnd() * 1.8) * H, kind: 'capture', node, from: def, to: att }); }
      battles.push({ window: day, node, attacker: att, defender: def, deaths: 8 + Math.floor(rnd() * 40), result: took && day < 5 ? 'captured' : 'held' });
    }
  }
  events.push({ at: start + 2 * DAY + 10 * H, kind: 'alliance', a: 'de', b: 'ah' }, { at: start + 1 * DAY + 20 * H, kind: 'war_declared', a: 'de', b: 'fr' },
    { at: win(3), kind: 'war_begun', a: 'de', b: 'fr' }, { at: win(3), kind: 'war_begun', a: 'de', b: 'ru' }, { at: win(3), kind: 'war_begun', a: 'ah', b: 'ru' },
    { at: start + 3 * DAY + 14 * H, kind: 'war_declared', a: 'gb', b: 'ot' });
  events.sort((x, y) => y.at - x.at);
  const count = id => m.territories.filter(t => owner[t.id] === id).length;
  const gained = id => events.filter(e => e.kind === 'capture' && e.to === id && e.at > now - DAY).length;
  const lost = id => events.filter(e => e.kind === 'capture' && e.from === id && e.at > now - DAY).length;
  const report = {
    ok: true, sample: true, now, day: 4, nextWindow: win(5), windowOpen: false,
    nations: m.nations.filter(n => n.id !== 'none').map(n => ({ id: n.id, nodes: count(n.id), captured24h: gained(n.id), lost24h: lost(n.id), capitalHeld: true, wiped: false })),
    owners: owner,
    relations: [{ a: 'de', b: 'fr', state: 'war', since: win(3) }, { a: 'de', b: 'ru', state: 'war', since: win(3) }, { a: 'ah', b: 'ru', state: 'war', since: win(3) },
      { a: 'de', b: 'ah', state: 'ally', since: start + 2 * DAY + 10 * H }, { a: 'gb', b: 'fr', state: 'ally', since: start + 1 * DAY }, { a: 'gb', b: 'ot', state: 'war_pending', from: win(5) }],
    events, battles: battles.filter(b => b.window < 5).sort((x, y) => y.deaths - x.deaths).slice(0, 10),
  };
  const nat = id => (m.nations.find(n => n.id === id) || {}).name || id;
  const caps = events.filter(e => e.kind === 'capture');
  const front = { ok: true, sample: true, editions: [
    { day: 4, date: '2026-12-20', headline: caps[0] ? `${nat(caps[0].to)} takes ${name[caps[0].node]}` : 'The guns open',
      articles: [
        ...caps.slice(0, 3).map(e => ({ kind: 'auto', title: `${name[e.node]} falls to ${nat(e.to)}`, body: `After a hard fight in the war window, ${nat(e.to)} took ${name[e.node]} from ${nat(e.from)}. The front moves.` })),
        { kind: 'auto', title: 'Britain marks the Ottoman Empire as an enemy', body: 'The war begins at the next window, at least a day from now. Constantinople has until then to dig in.' },
        { kind: 'press', nation: 'fr', author: 'The Minister of War', title: 'Not one step back', body: 'Every Frenchman to the Marne. Fortify jobs pay double tonight.' },
      ] },
    { day: 3, date: '2026-12-19', headline: 'The first war window opens',
      articles: [{ kind: 'auto', title: 'Europe at war', body: 'Germany is at war with France and Russia, and Austria-Hungary with Russia. Guns are out for the first time.' },
        { kind: 'auto', title: 'An alliance in the centre', body: 'Germany and Austria-Hungary have marked each other as allies.' }] },
  ] };
  return { report, front };
}

async function report() { return LIVE ? live('/api/public/report') : (await sample()).report; }
async function front() { return LIVE ? live('/api/public/front?days=7') : (await sample()).front; }
module.exports = { report, front, isLive: () => !!LIVE };
