const express = require('express');
const path = require('path');
const db = require('../db');

module.exports = function startDashboard() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Simple password check middleware for API routes
  function auth(req, res, next) {
    const { guild_id, password } = req.body || req.query;
    if (!guild_id) return res.status(400).json({ error: 'guild_id required' });
    db.query(`SELECT dashboard_password FROM guild_config WHERE guild_id = $1`, [guild_id])
      .then(r => {
        if (!r.rows.length) return res.status(404).json({ error: 'Guild not found. Bot must be in the server first.' });
        if (r.rows[0].dashboard_password !== password) return res.status(401).json({ error: 'Wrong password' });
        req.guildId = guild_id;
        next();
      })
      .catch(err => res.status(500).json({ error: err.message }));
  }

  // Get full config
  app.post('/api/config', auth, async (req, res) => {
    const guildId = req.guildId;
    const [cfg, levels] = await Promise.all([
      db.query(`SELECT xp_per_message, xp_cooldown_seconds, level_up_channel_id FROM guild_config WHERE guild_id = $1`, [guildId]),
      db.query(`SELECT level_number, level_name, xp_required FROM level_config WHERE guild_id = $1 ORDER BY level_number`, [guildId])
    ]);
    res.json({ config: cfg.rows[0], levels: levels.rows });
  });

  // Save XP settings
  app.post('/api/config/xp', auth, async (req, res) => {
    const { xp_per_message, xp_cooldown_seconds, level_up_channel_id } = req.body;
    await db.query(
      `UPDATE guild_config SET xp_per_message = $1, xp_cooldown_seconds = $2, level_up_channel_id = $3 WHERE guild_id = $4`,
      [xp_per_message, xp_cooldown_seconds, level_up_channel_id || null, req.guildId]
    );
    res.json({ ok: true });
  });

  // Save all levels (replaces existing)
  app.post('/api/config/levels', auth, async (req, res) => {
    const { levels } = req.body;
    await db.query(`DELETE FROM level_config WHERE guild_id = $1`, [req.guildId]);
    for (const lv of levels) {
      await db.query(
        `INSERT INTO level_config (guild_id, level_number, level_name, xp_required) VALUES ($1, $2, $3, $4)`,
        [req.guildId, lv.level_number, lv.level_name, lv.xp_required]
      );
    }
    res.json({ ok: true });
  });

  // Change dashboard password
  app.post('/api/config/password', auth, async (req, res) => {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 4) return res.status(400).json({ error: 'Password too short' });
    await db.query(`UPDATE guild_config SET dashboard_password = $1 WHERE guild_id = $2`, [new_password, req.guildId]);
    res.json({ ok: true });
  });

  // Leaderboard (public, no password needed)
  app.get('/api/leaderboard', async (req, res) => {
    const { guild_id } = req.query;
    if (!guild_id) return res.status(400).json({ error: 'guild_id required' });
    const r = await db.query(
      `SELECT discord_id, xp, level FROM user_xp WHERE guild_id = $1 ORDER BY xp DESC LIMIT 20`,
      [guild_id]
    );
    res.json(r.rows);
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Dashboard running on port ${port}`));
};
