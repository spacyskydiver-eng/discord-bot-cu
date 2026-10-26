// Tester applications: public counts, the applicant's own status, applying and withdrawing.
// Nothing here returns another applicant's details; the staff roster is staff-only.
const express = require('express');
const router = express.Router();
const testers = require('../testers');
const { javaAccount } = require('../minecraft');

const publicSession = s => ({ id: s.id, title: s.title, starts_at: s.starts_at, duration_minutes: s.duration_minutes, slots: s.slots, team_size: s.team_size, open: s.open, taken: s.taken, waitlisted: s.waitlisted });

// JSON posts from this site only
function sameOrigin(req, res, next) {
  const o = req.get('origin');
  if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).json({ error: 'Forbidden' });
  if (!req.is('application/json')) return res.status(415).json({ error: 'Expected JSON' });
  next();
}
function signedIn(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Sign in with Discord first.' });
  next();
}

router.get('/api/testers', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const sessions = (await testers.upcomingSessions()).map(publicSession);
    const me = req.session.user ? await testers.mine(req.session.user.id) : null;
    if (me && me.applications.some(a => a.status === 'accepted')) me.discord = await testers.memberState(req.session.user.id);
    res.json({ sessions, me, signedIn: !!req.session.user });
  } catch (e) { next(e); }
});

router.post('/api/testers/apply', sameOrigin, signedIn, async (req, res, next) => {
  try {
    const b = req.body || {};
    const sessionId = parseInt(b.session_id, 10);
    if (b.attend !== 'yes' || b.full_hour !== 'yes') return res.status(400).json({ error: 'needs-both' });
    const agreed = Array.isArray(b.agree) ? b.agree.map(Number) : [];
    if (![1, 2, 3, 4, 5].every(n => agreed.includes(n))) return res.status(400).json({ error: 'Please tick all five agreements.' });
    let mc;
    try { mc = await javaAccount(b.mc_name); } catch (e) { return res.status(503).json({ error: "We couldn't check your Minecraft username just now. Please try again in a minute." }); }
    if (!mc) return res.status(400).json({ error: "That isn't a Minecraft Java username we can find. Check the spelling and try again." });
    const r = await testers.apply(sessionId, req.session.user, mc);
    res.json({ status: r.status, already: !!r.already, role: r.role || null, mc_name: mc.name });
  } catch (e) {
    if (e instanceof testers.ApplyError) return res.status(409).json({ error: e.message });
    next(e);
  }
});

router.post('/api/testers/withdraw', sameOrigin, signedIn, async (req, res, next) => {
  try { res.json(await testers.withdraw(parseInt(req.body.session_id, 10), req.session.user.id)); } catch (e) { next(e); }
});

router.post('/api/testers/interest', sameOrigin, signedIn, async (req, res, next) => {
  try { await testers.joinInterest(req.session.user); res.json({ ok: true }); } catch (e) { next(e); }
});

// for someone accepted before they joined the Discord server
router.post('/api/testers/retry-role', sameOrigin, signedIn, async (req, res, next) => {
  try { res.json(await testers.syncRole(req.session.user.id)); } catch (e) { res.status(502).json({ error: "We couldn't reach Discord. Please try again in a minute." }); }
});

// read-only roster for staff; anyone else gets the same 404 as an unknown URL
router.get('/api/testers/roster', async (req, res, next) => {
  if (!res.locals.isStaff) return next();
  try { res.set('Cache-Control', 'private, no-store'); res.json(await testers.roster()); } catch (e) { next(e); }
});

module.exports = router;
