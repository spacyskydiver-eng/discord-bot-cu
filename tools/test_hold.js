#!/usr/bin/env node
// Tests for the 10-minute hold (server/hold.js) and the Discord poster's use of it (S82). No framework, no network, no
// database: a fake db module and an in-memory first-seen store; the clocks are driven by hand.
//   node tools/test_hold.js
const path = require('path');
const ROOT = path.join(__dirname, '..');
// never the real database: a fake db module before anything requires it
require.cache[require.resolve(path.join(ROOT, 'db'))] = { id: 'db', filename: 'db', loaded: true, exports: { query: async () => ({ rows: [] }) } };
const hold = require(path.join(ROOT, 'server/hold'));
const T = hold._test;

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name); } }
const MIN = 60 * 1000;
let siteNow = Date.UTC(2026, 11, 20, 20, 0);
T.setClock(() => siteNow);
T.setWindows(() => []);
const fresh = () => { const s = T.memoryStore(); T.useStore(s); T.setGameOffset(0); return s; };

function report(now, extra = {}) {
  return Object.assign({ ok: true, now, windowOpen: false,
    nations: [{ id: 'de', nodes: 11, captured24h: 1, lost24h: 0, capitalHeld: true, wiped: false },
      { id: 'fr', nodes: 9, captured24h: 0, lost24h: 1, capitalHeld: true, wiped: false }],
    owners: { brittany: 'de', paris: 'fr' }, relations: [], events: [], battles: [] }, extra);
}

(async () => {
  console.log('dated captures (the game\'s clock)');
  fresh();
  let gameNow = siteNow + 60 * MIN; // the game's clock an hour ahead of the site's: only report.now may be used
  let r = await hold.holdReport(report(gameNow, { events: [{ at: gameNow - 2 * MIN, kind: 'capture', node: 'brittany', from: 'fr', to: 'de' }] }));
  ok(r.owners.brittany === 'fr', 'capture 2 min old: owner put back');
  ok(r.events.length === 0, 'capture 2 min old: event hidden');
  ok(r.nations[0].nodes === 10 && r.nations[0].captured24h === 0 && r.nations[1].nodes === 10 && r.nations[1].lost24h === 0, 'capture 2 min old: counts put back');
  r = await hold.holdReport(report(gameNow, { events: [{ at: gameNow - 11 * MIN, kind: 'capture', node: 'brittany', from: 'fr', to: 'de' }] }));
  ok(r.owners.brittany === 'de' && r.events.length === 1, 'capture 11 min old (game clock, site clock an hour behind): shown');
  r = await hold.holdReport(report(gameNow, { owners: { brittany: 'ru', paris: 'fr' }, events: [
    { at: gameNow - 1 * MIN, kind: 'capture', node: 'brittany', from: 'de', to: 'ru' },
    { at: gameNow - 3 * MIN, kind: 'capture', node: 'brittany', from: 'fr', to: 'de' }] }));
  ok(r.owners.brittany === 'fr', 'node taken twice inside the hold: owner before both');
  T.setGameOffset(0);
  r = await hold.holdReport(Object.assign(report(undefined), { now: undefined, events: [{ at: siteNow - 2 * MIN, kind: 'capture', node: 'brittany', from: 'fr', to: 'de' }] }));
  ok(r.owners.brittany === 'fr', 'no report.now: falls back to the game clock learned from the feed (site clock + offset)');

  console.log('capitals and wipes');
  r = await hold.holdReport(report(gameNow, { nations: [{ id: 'fr', nodes: 9, capitalHeld: false }], events: [{ at: gameNow - 2 * MIN, kind: 'capital_lost', node: 'paris', from: 'fr', to: 'de' }] }));
  ok(r.nations[0].capitalHeld === true && r.events.length === 0, 'capital lost 2 min ago: still held, event hidden');
  r = await hold.holdReport(report(gameNow, { nations: [{ id: 'fr', nodes: 9, capitalHeld: true }], events: [{ at: gameNow - 2 * MIN, kind: 'capital_retaken', node: 'paris', to: 'fr' }] }));
  ok(r.nations[0].capitalHeld === false && r.events.length === 0, 'capital retaken 2 min ago: shows as not held yet');
  r = await hold.holdReport(report(gameNow, { nations: [{ id: 'fr', nodes: 9, capitalHeld: true }], events: [
    { at: gameNow - 1 * MIN, kind: 'capital_retaken', node: 'paris', to: 'fr' }, { at: gameNow - 4 * MIN, kind: 'capital_lost', node: 'paris', from: 'fr' }] }));
  ok(r.nations[0].capitalHeld === true, 'lost then retaken inside the hold: as before both (held)');
  r = await hold.holdReport(report(gameNow, { nations: [{ id: 'bg', nodes: 0, wiped: true }], events: [{ at: gameNow - 2 * MIN, kind: 'wiped', a: 'bg' }] }));
  ok(r.nations[0].wiped === false, 'wiped 2 min ago: not shown wiped');

  console.log('events with no time');
  fresh();
  const undated = () => report(siteNow, { owners: { brittany: 'de', paris: 'fr' }, events: [{ kind: 'capture', node: 'brittany', from: 'fr', to: 'de' }] });
  r = await hold.holdReport(undated());
  ok(r.owners.brittany === 'fr' && r.events.length === 0, 'undated capture: held when first seen');
  siteNow += 9 * MIN;
  r = await hold.holdReport(undated());
  ok(r.owners.brittany === 'fr', 'undated capture: still held 9 min after first seen');
  siteNow += 2 * MIN;
  r = await hold.holdReport(undated());
  ok(r.owners.brittany === 'de' && r.events.length === 1, 'undated capture: shown 11 min after first seen');
  // the game lists newest first, so a new event is put in front; occurrences are counted from the oldest
  r = await hold.holdReport(report(siteNow, { events: [{ kind: 'capture', node: 'brittany', from: 'de', to: 'fr' }, { kind: 'capture', node: 'brittany', from: 'fr', to: 'de' }] }));
  ok(r.events.length === 1 && r.events[0].to === 'de' && r.owners.brittany === 'de', 'a newer undated event: held, the older one stays shown');
  r = await hold.holdReport(report(siteNow, { events: [{ kind: 'capture', node: 'brittany', from: 'fr', to: 'de' }, { kind: 'capture', node: 'brittany', from: 'de', to: 'fr' }, { kind: 'capture', node: 'brittany', from: 'fr', to: 'de' }] }));
  ok(r.events.length === 1 && r.owners.brittany === 'de', 'the same undated capture again (a second occurrence): held, not taken for the first');

  console.log('battles and after-action reports (no times: first seen)');
  fresh();
  const b4 = { window: 4, node: 'brittany', attacker: 'de', defender: 'fr', deaths: 31, result: 'captured' };
  r = await hold.holdReport(report(siteNow, { battles: [b4] }));
  ok(r.battles.length === 0, 'closed window\'s battle: hidden when first seen (the window just closed)');
  siteNow += 10 * MIN;
  r = await hold.holdReport(report(siteNow, { battles: [b4] }));
  ok(r.battles.length === 1, 'battle shown 10 min after first seen');
  r = await hold.holdReport(report(siteNow, { windowOpen: true, battles: [b4, { window: 5, node: 'paris', attacker: 'de', defender: 'fr', deaths: 3, result: 'held' }] }));
  ok(r.battles.length === 1 && r.battles[0].window === 4, 'window open: a battle of the current window never shows');
  const aar = { window: 4, nations: [{ id: 'de', taken: 1, lost: 0, deaths: 3 }], top: [], battles: [b4] };
  r = await hold.holdReport(report(siteNow, { reports: [aar] }));
  ok(r.reports.length === 0, 'after-action report: hidden when first seen');
  siteNow += 10 * MIN;
  r = await hold.holdReport(report(siteNow, { reports: [aar] }));
  ok(r.reports.length === 1, 'after-action report: shown 10 min later');

  console.log('the Daily Front');
  fresh();
  const paper = () => ({ ok: true, editions: [
    { day: 4, date: '2026-12-20', headline: 'Brittany falls', articles: [{ kind: 'auto', title: 'Germany takes Brittany', body: 'x' }] },
    { day: 3, date: '2026-12-19', headline: 'Old news', articles: [{ kind: 'auto', title: 'Old', body: 'y' }] }] });
  let f = await hold.holdFront(paper());
  ok(f.editions.length === 0, 'undated editions and articles: held when first seen');
  siteNow += 11 * MIN;
  f = await hold.holdFront(paper());
  ok(f.editions.length === 2 && f.editions[0].headline === 'Brittany falls' && f.editions[0].articles.length === 1, 'shown 11 min after first seen');
  const p2 = paper(); p2.editions[0].headline = 'Paris retaken'; p2.editions[0].articles.unshift({ kind: 'auto', title: 'France retakes Paris', body: 'z' });
  f = await hold.holdFront(p2);
  ok(f.editions[0].articles.length === 1 && f.editions[0].articles[0].title === 'Germany takes Brittany' && f.editions[0].headline === 'Germany takes Brittany',
    'a new article and headline in today\'s edition: held; the edition shows under its first visible article');
  f = await hold.holdFront({ now: siteNow, editions: [{ day: 5, date: '2026-12-21', headline: 'h', at: siteNow - 20 * MIN, articles: [{ title: 'new', body: '', at: siteNow - 2 * MIN }, { title: 'old', body: '', at: siteNow - 12 * MIN }] }] });
  ok(f.editions[0].articles.length === 1 && f.editions[0].articles[0].title === 'old', 'dated articles: by the front\'s own clock');

  console.log('restarts (the first-seen store)');
  let st = fresh();
  await hold.released('battle:x');
  siteNow += 11 * MIN;
  T.restart();
  ok(await hold.released('battle:x'), 'seen before a restart, 11 min ago: shown after it (kept in the store)');
  ok(!(await hold.released('battle:new')), 'not seen before the restart: held (counts as seen now)');
  T.useStore({ async init() { throw new Error('db down'); }, async saveSeen() { throw new Error('db down'); }, async loadVersions() { throw new Error('db down'); }, async saveVersion() {}, async dropVersions() {} });
  ok(!(await hold.released('battle:x')), 'store unreadable at start: everything counts as seen now (held)');
  st = fresh();
  const rec0 = { name: 'Notch', nation: 'germany', alive: true, rank: 'Corporal', kills: 5, captures: 2, deaths: 3 };
  await hold.holdRecord('u1', rec0);
  siteNow += 11 * MIN;
  T.restart();
  let hr = await hold.holdRecord('u1', rec0);
  ok(hr.record && hr.record.kills === 5, 'record version from before a restart: still known');

  console.log('soldiers\' records');
  fresh();
  hr = await hold.holdRecord('u2', rec0);
  ok(hr.pending === true && !hr.record, 'first lookup: pending (name and nation only)');
  siteNow += 5 * MIN;
  const rec1 = Object.assign({}, rec0, { deaths: 4, captures: 3 });
  hr = await hold.holdRecord('u2', rec1);
  ok(hr.pending === true, 'changed 5 min later, still nothing 10 min old: pending');
  siteNow += 6 * MIN;
  hr = await hold.holdRecord('u2', rec1);
  ok(hr.record && hr.record.deaths === 3 && hr.record.captures === 2, '11 min after the first lookup: the first version (deaths 3, captures 2), not the live one');
  siteNow += 5 * MIN;
  hr = await hold.holdRecord('u2', rec1);
  ok(hr.record.deaths === 4 && hr.record.captures === 3, '10 min after the change: the new version');
  const dead = Object.assign({}, rec1, { alive: false, rank: null, diedAt: siteNow });
  hr = await hold.holdRecord('u2', dead);
  ok(hr.record.alive === true && hr.record.rank === 'Corporal', 'just died: shows as before, rank and all');
  ok((await hold.holdRecord('s', { sample: true, kills: 1 })).record.kills === 1, 'sample records untouched');

  console.log('night cards');
  fresh();
  const card = (to, w = 5) => ({ name: 'Notch', nation: 'germany', window: w, from: (to || siteNow) - 180 * MIN, to, foughtAt: ['brittany'], helpedTake: ['brittany'], kills: 2 });
  ok(await hold.holdNight('u', card(siteNow + 60 * MIN)) === null, 'window still open: no card');
  ok(await hold.holdNight('u', card(siteNow - 5 * MIN)) === null, 'window closed 5 min ago: no card');
  ok(!!(await hold.holdNight('u', card(siteNow - 11 * MIN))), 'window closed 11 min ago: card');
  T.setGameOffset(-30 * MIN);
  ok(await hold.holdNight('u', card(siteNow - 11 * MIN)) === null, 'the game\'s clock decides (game 30 min behind the site: still held)');
  T.setGameOffset(0);
  T.setWindows(() => [{ start: (siteNow - 60 * MIN) / 1000, end: (siteNow + 120 * MIN) / 1000 }]);
  ok(await hold.holdNight('u', card(undefined)) === null, 'no end time, a scheduled window open: no card');
  T.setWindows(() => [{ start: (siteNow - 190 * MIN) / 1000, end: (siteNow - 5 * MIN) / 1000 }]);
  ok(await hold.holdNight('u', card(undefined)) === null, 'no end time, the window closed 5 min ago: no card');
  T.setWindows(() => []);
  ok(await hold.holdNight('u', card(undefined)) === null, 'no end time, no window known: first seen now, held');
  siteNow += 11 * MIN;
  ok(!!(await hold.holdNight('u', card(undefined))), '... shown 11 min after first seen');

  console.log('the wager and the rallies');
  fresh();
  const empty = { table: [], last: [] };
  ok((await hold.holdValue('wager', { last: [{ node: 'brittany', before: 'france', after: 'germany' }] }, empty)) === empty, 'new wager results: held');
  siteNow += 11 * MIN;
  ok((await hold.holdValue('wager', { last: [{ node: 'brittany', before: 'france', after: 'germany' }] }, empty)).last.length === 1, 'shown 11 min later');
  ok((await hold.holdValue('rallying', ['fr'], [])).length === 0, 'a new rally: held');

  console.log('samples');
  const s = { sample: true, owners: { a: 'de' }, events: [{ at: siteNow, kind: 'capture', node: 'a', from: 'fr', to: 'de' }] };
  ok(await hold.holdReport(s) === s, 'sample report untouched');

  console.log('the Discord poster');
  fresh();
  const feed = require(path.join(ROOT, 'server/war-feed'));
  const cm = require(path.join(ROOT, 'server/campaign-map'));
  cm.loadPublic = async () => JSON.stringify({ territories: [{ id: 'paris', name: 'Paris' }, { id: 'brittany', name: 'Brittany' }], nations: [], continents: [] });
  let evAt;
  feed.report = async () => report(siteNow, { events: [{ at: evAt, kind: 'capital_lost', node: 'paris', from: 'fr', to: 'de' }, { at: evAt, kind: 'capture', node: 'paris', from: 'fr', to: 'de' }],
    battles: [{ window: 4, node: 'paris', attacker: 'de', defender: 'fr', deaths: 40, result: 'captured' }] });
  feed.front = async () => ({ editions: [] });
  const poster = require(path.join(ROOT, 'server/front-poster'));
  evAt = siteNow - 2 * MIN;
  let keys = (await poster.due()).map(p => p.key);
  ok(!keys.some(k => k.startsWith('breaking:')), 'capital lost 2 min ago: no breaking post');
  ok(!keys.some(k => k.startsWith('after-action:')), 'window just closed: no after-action post yet');
  siteNow += 10 * MIN;
  keys = (await poster.due()).map(p => p.key);
  ok(keys.some(k => k.startsWith('breaking:capital_lost')), '10 min later: the breaking post');
  ok(keys.includes('after-action:4'), '10 min after the window\'s results were first seen: the after-action report');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
