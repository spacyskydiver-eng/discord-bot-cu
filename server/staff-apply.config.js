// Staff applications for The Great War. Every date, track, role and limit the feature uses is here.
// Times are UTC Unix seconds (shown to visitors in their own timezone, and sent in bot messages as
// Discord <t:...> timestamps).
//   1795391940 = Sunday 22 November 2026, 23:59 UTC
//   1795737599 = Thursday 26 November 2026, 23:59:59 UTC
module.exports = {
  // applications are open from now until this moment
  closesAt: 1795391940,

  // decisions go out by the end of this day, before the leader brief (leaders.config.js briefDate)
  decideBy: 1795737599,
  decideByLabel: '26 November 2026',

  // every accepted applicant gets the GW Staff role, plus their track's role below
  staffRoleId: '1563982613109149696',

  // The three tracks, as shown on the page and sent in the acceptance message. roleId is the Discord
  // role for the track; empty means "not set yet": acceptance still goes ahead and the review page says
  // which roles weren't given.
  tracks: [
    {
      key: 'event_staff',
      name: 'Event Staff',
      tagline: 'You play the event as a normal player',
      roleId: '',
      intro: 'You join a nation like everyone else, with no admin powers. In game you get a limited staff panel for moderating:',
      allowed: [
        'warn, mute and kick',
        'see and claim the report queue',
        'freeze a player while you call an Operator',
        "check a player's name, nation and rank",
      ],
      notAllowed: ['teleport', 'vanish', 'spectate', 'see coordinates', 'see inventories', 'change gamemode', 'give items', 'ban'],
      rules: [
        'You never handle a report or incident involving your own nation, its allies or its enemies at war. Pass it to an Operator.',
        'You never use anything you see as staff to help your nation.',
        'Every staff action is logged and reviewed.',
        'Abuse means removal from staff and from the event.',
      ],
    },
    {
      key: 'operator',
      name: 'Operator',
      tagline: 'You run the event and do not play',
      roleId: '',
      intro: 'You get full access: teleport, vanish, spectator, inventories, rollbacks, bans and the event controls.',
      allowed: [],
      notAllowed: [],
      rules: [
        "You can't play the event on any account, alt included.",
        'Declare any friends or clan members who are playing.',
        'Never pass information to any nation.',
        'Stay neutral in chat and in voice.',
        'Be available for set shifts on event days.',
        'Every action is logged.',
        'Leaking or favouring a side means permanent removal.',
      ],
    },
    {
      key: 'creator',
      name: 'Event Creator',
      tagline: 'You help build the events and you can play',
      roleId: '',
      intro: 'You help with builds, map work, lore, quests and testing before an event.',
      allowed: [],
      notAllowed: [],
      rules: [
        "Everything you work on is confidential until it's public.",
        'Your creative and build access ends before the event starts.',
        'You play with normal player permissions.',
        "You can't be a nation leader or on a leadership team in an event you helped build.",
        'Your nation is assigned at random.',
        "You can't use insider knowledge, such as hidden locations, routes, loot, or what happens when. Anything secret you built gets moved or changed before launch.",
        'Breaking confidentiality means removal from the team and the event.',
      ],
    },
  ],

  // The event schedule Operators pick their shifts from: { startsAt (Unix seconds, UTC), minutes, label }.
  // While it's empty the page asks Operators which days and times they could commit to, in their own words.
  // e.g. { startsAt: 1797537600, minutes: 180, label: 'Session 1' }
  schedule: [],

  minAge: 13,

  // answer limits (characters)
  limits: { short: 160, hours: 200, answer: 1200, long: 2000, example: 300 },

  // the Operator's optional voice note, recorded on the page or a YouTube link (as on the leader application)
  voiceNote: { minSeconds: 45, maxSeconds: 150, maxBytes: 10 * 1024 * 1024 },

  // the Event Creator's portfolio: at least minPieces, counting uploaded images and links together.
  // Uploads are images only; videos and world downloads are links.
  portfolio: { minPieces: 3, maxFiles: 8, maxFileBytes: 5 * 1024 * 1024, maxLinks: 10 },

  // applications, voice notes and portfolio uploads are deleted this many days after the event (shown on the page)
  keepDaysAfterEvent: 60,
};
