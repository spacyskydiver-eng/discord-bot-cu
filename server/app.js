const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const pool = require('../db');
const access = require('./access');
const MEDIA = require('./site-media.config');
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
    // decided on the server for every request; templates and pages only ever see the result
    res.locals.isOwner = access.isOwner(req.session.user);
    res.locals.isAdmin = res.locals.isOwner;
    res.locals.isStaff = await access.isStaff(req.session.user);
    res.locals.media = MEDIA;
    res.locals.staffRoleId = null;
    res.locals.designPreview = true;
    res.locals._url = req.originalUrl;
    next();
  });

  // ── Maintenance mode: only staff get past this. /auth stays open so staff can sign in.
  app.use(async (req, res, next) => {
    if (req.path.startsWith('/auth') || res.locals.isStaff) return next();
    if (!(await access.maintenanceOn())) return next();
    res.set('Retry-After', '3600');
    if (req.path.startsWith('/api/') || req.path.startsWith('/data/') || req.xhr) return res.status(503).json({ error: 'maintenance' });
    res.status(503).render('maintenance', { user: res.locals.user });
  });

  app.use('/', require('./routes/pages'));
  app.use('/', require('./routes/testers'));
  app.use('/', require('./routes/leaders'));
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

  require('./testers').startSweeps();
  require('./leaders').startAutoExport();

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on port ${port}`));
};
