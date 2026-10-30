// VIP for the game servers, in the control centre (mounted by routes/admin.js behind requireOwner):
// what the endpoint returns for any UUID, Minecraft name or Discord ID; a test change notification;
// the log of notifications sent and their responses; and everyone with a VIP role and their link.
const express = require('express');
const router = express.Router();
const db = require('../../db');
const vip = require('../vip');
const links = require('../minecraft-links');
const { javaAccount } = require('../minecraft');

function origin(req, res, next) {
  const o = req.get('origin');
  if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).end();
  next();
}
const wrap = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (e) { next(e); } };
const back = (q, msg) => '/admin/vip?' + new URLSearchParams({ ...(q ? { q } : {}), ...(msg ? { msg } : {}) });

// a UUID, a linked Minecraft name, a Discord ID, or any Minecraft name Mojang knows
async function resolve(q) {
  q = String(q || '').trim();
  if (!q) return null;
  if (links.isUuid(q)) return { uuid: links.plainUuid(q), how: 'UUID' };
  if (/^\d{15,20}$/.test(q)) {
    const l = await links.ofDiscord(q);
    return l ? { uuid: l.mc_uuid, how: 'Discord ID ' + q } : { uuid: null, how: 'Discord ID ' + q, note: 'That Discord account has no Minecraft account linked.' };
  }
  const l = (await db.query(`SELECT mc_uuid FROM minecraft_links WHERE lower(mc_name) = lower($1)`, [q])).rows[0];
  if (l) return { uuid: l.mc_uuid, how: 'linked Minecraft name ' + q };
  try {
    const acc = await javaAccount(q);
    return acc ? { uuid: links.plainUuid(acc.uuid), how: 'Minecraft name ' + acc.name + ' (from Mojang)' } : { uuid: null, how: q, note: 'Not a UUID, Discord ID or Minecraft name.' };
  } catch (e) { return { uuid: null, how: q, note: "Couldn't reach Mojang to look that name up." }; }
}

router.get('/', wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const q = String(req.query.q || '');
  let result = null;
  const r = await resolve(q);
  if (r && r.uuid) {
    try {
      const out = await vip.lookup(r.uuid);
      result = { ...r, dashed: links.dashed(r.uuid), status: 200, body: { tier: out.tier, expires: out.expires }, why: out.why };
    } catch (e) { result = { ...r, dashed: links.dashed(r.uuid), status: 503, body: { error: 'discord unavailable' }, why: { error: e.message } }; }
  } else if (r) result = r;
  res.render('new/admin-vip', {
    q, result, msg: req.query.msg || null, C: vip.C, TIER_NAME: vip.TIER_NAME,
    log: await vip.recentNotifications(100), members: await vip.vipMembers(),
  });
}));

router.post('/notify', origin, wrap(async (req, res) => {
  const uuid = String(req.body.uuid || '');
  if (!links.isUuid(uuid)) return res.redirect(back(req.body.q, 'Not a UUID.'));
  if (!vip.C.secret) return res.redirect(back(req.body.q, 'VIP_API_SECRET is not set, so nothing can be sent.'));
  if (!vip.C.servers.length) return res.redirect(back(req.body.q, 'No game servers are set (VIP_SERVER_URLS).'));
  const r = await vip.testNotify(uuid, req.session.user.username);
  res.redirect(back(req.body.q, r.map(x => `${x.server}: ${x.ok ? 'OK' : 'failed'}${x.status ? ' (' + x.status + ')' : ''}${x.ok ? '' : ' ' + x.response}`).join(' · ')));
}));

// take a disputed link off someone; if they were VIP the servers are told the account lost it
router.post('/unlink', origin, wrap(async (req, res) => {
  const id = String(req.body.discord_id || '');
  const old = await links.remove(id);
  if (old) vip.linkChanged(id, null, old).catch(e => console.error('[vip] unlink', e.message));
  res.redirect(back(req.body.q, old ? 'Link removed. They can link an account again on the site.' : 'They had no link.'));
}));

module.exports = router;
