// The Daily Front on Discord (meeting 2, S28): each new Daily Front edition, each war window's after-action report and
// breaking news (a capital falls or is retaken, a nation is wiped, the Christmas Truce) posted by the bot to one channel,
// from the war feed. OFF until the owner turns it on (site setting front_post: off | dry | on; channel in
// front_post_channel). Every post is recorded once (front_posts), so nothing is posted twice; "dry" records what it would
// post without posting. Never node values, coordinates or scouting intel (the feed has none).
const db = require('../db');
const access = require('./access');
const feed = require('./war-feed');
const NATIONS = require('./nations').NATIONS;
const events = require('./cue-events');

const SITE = 'https://cuevents.xyz';
const ready = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS front_posts (
    key TEXT PRIMARY KEY, mode TEXT NOT NULL, title TEXT, posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), error TEXT)`);
})().catch(e => console.error('[front-poster] setup', e.message));

const mode = async () => { const m = await access.getSetting('front_post'); return m === 'on' || m === 'dry' ? m : 'off'; };
const nat = id => { const n = NATIONS.find(x => x.id === id); return n ? n.name.replace(/^The /, '') : id; };
const COLOUR = 0xC9A84C;

// what should be posted now, oldest first: [{ key, embed }]
async function due() {
  const [report, front, m] = await Promise.all([feed.report(), feed.front(), require('./campaign-map').loadPublic().then(JSON.parse)]);
  const names = Object.fromEntries(m.territories.map(t => [t.id, t.name])), node = id => names[id] || id;
  const out = [];
  for (const ed of (front.editions || []).slice().reverse()) {
    const lines = (ed.articles || []).slice(0, 4).map(a => `**${a.title}**\n${a.body}`.slice(0, 300));
    out.push({ key: `edition:${ed.day}`, embed: { title: `The Daily Front · Day ${ed.day}: ${ed.headline}`, url: `${SITE}/daily-front`, color: COLOUR,
      description: lines.join('\n\n').slice(0, 3800), footer: { text: 'The Great War · the full paper and the map at cuevents.xyz' } } });
  }
  const byWindow = {};
  (report.battles || []).forEach(b => { (byWindow[b.window] = byWindow[b.window] || []).push(b); });
  for (const w of Object.keys(byWindow).map(Number).sort((a, b) => a - b)) {
    const fights = byWindow[w].sort((a, b) => b.deaths - a.deaths).slice(0, 5);
    out.push({ key: `after-action:${w}`, embed: { title: `After-action report · war window ${w}`, url: `${SITE}/war`, color: 0x8E3D12,
      description: fights.map(f => `**${node(f.node)}**: ${nat(f.attacker)} against ${nat(f.defender)}, ${f.deaths} dead, ${f.result === 'captured' ? 'taken' : 'held'}`).join('\n')
        + `\n\n[The War Report](${SITE}/war) · [The map](${SITE}/map)` } });
  }
  for (const e of (report.events || []).slice().reverse()) {
    const text = e.kind === 'capital_lost' ? `${nat(e.from)} has lost its capital` : e.kind === 'capital_retaken' ? `${nat(e.to)} has retaken its capital`
      : e.kind === 'wiped' ? `${nat(e.a)} has been wiped out` : null;
    if (text) out.push({ key: `breaking:${e.kind}:${e.at}:${e.from || e.to || e.a}`, embed: { title: `BREAKING · ${text}`, url: `${SITE}/war`, color: 0xB5281C, description: `[The War Report](${SITE}/war) · [The map](${SITE}/map)` } });
  }
  const gw = events().find(e => e.truce);
  if (gw && Date.now() / 1000 >= gw.truce.start - 3600 && Date.now() / 1000 < gw.truce.end)
    out.push({ key: 'breaking:truce', embed: { title: 'The Christmas Truce', url: `${SITE}/great-war-in-2-minutes`, color: 0xE8E2CF,
      description: 'No war window tonight. From 19:00 UK time the guns fall silent: PvP is off for the evening, and no man\'s land is open to meet the other side.' } });
  return out;
}

async function run() {
  await ready;
  const m = await mode();
  if (m === 'off') return { mode: m, skipped: true };
  const channel = await access.getSetting('front_post_channel');
  if (m === 'on' && !/^\d{17,20}$/.test(channel || '')) return { mode: m, error: 'no channel set' };
  const r = await feed.report();
  if (r.sample && m === 'on') return { mode: m, error: 'the war feed is still sample data: not posting' };
  const done = new Set((await db.query(`SELECT key FROM front_posts`)).rows.map(x => x.key));
  let posted = 0;
  for (const p of (await due()).filter(p => !done.has(p.key)).slice(0, 5)) {
    let error = null;
    if (m === 'on') {
      const res = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, { method: 'POST', headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [p.embed], allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(8000) }).catch(e => ({ ok: false, status: e.message }));
      if (!res.ok) { error = String(res.status); if (res.status === 429) break; }
    }
    await db.query(`INSERT INTO front_posts (key, mode, title, error) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING`, [p.key, m, p.embed.title, error]);
    if (!error) posted++;
  }
  return { mode: m, posted };
}
function start() {
  const tick = () => run().then(s => { if (!s.skipped && (s.posted || s.error)) console.log('[front-poster]', JSON.stringify(s)); }).catch(e => console.error('[front-poster]', e.message));
  setTimeout(tick, 2 * 60 * 1000);
  setInterval(tick, 5 * 60 * 1000);
}
async function recent() { await ready; return (await db.query(`SELECT *, extract(epoch from posted_at)::bigint AS ts FROM front_posts ORDER BY posted_at DESC LIMIT 60`)).rows; }

module.exports = { mode, due, run, start, recent, ready };
