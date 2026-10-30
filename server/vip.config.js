// VIP tiers for the game servers. Tebex gives buyers a role in our Discord; that role is the source of
// truth, read through the bot.
module.exports = {
  guildId: '1449004906068312189',

  // Discord roles for each tier. VIP+ beats VIP. The server has two roles named "VIP+": the original one
  // next to VIP, and an unstyled one made when Tebex was set up. Both count until we know which one Tebex
  // gives; remove the one it doesn't.
  roles: {
    vip: ['1449004906433351881'],
    vip_plus: ['1449030965576990720', '1520465280118034442'],
  },

  // the shared secret the game servers send as X-CUE-Secret, and that we send to them. Set it in the
  // environment (Render) and in each game server's config; nothing is accepted or sent without it.
  secret: process.env.VIP_API_SECRET || '',

  // the game servers told when someone's tier changes (POST <url>/api/vip/changed). Set in the
  // environment as a comma-separated list of base URLs, e.g.
  //   VIP_SERVER_URLS=https://test.greatwar.example:8443,https://eu1.greatwar.example:8443
  servers: (process.env.VIP_SERVER_URLS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean),

  // how long a member's roles are trusted before asking Discord again
  cacheSeconds: 60,

  // a change notification that fails is tried again after these delays (seconds). The servers also
  // re-check everyone every 10 minutes, so a server that stays down catches up on its own.
  retryAfter: [10, 60, 300],
};
