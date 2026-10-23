// Upcoming events shown on the site. Past events are dropped automatically.
const EVENTS = [
  {
    id: 'great-war',
    title: 'The Great War',
    date: '2026-12-17',
    setting: '1914 Europe',
    players: 300,
    type: 'Modded event',
    status: 'Applications opening soon',
    wiki: '01 Events/The Great War/The Great War',
  },
];

module.exports = function upcomingEvents(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return EVENTS.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
};
