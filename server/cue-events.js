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

// The Great War's war windows, 19:00 to 22:00 UK time, as a fixed schedule (meeting 2, 14 Nov): days 3, 5 and 7, then
// the Christmas Truce on day 9 (25 Dec: no window, PvP off for the evening), then days 10, 12 and 14 (26, 28, 30 Dec).
// December is GMT, so UK time is UTC. Times are UTC Unix seconds.
const WINDOW_DAYS = [3, 5, 7, 10, 12, 14], TRUCE_DAY = 9;
function dayAt(startIso, day) { const [y, m, d] = startIso.split('-').map(Number); return Date.UTC(y, m - 1, d + day - 1, 19) / 1000; }
const gw = EVENTS.find(e => e.id === 'great-war');
gw.windows = WINDOW_DAYS.map(day => { const start = dayAt(gw.date, day); return { day, start, end: start + 3 * 3600 }; });
gw.truce = { day: TRUCE_DAY, start: dayAt(gw.date, TRUCE_DAY), end: dayAt(gw.date, TRUCE_DAY) + 3 * 3600 };

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
  const t = EVENTS.find(e => e.id === 'great-war').truce;
  if (t) lines.push('BEGIN:VEVENT', `UID:great-war-truce-day${t.day}@cuevents.xyz`, `DTSTAMP:${stamp(t.start - 30 * 86400)}`,
    `DTSTART:${stamp(t.start)}`, `DTEND:${stamp(t.end)}`, 'SUMMARY:The Great War: the Christmas Truce (no war window)',
    'DESCRIPTION:No fighting this evening: PvP is off and no man\'s land is open to meet the other side.', 'URL:https://cuevents.xyz/great-war-in-2-minutes', 'END:VEVENT');
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
