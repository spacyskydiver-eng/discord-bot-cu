const express = require('express');
const router = express.Router();
const db = require('../../db');

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

  res.render('staff', { staffRoles, isStaff });
});
router.get('/rules', (req, res) => res.render('rules'));

module.exports = router;
