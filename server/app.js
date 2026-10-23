const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const pool = require('../db');
const fs = require('fs');

const LOCALES = {};
for (const lang of ['en', 'fr']) {
  LOCALES[lang] = JSON.parse(fs.readFileSync(path.join(__dirname, '../locales', `${lang}.json`), 'utf8'));
}

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

  // Language is determined SOLELY by URL prefix.
  // /fr/... → French, everything else → English.
  // No session persistence — this runs fresh on every request.
  app.use((req, res, next) => {
    if (req.path === '/fr' || req.path.startsWith('/fr/')) {
      req._lang = 'fr';
      req.url = req.url.slice(3) || '/';
    } else {
      req._lang = 'en';
    }
    next();
  });

  app.use(async (req, res, next) => {
    const lang = req._lang;
    res.locals.lang = lang;
    res.locals.lp   = lang === 'fr' ? '/fr' : '';
    res.locals.t    = (key) => (LOCALES[lang][key] !== undefined ? LOCALES[lang][key] : LOCALES['en'][key] ?? key);

    const origUrl = req.originalUrl;
    res.locals.langSwitchUrl = lang === 'fr'
      ? (origUrl.replace(/^\/fr/, '') || '/')
      : '/fr' + origUrl;

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

  // ── Site lockdown: staff-only access ──────────────────────────────────────
  app.use((req, res, next) => {
    // Always allow auth routes so login/logout flow works
    if (req.path.startsWith('/auth')) return next();
    const isStaff = res.locals.isAdmin || res.locals.isStaffAccess;
    if (isStaff) return next();
    // Not logged in at all — send to Discord login
    if (!res.locals.user) {
      return res.redirect('/auth/discord');
    }
    // Logged in but no staff role — show locked page
    res.status(403).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CUE — Staff Only</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,650&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:#080B16;color:#E8EBF8;font-family:'Inter',sans-serif;
  background-image:radial-gradient(900px 340px at 50% -60px,rgba(139,156,255,.15),transparent 72%)}
.card{max-width:480px;width:100%;margin:24px;text-align:center;padding:48px 36px;
  background:#0D1120;border:1px solid rgba(140,155,255,.14);border-radius:20px;
  box-shadow:0 20px 60px rgba(0,0,0,.6)}
.lock{font-size:40px;margin-bottom:20px;opacity:.6}
h1{font-family:'Fraunces',Georgia,serif;font-size:2rem;font-weight:650;margin-bottom:12px;letter-spacing:-.02em}
p{color:#A7AFD2;line-height:1.65;font-size:15px;margin-bottom:8px}
.user{font-size:13px;color:#6E769C;margin-top:18px}
.btn{display:inline-block;margin-top:24px;padding:11px 22px;background:rgba(139,156,255,.1);
  border:1px solid rgba(139,156,255,.3);border-radius:10px;color:#8B9CFF;
  font-family:inherit;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;
  transition:background .12s,border-color .12s}
.btn:hover{background:rgba(139,156,255,.18);border-color:rgba(139,156,255,.5)}
</style>
</head>
<body>
<div class="card">
  <div class="lock">&#128274;</div>
  <h1>Staff Access Only</h1>
  <p>The CUE website is currently closed to the public.</p>
  <p>Only members with the staff role can access it right now.</p>
  <p class="user">Logged in as <strong>${res.locals.user.username}</strong> &mdash; this account does not have staff access.</p>
  <a href="/auth/logout" class="btn">Sign out</a>
</div>
</body>
</html>`);
  });

  app.use('/', require('./routes/pages'));
  app.use('/auth', require('./routes/auth'));
  app.use('/apply', require('./routes/apply'));
  app.use('/apply-hundred', require('./routes/apply-hundred'));
  app.use('/apply-nation-leader', require('./routes/apply-nation-leader'));
  app.use('/apply-news-reporter', require('./routes/apply-news-reporter'));
  app.use('/admin', require('./routes/admin'));

  // Show actual errors instead of blank 500 page
  app.use((err, req, res, next) => {
    console.error('[ERROR]', req.method, req.path, err);
    res.status(500).send('<pre style="padding:20px;font-family:monospace">' +
      '<b>Server Error</b>\n' + req.method + ' ' + req.path + '\n\n' +
      (err && err.stack ? err.stack : String(err)) + '</pre>');
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on port ${port}`));
};
