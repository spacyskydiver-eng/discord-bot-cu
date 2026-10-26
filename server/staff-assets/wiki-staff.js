/* Served only to GW Staff and the owner (see routes/pages.js). Adds the Design Document to the
   wiki as the Staff version, with a switch to the Player version (the Field Manual). */
(window.CUE_WIKI_EXT = window.CUE_WIKI_EXT || []).push(W => {
  W.sources = [
    { key: 'staff', label: 'Staff version', url: '/api/wiki/staff' },
    { key: 'player', label: 'Player version', url: '/api/wiki/player' },
  ];
});
