// The first Great War test session. It is written to the database once, the first time the site
// starts with no sessions; after that, add and edit sessions in the control centre (Testers).
// starts_at is a UTC Unix timestamp (seconds): 1795287600 = Saturday 21 November 2026, 19:00 UTC.
module.exports = {
  firstSession: {
    title: 'Great War test session',
    starts_at: 1795287600,
    duration_minutes: 60,
    slots: 50,
    team_size: 25,
  },
};
