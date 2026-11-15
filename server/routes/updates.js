// S78: /updates, the players' history of The Great War, every version since the first build, in plain words, newest
// first. Built from the team's changelog (the vault's Changelog notes) by the release process; each release adds its
// section. Public: nothing here is private (no mod names, secrets, coordinates, node values or staff tools).
const express = require('express');
const router = express.Router();
const UPDATES = require('../data/updates.json');

router.get('/updates', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.render('new/updates', { sections: UPDATES.sections });
});

module.exports = router;
