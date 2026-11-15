// The event-day dashboard for staff (S29): one page with what staff need while the war runs. Real data where the site
// has it (the war windows, bug reports, applications, shared Minecraft accounts); players online and mod-lock refusals
// come from the game's control feed (GAME_CONTROL_URL) and are sample data, clearly marked, until it's set.
const express = require('express');
const router = express.Router();
const db = require('../../db');

function staff(req, res, next) { if (!res.locals.isStaff) return next('router'); next(); }
const wrap = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (e) { next(e); } };
const NATIONS = require('../nations').NATIONS;

// the game's side: { nations: [{ id, online, shard }], shards: [{ name, online, tps }], modlock: [{ at, player, reason }] }
async function game() {
  const url = process.env.GAME_CONTROL_URL;
  if (url) {
    try {
      const r = await fetch(url.replace(/\/$/, '') + '/control/v1/dashboard', { headers: { 'X-Greatwar-Control': process.env.GAME_CONTROL_SECRET || '' } /* the control API's own header and secret (ControlApi), not the web API's (S-own-20) */, signal: AbortSignal.timeout(5000) });
      if (r.ok) return Object.assign({ sample: false }, await r.json());
      return { sample: false, error: 'game feed ' + r.status, nations: [], shards: [], modlock: [] };
    } catch (e) { return { sample: false, error: e.message, nations: [], shards: [], modlock: [] }; }
  }
  const n = NATIONS.map((x, i) => ({ id: x.id, online: [34, 41, 38, 29, 52, 27, 31, 12][i], shard: x.id }));
  return { sample: true, nations: n, shards: [...n.map(x => ({ name: x.id, online: x.online, tps: 20 })), { name: 'neutral', online: 6, tps: 20 }],
    modlock: [{ at: Date.now() - 12 * 60e3, player: 'ExamplePlayer', reason: 'an extra mod: a minimap' }, { at: Date.now() - 40 * 60e3, player: 'AnotherOne', reason: 'a resource pack' }] };
}

router.get('/staff/dashboard', staff, wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const ev = require('../cue-events')().find(e => e.windows) || { windows: [] }, now = Date.now() / 1000;
  const next = ev.windows.find(w => w.end > now) || null, open = ev.windows.find(w => w.start <= now && w.end > now) || null;
  const q = async (sql, args) => { try { return (await db.query(sql, args)).rows; } catch (e) { return []; } };
  const bugs = { open: (await q(`SELECT count(*)::int AS n FROM bug_reports WHERE status = 'new'`))[0]?.n || 0,
    latest: await q(`SELECT id, discord_name, mc_name, left(happened, 120) AS happened, extract(epoch from created_at)::bigint AS at FROM bug_reports WHERE status = 'new' ORDER BY created_at DESC LIMIT 6`) };
  let apps = null; try { apps = await require('../gw-apply').overview(); } catch (e) { /* none */ }
  const testers = (await q(`SELECT count(*) FILTER (WHERE status = 'accepted')::int AS accepted, count(*) FILTER (WHERE status = 'waitlisted')::int AS waitlisted FROM tester_applications`))[0] || {};
  let shared = []; try { shared = await require('../minecraft-links').shared(); } catch (e) { /* none */ }
  res.render('new/staff-dashboard', { g: await game(), next, open, truce: ev.truce, bugs, apps, testers, shared, NATIONS, isOwner: res.locals.isOwner });
}));

module.exports = router;
