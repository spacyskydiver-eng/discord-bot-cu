const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const pool = require('../db');

module.exports = function startServer() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));
  app.use(express.static(path.join(__dirname, '../public')));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(session({
    store: new pgSession({ pool, tableName: 'sessions' }),
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
  }));

  // Make user available in all views
  app.use(async (req, res, next) => {
    res.locals.user = req.session.user || null;
    const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(s => s.trim());
    res.locals.isAdmin = req.session.user ? adminIds.includes(req.session.user.id) : false;
    res.locals.isStaffAccess = false;
    if (req.session.user && !res.locals.isAdmin) {
      try {
        const row = (await pool.query(
          `SELECT 1 FROM staff_access WHERE discord_id = $1`, [req.session.user.id]
        )).rows[0];
        res.locals.isStaffAccess = !!row;
      } catch (_) {}
    }
    res.locals.staffRoleId = null;
    res.locals.designPreview = true;
    res.locals._url = req.originalUrl;
    next();
  });

  app.use('/', require('./routes/pages'));
  app.use('/auth', require('./routes/auth'));
  app.use('/apply', require('./routes/apply'));
  app.use('/admin', require('./routes/admin'));

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on port ${port}`));
};
