#!/usr/bin/env node
// Tests for the 10-minute hold (server/hold.js) and the Discord poster's use of it (S82). No framework, no network, no
// database: a fake db module and an in-memory first-seen store; the clocks are driven by hand.
//   node tools/test_hold.js
const path = require('path');
const ROOT = path.join(__dirname, '..');
// never the real database: a fake db module before anything requires it
require.cache[require.resolve(path.join(ROOT, 'db'))] = { id: 'db', filename: 'db', loaded: true, exports: { query: async () => ({ rows: [] }) } };
// Mojang, faked before anything loads it (night-card, service-records and others take javaAccount at load)
const MOJANG = { notch: { name: 'Notch', uuid: '069a79f444e94726a5befca90e38aaf5' }, jeb_: { name: 'jeb_', uuid: '853c80ef3c3749fdaa49938b674adae6' } };
require(path.join(ROOT, 'server/minecraft')).javaAccount = async n => MOJANG[String(n).toLowerCase()] || null;
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
  // the game lists newest first, so a new event is put in front; old ones drop off the end after 7 days
  r = await hold.holdReport(report(siteNow, { events: [{ kind: 'capture', node: 'brittany', from: 'de', to: 'fr' }, { kind: 'capture', node: 'brittany', from: 'fr', to: 'de' }] }));
  ok(r.events.length === 1 && r.events[0].to === 'de' && r.owners.brittany === 'de', 'a newer undated event: held, the older one stays shown');
  r = await hold.holdReport(report(siteNow, { events: [{ kind: 'capture', node: 'brittany', from: 'fr', to: 'de' }, { kind: 'capture', node: 'brittany', from: 'de', to: 'fr' }, { kind: 'capture', node: 'brittany', from: 'fr', to: 'de' }] }));
  ok(r.events.length === 1 && r.owners.brittany === 'de', 'the same undated capture again (a second occurrence): held, not taken for the first');

  console.log('undated events dropping off the 7-day list (reviewer\'s case)');
  fresh();
  const A = () => ({ kind: 'capture', node: 'brittany', from: 'fr', to: 'de' }), B = () => ({ kind: 'capture', node: 'brittany', from: 'de', to: 'fr' });
  const rep7 = (events, de) => report(siteNow, { owners: { brittany: events[0].to, paris: 'fr' }, events,
    nations: [{ id: 'de', nodes: 11, captured24h: de, lost24h: de, capitalHeld: true }, { id: 'fr', nodes: 9, captured24h: de, lost24h: de, capitalHeld: true }] });
  await hold.holdReport(rep7([A(), B(), A()], 0)); siteNow += 11 * MIN;
  r = await hold.holdReport(rep7([A(), B(), A()], 0));
  ok(r.events.length === 3, 'baseline: three old undated captures shown');
  r = await hold.holdReport(rep7([A(), B()], 0));
  ok(r.events.length === 2, 'the oldest drops off, nothing new: nothing is held again');
  r = await hold.holdReport(rep7([A(), A(), B()], 1));
  ok(r.events.length === 2 && r.owners.brittany === 'fr', 'old numbering bug: a new capture as an old repeat drops off: the new one is held');
  siteNow += 11 * MIN;
  await hold.holdReport(rep7([A(), B(), A()], 0)); siteNow += 11 * MIN;
  ok((await hold.holdReport(rep7([A(), B(), A()], 0))).events.length === 3, 'steady list released');
  r = await hold.holdReport(rep7([A(), B(), A()], 2));
  ok(r.events.length === 1, 'the reviewer\'s poc: two new and two dropped, the list looks the same but the counts moved: the two newest held');
  r = await hold.holdReport(rep7([A(), B(), A()], 2));
  ok(r.events.length === 1, '... and they stay held on the next look (not re-released)');
  siteNow += 11 * MIN;
  ok((await hold.holdReport(rep7([A(), B(), A()], 2))).events.length === 3, '... shown 11 min later');
  ok(hold.align(['a', 'b', 'a'], ['a', 'b', 'a'], true) === 0 && hold.align(['a', 'b', 'a'], ['b', 'a', 'b'], true) === 1 && hold.align([], ['a'], true) === 1, 'align: the line-ups');

  console.log('battles and after-action reports (no times: first seen)');
  fresh();
  const b4 = { window: 4, node: 'brittany', attacker: 'de', defender: 'fr', deaths: 31, result: 'captured' };
  r = await hold.holdReport(report(siteNow, { battles: [b4] }));
  ok(r.battles.length === 0, 'closed window\'s battle: hidden when first seen (the window just closed)');
  siteNow += 10 * MIN;
  r = await hold.holdReport(report(siteNow, { battles: [b4] }));
  ok(r.battles.length === 1, 'battle shown 10 min after first seen');
  const b5 = { window: 5, node: 'paris', attacker: 'de', defender: 'fr', deaths: 300, result: 'held' };
  r = await hold.holdReport(report(siteNow, { windowOpen: true, battles: [b5, b4] }));
  ok(r.battles.length === 1 && r.battles[0].window === 4, 'a new window\'s fights: the table stays as it was (no shrink, nothing new)');
  r = await hold.holdReport(report(siteNow, { windowOpen: true, battles: [b4] }));
  ok(r.battles.length === 1 && r.battles[0].window === 4, 'window 4 still shown during the next window (the old filter hid it)');
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

  console.log('the rate limiter');
  {
    const RL = require(path.join(ROOT, 'server/rate-limit'));
    let t = 0;
    const res = () => ({ code: 200, h: {}, set(o) { Object.assign(this.h, o); return this; }, status(c) { this.code = c; return this; }, type() { return this; }, send() { return this; } });
    const req = (sock, xff, cf) => ({ headers: Object.assign({}, xff ? { 'x-forwarded-for': xff } : {}, cf ? { 'cf-connecting-ip': cf } : {}), socket: { remoteAddress: sock } });
    const hit = (mw, q) => { const s = res(); let passed = false; mw(q, s, () => { passed = true; }); return passed ? 200 : s.code; };
    let mw = RL.limit({ perMinute: 30, allPerMinute: 600, now: () => t });
    const codes = []; for (let i = 0; i < 35; i++) codes.push(hit(mw, req('9.9.9.9')));
    ok(codes.slice(0, 30).every(c => c === 200) && codes.slice(30).every(c => c === 429), 'per visitor: 30 a minute, then 429');
    t += 60000; ok(hit(mw, req('9.9.9.9')) === 200, 'a minute later: allowed again');
    mw = RL.limit({ perMinute: 30, allPerMinute: 600, now: () => t });
    for (let i = 0; i < 620; i++) hit(mw, req('6.6.6.6'));
    ok(hit(mw, req('1.2.3.4')) === 200, 'one visitor sending 620 requests doesn\'t lock out anyone else (refused requests don\'t count site-wide)');
    for (let i = 0; i < 700; i++) hit(mw, req('10.0.' + (i >> 8) + '.' + (i & 255)));
    ok(hit(mw, req('1.2.3.5')) === 429, 'site-wide cap: 600 allowed requests a minute');
    // who the visitor is (Render: one proxy hop)
    ok(RL.visitor(req('10.1.2.3', '203.0.113.7'), 1) === '203.0.113.7', 'behind one proxy: the address that reached it');
    ok(RL.visitor(req('10.1.2.3', '1.1.1.1, 203.0.113.7'), 1) === '203.0.113.7', 'a made-up X-Forwarded-For entry in front is ignored');
    ok(RL.visitor(req('10.1.2.3', '203.0.113.7', '5.5.5.5'), 1) === '203.0.113.7', 'a made-up CF-Connecting-IP from a non-Cloudflare peer is ignored');
    ok(RL.visitor(req('10.1.2.3', '1.1.1.1, 162.158.1.2', '198.51.100.9'), 1) === '198.51.100.9', 'through Cloudflare (peer in its ranges): CF-Connecting-IP');
    ok(RL.visitor(req('10.1.2.3', '2606:4700::1', '2001:db8::5'), 1) === '2001:db8::5', 'Cloudflare over IPv6 too');
    ok(RL.visitor(req('::ffff:198.51.100.4', '1.1.1.1', '5.5.5.5'), 0) === '198.51.100.4', 'no proxy (0 hops): the connection itself, headers ignored');
    mw = RL.limit({ perMinute: 30, now: () => t });
    for (let i = 0; i < 40; i++) hit(mw, req('10.1.2.3', '203.0.113.7', 'r' + i));
    const old = process.env.TRUST_PROXY_HOPS; process.env.TRUST_PROXY_HOPS = '1';
    let n429 = 0; for (let i = 0; i < 40; i++) if (hit(mw, req('10.1.2.3', '203.0.113.8', '7.7.7.' + i)) === 429) n429++;
    if (old === undefined) delete process.env.TRUST_PROXY_HOPS; else process.env.TRUST_PROXY_HOPS = old;
    ok(n429 === 10, 'rotating a made-up CF-Connecting-IP doesn\'t get past the per-visitor limit');
  }

  console.log('Cache-Control for signed-in visitors (app.js)');
  {
    const { privateWhenSignedIn } = require(path.join(ROOT, 'server/private-cache'));
    const mk = () => { const h = {}; return { h, setHeader(n, v) { h[n.toLowerCase()] = v; } }; };
    let res = mk(); privateWhenSignedIn({ session: { user: { id: 1 } } }, res, () => {}); res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=86400');
    ok(res.h['cache-control'] === 'private, max-age=60', 'signed in: public becomes private (and no stale-while-revalidate)');
    res = mk(); privateWhenSignedIn({ session: {} }, res, () => {}); res.setHeader('Cache-Control', 'public, max-age=60');
    ok(res.h['cache-control'] === 'public, max-age=60', 'signed out: unchanged');
    res = mk(); privateWhenSignedIn({ session: { user: { id: 1 } } }, res, () => {}); res.setHeader('Content-Type', 'public');
    ok(res.h['content-type'] === 'public', 'other headers untouched');
  }

  console.log('war-feed: one fetch at a time, failures remembered, the game\'s clock learned');
  {
    fresh();
    const feed = require(path.join(ROOT, 'server/war-feed'));
    const realFetch = global.fetch; let fetches = 0, failing = false;
    const OFFSET = 37 * MIN; // the game's clock 37 minutes ahead of the site's
    global.fetch = async () => { fetches++; await new Promise(r => setTimeout(r, 20)); if (failing) throw new Error('down');
      return { ok: true, status: 200, json: async () => ({ ok: true, now: siteNow + OFFSET, nations: [], owners: {}, events: [], battles: [], lines: [] }) }; };
    process.env.WAR_FEED_URL = 'https://feed.invalid';
    await Promise.all([feed.report(), feed.report(), feed.report()]);
    ok(fetches === 1, 'three visitors at once: one fetch');
    ok(hold.gameNow() === siteNow + OFFSET, 'the game\'s clock learned from the report (offset 37 min)');
    const card = to => ({ name: 'Notch', nation: 'germany', window: 4, to, kills: 1 });
    ok(await hold.holdNight('u', card(siteNow + 30 * MIN)) === null, 'a card whose window ended 7 game-minutes ago (30 site-minutes ahead): held');
    ok(!!(await hold.holdNight('u', card(siteNow + 20 * MIN))), 'ended 17 game-minutes ago: shown');
    failing = true; fetches = 0;
    let errs = 0; for (let i = 0; i < 3; i++) { try { await feed.borders(); } catch (e) { errs++; } }
    ok(fetches === 1 && errs === 3, 'game down: one fetch, then the failure is remembered (15 s)');
    global.fetch = realFetch; delete process.env.WAR_FEED_URL; T.setGameOffset(0);
  }

  console.log('service records and night cards, end to end');
  {
    fresh();
    const comp = require(path.join(ROOT, 'server/companion'));
    const SR = require(path.join(ROOT, 'server/service-records')), NC = require(path.join(ROOT, 'server/night-card'));
    const clear = () => { SR._clearCache(); NC._clearCache(); };
    let rec = { name: 'Notch', nation: 'germany', alive: true, rank: 'Corporal', regiment: 'BEF', class: 'Rifleman', kills: 5, captures: 2, deaths: 3, daysSurvived: 3, medalIds: [] };
    const cardNow = () => ({ name: 'Notch', nation: 'germany', window: 4, from: siteNow - 2 * 86400e3, to: siteNow - 2 * 86400e3 + 180 * MIN,
      rank: rec.alive ? rec.rank : null, regiment: rec.alive ? rec.regiment : '', foughtAt: ['ypres'], kills: 1, medals: [], deaths: 2 }); // the game: CURRENT rank
    comp.isLive = () => true;
    comp.publicGet = async p => p.startsWith('/api/public/records/') ? rec : p.startsWith('/api/public/night/') ? cardNow() : null;
    comp.me = async id => id === 'owner' ? { uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5' } : null;
    let found = await SR.lookup('Notch');
    ok(found.record.pending && found.record.nationName === 'Germany' && found.record.kills === undefined, 'first lookup: pending, name and nation only');
    const ejs = require(path.join(ROOT, 'node_modules/ejs'));
    const html = await ejs.renderFile(path.join(ROOT, 'views/new/soldier.ejs'), { q: 'Notch', rec: found.record, account: found.account, fights: [],
      t: k => k, lp: '', lang: 'en', user: null, isOwner: false, isAdmin: false, isStaff: false, media: {}, _url: '/soldier/Notch', langSwitchUrl: '/fr/soldier/Notch' });
    ok(/Records show 10 minutes behind; check back shortly/.test(html) && !/Kills/.test(html) && !/Corporal/.test(html), 'the page: "Records show 10 minutes behind", no stats, no rank');
    let c = (await NC.lookup('Notch', 4, null)).card;
    ok(c && c.rank === undefined && c.regiment === undefined, 'someone else\'s card while the record is pending: no rank, no regiment');
    siteNow += 11 * MIN; clear();
    c = (await NC.lookup('Notch', 4, null)).card;
    ok(c.rank === 'Corporal' && c.regiment === 'BEF', '11 min later: rank and regiment from the held record');
    rec = Object.assign({}, rec, { alive: false, rank: null, regiment: '', deaths: 4 }); // he dies
    siteNow += 1 * MIN; clear();
    c = (await NC.lookup('Notch', 4, null)).card;
    ok(c.rank === 'Corporal' && c.regiment === 'BEF' && c.deaths === undefined, 'he died a minute ago: someone else\'s card still shows his rank (no death signal)');
    found = await SR.lookup('Notch');
    ok(found.record.alive === true && found.record.rank === 'Corporal', '... and so does his service record');
    c = (await NC.lookup('Notch', 4, 'owner')).card;
    ok(c.own && c.rank === null && c.deaths === 2, 'his own card stays live');
    siteNow += 11 * MIN; clear();
    c = (await NC.lookup('Notch', 4, null)).card;
    ok(c.rank === undefined, '10 min after his death: no rank on the card');
  }

  console.log('the database store (pg temp tables, dropped with the connection)');
  if (process.env.DATABASE_URL || require('fs').existsSync(path.join(ROOT, '.env'))) {
    require(path.join(ROOT, 'node_modules/dotenv')).config({ path: path.join(ROOT, '.env') });
    const { Client } = require(path.join(ROOT, 'node_modules/pg'));
    const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      const st = hold.makePgStore({ db: client, prefix: 'pg_temp.s82t_' });
      T.useStore(st);
      const t0 = siteNow;
      ok(!(await hold.released('pg:key')), 'pg: a new key is held');
      await new Promise(r => setTimeout(r, 200));
      siteNow += 11 * MIN; T.restart();
      ok(await hold.released('pg:key'), 'pg: after a "restart", the first-seen time comes back from the table');
      await hold.holdRecord('pgu', { a: 1 }); await new Promise(r => setTimeout(r, 200));
      siteNow += 11 * MIN; T.restart();
      ok((await hold.holdRecord('pgu', { a: 2 })).record.a === 1, 'pg: record versions saved and read back');
      await new Promise(r => setTimeout(r, 200));
      const rows = (await client.query(`SELECT count(*)::int AS n FROM pg_temp.s82t_hold_versions WHERE name = 'rec:pgu'`)).rows[0].n;
      ok(rows === 2, 'pg: versions table holds the released and the newer version');
      ok(t0 > 0, 'pg: done');
    } catch (e) { ok(false, 'pg store: ' + e.message); }
    finally { await client.end().catch(() => {}); }
    const slow = hold.makePgStore({ db: { query: () => new Promise(() => {}) } });
    T.useStore(slow);
    const t1 = Date.now(); const rel = await hold.released('slow:key');
    ok(!rel && Date.now() - t1 < 3000, 'a hanging database: 2 s timeout, fails closed (held)');
  } else console.log('  skip (no DATABASE_URL)');
  {
    let calls = 0, failing = true;
    T.useStore({ async init() { calls++; if (failing) throw new Error('down'); return [['k', siteNow - 20 * MIN]]; }, async saveSeen() {}, async loadVersions() { return []; }, async saveVersion() {}, async dropVersions() {} });
    ok(!(await hold.released('k')), 'store down at start: held');
    failing = false; siteNow += 30 * 1000;
    await hold.released('k'); ok(calls === 1, 'not retried before a minute');
    siteNow += 31 * 1000;
    ok(await hold.released('k') && calls === 2, 'retried after a minute; the database\'s older first-seen time wins');
  }

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
