// Leader applications for The Great War. Every date, nation, role and limit the feature uses is here.
// Times are UTC Unix seconds (stored in the database as timestamptz, shown to visitors in their own
// timezone, and sent in bot messages as Discord <t:...> timestamps).
//   1795996740 = Sunday 29 November 2026, 23:59 UTC
//   1796083200 = Tuesday 1 December 2026, 00:00 UTC
module.exports = {
  // applications (team, confirmations and the form) close at this moment
  closesAt: 1795996740,

  // the one leader brief every applicant must attend. The day is fixed; set briefAt (Unix seconds,
  // UTC) once the time is decided. Until then the site and the bot say "30 November 2026, time to be
  // announced".
  briefDate: '30 November 2026',
  briefAt: null,

  // staff choose Leaders by the end of this day
  decideBy: 1796169599,           // Tuesday 1 December 2026, 23:59:59 UTC
  decideByLabel: '1 December 2026',

  // accepted Leaders have this long, from acceptance, to set up their nation's Discord and invite the bot
  discordSetupDays: 7,

  // the Leader can fill the four extra cabinet seats from their assigned players from this moment
  cabinetOpensAt: 1796169600,     // Wednesday 2 December 2026, 00:00 UTC (after 1 December)

  // event start: when set, the Leaders, seats and succession are exported to the game server on their
  // own at this time (staff can also export by hand from the review page at any time)
  eventStartsAt: null,

  teamSize: 4,                    // teammates, not counting the Leader
  seats: 8,                       // cabinet seats in game (the mod's Governance.SEATS)

  // answer limits (characters)
  scenarioMax: 600,
  planMax: 800,
  experienceMax: 1500,
  reasonMax: 200,

  // the voice pitch recorded on the page
  recording: { minSeconds: 60, maxSeconds: 300, maxBytes: 20 * 1024 * 1024 },
  // recordings and applications are deleted this many days after the event (shown in the privacy terms)
  keepDaysAfterEvent: 60,

  // the 8 nations: key (stored), display name, the nation id in the game's nations.json, and the Discord
  // role given to the Leader and their team. The game's default roster has no Ottoman Empire or Bulgaria;
  // the ids below must match the event's nations.json.
  nations: [
    { key: 'british_empire', name: 'British Empire', gameId: 'british_empire', roleId: '' },
    { key: 'france', name: 'France', gameId: 'france', roleId: '' },
    { key: 'russia', name: 'Russia', gameId: 'russia', roleId: '' },
    { key: 'italy', name: 'Italy', gameId: 'italy', roleId: '' },
    { key: 'germany', name: 'Germany', gameId: 'germany', roleId: '' },
    { key: 'austria_hungary', name: 'Austria-Hungary', gameId: 'austria_hungary', roleId: '' },
    { key: 'ottoman_empire', name: 'Ottoman Empire', gameId: 'ottoman_empire', roleId: '' },
    { key: 'bulgaria', name: 'Bulgaria', gameId: 'bulgaria', roleId: '' },
  ],

  // Discord roles given on acceptance (in the CUE server). Empty means "not set yet": acceptance still
  // goes ahead and the review page says which roles weren't given.
  roles: {
    leader: '',          // the Leader
    leadership: '',      // the Leader's 4 teammates
  },

  // who may review: the GW Staff role (server/access.js) and the owner
  staffRoleId: '1563982613109149696',

  // the Leader's assigned players, for the extra cabinet seats, are the members of our Discord server who
  // hold their nation's role (the roleId above). The Leader enters or confirms each one's Minecraft name.

  // the game server's web companion API (greatwar docs/WEB_API.md). The token is a linked operator's
  // token (run /link in game as an op, then POST /api/link once). Set these in the environment.
  gameApi: {
    url: process.env.GW_API_URL || '',            // e.g. http://127.0.0.1:8765
    secret: process.env.GW_API_SECRET || '',
    token: process.env.GW_API_TOKEN || '',
  },
};
