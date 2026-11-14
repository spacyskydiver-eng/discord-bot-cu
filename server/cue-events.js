// Upcoming events shown on the site. Past events are dropped automatically.
const EVENTS = [
  {
    id: 'great-war',
    title: 'The Great War',
    date: '2026-12-17',
    setting: '1914 Europe',
    players: 500,
    type: 'Modded event',
    status: 'Applications opening soon',
    wiki: 'wiki',
    short: 'great-war-in-2-minutes',
  },
];

// The Great War's war windows (files/RULES.md): every 2 days from day 3, 19:00 to 22:00 UK time, over the two weeks.
// December is GMT, so UK time is UTC. Times are UTC Unix seconds.
function warWindows(startIso = '2026-12-17', days = 14) {
  const [y, m, d] = startIso.split('-').map(Number), out = [];
  for (let day = 3; day <= days; day += 2) {
    const start = Date.UTC(y, m - 1, d + day - 1, 19) / 1000;
    out.push({ day, start, end: start + 3 * 3600 });
  }
  return out;
}
EVENTS.find(e => e.id === 'great-war').windows = warWindows();

// the windows as a calendar file, each with a reminder half an hour before
function windowsIcs() {
  const w = EVENTS.find(e => e.id === 'great-war').windows;
  const stamp = ts => new Date(ts * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Collective Union Events//The Great War//EN', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:The Great War: war windows'];
  for (const x of w) lines.push('BEGIN:VEVENT', `UID:great-war-window-day${x.day}@cuevents.xyz`, `DTSTAMP:${stamp(x.start - 30 * 86400)}`,
    `DTSTART:${stamp(x.start)}`, `DTEND:${stamp(x.end)}`, `SUMMARY:The Great War: war window (day ${x.day})`,
    'DESCRIPTION:Nodes can only be captured inside a war window. Times may change before the event: see cuevents.xyz/great-war-in-2-minutes',
    'URL:https://cuevents.xyz/great-war-in-2-minutes',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:War window in 30 minutes', 'TRIGGER:-PT30M', 'END:VALARM', 'END:VEVENT');
  lines.push('END:VCALENDAR');
  // calendar lines longer than 75 characters are folded onto continuation lines that start with a space
  const fold = l => l.length <= 75 ? l : l.match(/.{1,74}/g).join('\r\n ');
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = function upcomingEvents(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return EVENTS.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
};
module.exports.windowsIcs = windowsIcs;
