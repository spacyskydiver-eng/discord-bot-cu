// "On this day in 1914" for the Daily Front and the home page (meeting 2), for the event's calendar days. Each entry was
// checked against sources (encyclopedia 1914-1918-online, the London Gazette, Wikipedia, firstworldwar.com) on
// 14 Nov 2026. A day with no sure event has no line rather than a guess.
const DAYS = {
  '12-17': 'The French open the First Battle of Artois, attacking the German line near Arras.',
  '12-18': 'Britain declares Egypt a British protectorate, ending its last formal tie to the Ottoman Empire.',
  '12-19': 'Prince Hussein Kamel is proclaimed Sultan of Egypt, in place of the deposed Khedive.',
  '12-20': 'The French open the First Battle of Champagne, which will grind on until March.',
  '12-21': 'A German seaplane drops two bombs into the sea off Dover: the first air attack on Britain.',
  '12-22': 'In the Caucasus, Enver Pasha\'s winter offensive against the Russians is under way: by late December it reaches Sarikamish, in deep snow.',
  '12-24': 'A German bomb lands in a garden in Dover, the first to fall on British soil. Along the Western Front, the singing starts that becomes the Christmas Truce.',
  '12-25': 'The Christmas Truce: along much of the Western Front, soldiers of both sides meet in no man\'s land. British seaplanes raid the German naval base at Cuxhaven.',
};
// the line for a date ("YYYY-MM-DD" or a Date), or null
function onThisDay(date) {
  const iso = typeof date === 'string' ? date : new Date(date).toISOString().slice(0, 10);
  return DAYS[iso.slice(5, 10)] || null;
}
module.exports = { onThisDay, DAYS };
