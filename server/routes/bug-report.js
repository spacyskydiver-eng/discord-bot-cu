// /report for testers, and the staff page that reads the reports.
const express = require('express');
const multer = require('multer');
const router = express.Router();
const bugs = require('../bug-reports');
const links = require('../minecraft-links');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: bugs.MAX_BYTES, files: bugs.MAX_FILES } });
function origin(req, res, next) {
  const o = req.get('origin');
  if (o && o !== `${req.protocol}://${req.get('host')}` && o !== `https://${req.get('host')}`) return res.status(403).end();
  next();
}
function staff(req, res, next) { if (!res.locals.isStaff) return next('router'); next(); }
const wrap = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (e) { next(e); } };

async function page(req, res, extra = {}) {
  const link = req.session.user ? await links.ofDiscord(req.session.user.id).catch(() => null) : null;
  res.set('Cache-Control', 'private, no-store');
  res.render('new/bug-report', Object.assign({ mcName: link ? link.mc_name : '', f: {}, error: null, sent: req.query.sent || null, B: bugs }, extra));
}
router.get('/report', wrap((req, res) => page(req, res)));
router.post('/report', origin, (req, res, next) => {
  if (!req.session.user) return res.redirect('/auth/discord?return=/report');
  upload.array('files', bugs.MAX_FILES)(req, res, err => {
    if (err) return page(req, res, { f: req.body || {}, error: err.code === 'LIMIT_FILE_SIZE' ? 'One of those files is over 10 MB. Zip it, or attach just the newest log.' : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? `Up to ${bugs.MAX_FILES} files per report.` : 'The upload failed. Please try again.' }).catch(next);
    bugs.submit(req.session.user, req.body || {}, req.files).then(id => res.redirect('/report?sent=' + id))
      .catch(e => e instanceof bugs.BugReportError ? page(req, res, { f: req.body || {}, error: e.message }) : next(e));
  });
});

router.get('/staff/bug-reports', staff, wrap(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.render('new/staff-bug-reports', { reports: await bugs.list() });
}));
router.get('/staff/bug-reports/:id(\\d+)/files/:fid(\\d+)', staff, wrap(async (req, res) => {
  const f = await bugs.file(+req.params.id, +req.params.fid);
  if (!f) return res.status(404).end();
  res.set('Cache-Control', 'private, no-store').set('Content-Disposition', `attachment; filename="${f.name.replace(/[^\w.\- ]/g, '_')}"`).type('application/octet-stream').send(f.data);
}));
router.post('/staff/bug-reports/:id(\\d+)/status', staff, origin, wrap(async (req, res) => {
  await bugs.setStatus(+req.params.id, String(req.body.status || ''));
  res.redirect('/staff/bug-reports#r' + req.params.id);
}));

module.exports = router;
