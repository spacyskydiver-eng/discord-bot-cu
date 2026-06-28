const express = require('express');
const router = express.Router();
const db = require('../../db');

function formatDesc(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\n/g, '<br>');
}

router.get('/', async (req, res) => {
  const eventsRes = await db.query(`SELECT * FROM events WHERE is_open = true ORDER BY created_at DESC`);
  const openEventCount = eventsRes.rows.length;
  res.render('new/home', { openEventCount, openAppCount: openEventCount });
});

router.get('/staff', async (req, res) => {
  const staffRoles = (await db.query(
    `SELECT * FROM staff_roles ORDER BY display_order ASC, id ASC`
  )).rows;

  // Get configured staff Discord role ID
  const configRes = await db.query(`SELECT staff_role_id FROM guild_config LIMIT 1`);
  const staffRoleId = configRes.rows[0]?.staff_role_id || null;

  const userRoleIds = req.session.user?.guildRoleIds || [];
  const userId = req.session.user?.id || null;
  const isAdmin = res.locals.isAdmin;

  // Check manual staff access grant (by Discord ID entered in admin panel)
  let hasManualAccess = false;
  if (userId) {
    const accessRes = await db.query(`SELECT 1 FROM staff_access WHERE discord_id = $1`, [userId]);
    hasManualAccess = accessRes.rows.length > 0;
  }

  const isStaff = isAdmin || hasManualAccess || (staffRoleId && userRoleIds.includes(staffRoleId));

  res.render('new/staff', { staffRoles, isStaff, formatDesc });
});
router.get('/rules', (req, res) => res.render('rules'));

// ── New design routes (designPreview only) ──────────────────────────────────

router.get('/events', async (req, res) => {
  const events = (await db.query(`SELECT * FROM events ORDER BY event_date ASC NULLS LAST, created_at DESC`)).rows;
  res.render('new/events', { events });
});

router.get('/events/:id', async (req, res) => {
  const evRes = await db.query(`SELECT * FROM events WHERE id = $1`, [req.params.id]);
  if (!evRes.rows.length) return res.redirect('/events');
  res.render('new/event', { event: evRes.rows[0] });
});

router.get('/applications', async (req, res) => {
  const events = (await db.query(`SELECT * FROM events ORDER BY is_open DESC, event_date ASC NULLS LAST`)).rows;
  let userApp = null;
  if (req.session.user) {
    const appRes = await db.query(
      `SELECT status, review_stage FROM structured_applications WHERE discord_id = $1`,
      [req.session.user.id]
    );
    userApp = appRes.rows[0] || null;
  }
  res.render('new/applications', { events, userApp });
});

router.get('/store', (req, res) => {
  const success = req.query.success === '1';
  res.render('new/store', { success });
});

router.post('/store/checkout', async (req, res) => {
  const { package_id, username } = req.body;
  if (!package_id || !username) return res.status(400).json({ error: 'Missing package or username' });

  const IDENT = process.env.TEBEX_PUBLIC_TOKEN;
  const base = `https://headless.tebex.io/api/accounts/${IDENT}`;
  const host = `${req.protocol}://${req.get('host')}`;

  try {
    const basketRes = await fetch(`${base}/baskets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        return_url: `${host}/store`,
        complete_url: `${host}/store?success=1`
      })
    });
    const basketData = await basketRes.json();
    const basketIdent = basketData.data?.ident;
    if (!basketIdent) return res.status(500).json({ error: 'Could not create basket', detail: basketData });

    await fetch(`${base}/baskets/${basketIdent}/packages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: parseInt(package_id), quantity: 1 })
    });

    res.json({ basket_ident: basketIdent, checkout_url: basketData.data?.links?.checkout });
  } catch (err) {
    console.error('Tebex checkout error:', err);
    res.status(500).json({ error: 'Checkout unavailable, please try again' });
  }
});

// Design preview toggle — only works for admins
router.get('/design-preview/on', (req, res) => {
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(s => s.trim());
  if (req.session.user && adminIds.includes(req.session.user.id)) {
    req.session.designPreview = true;
  }
  res.redirect(req.query.return || '/');
});

router.get('/design-preview/off', (req, res) => {
  req.session.designPreview = false;
  res.redirect(req.query.return || '/');
});

module.exports = router;
