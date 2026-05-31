const express = require('express');
const router = express.Router();
const db = require('../../db');

router.get('/', async (req, res) => {
  const eventRes = await db.query(
    `SELECT * FROM events ORDER BY created_at DESC LIMIT 1`
  );
  res.render('home', { event: eventRes.rows[0] || null });
});

router.get('/staff', (req, res) => res.render('staff'));
router.get('/rules', (req, res) => res.render('rules'));

module.exports = router;
