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
  const sessions = session({
    store: new pgSession({ pool, tableName: 'sessions' }),
    // never a known fallback: without SESSION_SECRET each start gets its own random secret (everyone signs in again)
    secret: process.env.SESSION_SECRET || (console.error('[session] SESSION_SECRET is not set; using a random one for this run'), require('crypto').randomBytes(32).toString('hex')),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
  });
  app.use(express.static(path.join(__dirname, '../public')));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(sessions);
  app.use(require('./private-cache').privateWhenSignedIn); // S82: never a shared cache for a signed-in visitor's page

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
    res.locals.designPreview = !!req.session.designPreview && res.locals.isOwner;
    res.locals._url = req.originalUrl;
    next();
  });

  // ── Maintenance mode: only staff get past this. /auth stays open so staff can sign in.
  app.use(async (req, res, next) => {
    // the game servers' VIP lookup has its own secret and must keep working during maintenance
    if (req.path.startsWith('/auth') || req.path.startsWith('/api/vip/') || req.path.startsWith('/campaign-map/s/') || res.locals.isStaff) return next();
    if (!(await access.maintenanceOn())) return next();
    res.set('Retry-After', '3600');
    if (req.path.startsWith('/api/') || req.path.startsWith('/data/') || req.xhr) return res.status(503).json({ error: 'maintenance' });
    res.status(503).render('maintenance', { user: res.locals.user });
  });

  // same-origin check for every POST (S-own-20): a browser sending a form from another site carries its Origin and is
  // refused; server-to-server calls (the game's VIP lookup) send no Origin and are unaffected
  app.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const o = req.get('origin');
    if (!o || o === `${req.protocol}://${req.get('host')}` || o === `https://${req.get('host')}`) return next();
    res.status(403).send('Cross-site request refused.');
  });
  app.use('/', require('./routes/pages'));
  app.use('/', require('./routes/updates'));
  app.use('/', require('./routes/testers'));
  app.use('/', require('./routes/leaders'));
  app.use('/', require('./routes/gw-apply').router);
  app.use('/', require('./routes/bug-report'));
  app.use('/', require('./routes/staff-dashboard'));
  app.use('/', require('./routes/war-office'));
  app.use('/', require('./routes/staff-apply'));
  app.use('/', require('./routes/vip'));
  app.use('/', require('./routes/campaign-map-share'));
  app.use('/auth', require('./routes/auth'));
  app.use('/apply', require('./routes/apply'));
  app.use('/apply-hundred', require('./routes/apply-hundred'));
  app.use('/apply-nation-leader', require('./routes/apply-nation-leader'));
  app.use('/apply-news-reporter', require('./routes/apply-news-reporter'));
  app.use('/admin', require('./routes/admin'));

  // Show actual errors instead of blank 500 page
  // the details (a stack trace names files, queries and settings) are for staff only; everyone else gets a plain page (S74)
  app.use((err, req, res, next) => {
    console.error('[ERROR]', req.method, req.path, err);
    if (!res.locals.isStaff) return res.status(500).send('<pre style="padding:20px;font-family:monospace">Something went wrong on our side. Please try again in a minute.</pre>');
    res.status(500).send('<pre style="padding:20px;font-family:monospace">' +
      '<b>Server Error</b>\n' + req.method + ' ' + req.path + '\n\n' +
      (err && err.stack ? err.stack : String(err)) + '</pre>');
  });

  require('./testers').startSweeps();
  require('./front-poster').start();   // does nothing while site setting front_post is off
  require('./call-to-line').start();   // S39: does nothing while site setting call_to_line is off
  require('./nation-roles').start();   // does nothing while site setting nation_roles is off
  require('./leaders').startAutoExport();
  require('./minecraft-links').start();

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on port ${port}`));
};
