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
  const eventRes = await db.query(
    `SELECT * FROM events ORDER BY created_at DESC LIMIT 1`
  );
  res.render('home', { event: eventRes.rows[0] || null });
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

  res.render('staff', { staffRoles, isStaff, formatDesc });
});
router.get('/rules', (req, res) => res.render('rules'));

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
