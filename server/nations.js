// The eight nations' public pages (/nations, /nations/<id>): what each was in 1914, plus what it holds on the public map
// at the start. Map facts come from campaign-map's public cut, so there are never node values or coordinates here.
const campaignMap = require('./campaign-map');

const NATIONS = [
  { id: 'gb', slug: 'british-empire', flag: 'british_empire', name: 'The British Empire', allies1914: 'France and Russia (the Triple Entente)',
    history: [
      'In 1914 Britain ruled the largest empire the world had seen, held together by the Royal Navy, the most powerful fleet afloat. It had no formal military alliance on the Continent, but its friendly understandings with France (1904) and Russia (1907) bound the three together as the Triple Entente.',
      'When Germany marched into neutral Belgium, whose independence Britain had guaranteed since 1839, Britain declared war on 4 August 1914. Its small professional army, the British Expeditionary Force, crossed to France within days, while the dominions and colonies began raising men of their own.',
    ] },
  { id: 'fr', slug: 'france', flag: 'france', name: 'France', allies1914: 'Russia (allied since 1894) and Britain (the Triple Entente)',
    history: [
      'France in 1914 was a republic still marked by its defeat of 1870-71, when it lost Alsace and Lorraine to the new German Empire. Since 1894 it had been allied with Russia, and since 1904 it had drawn close to Britain, so that Germany faced enemies on two sides.',
      'Germany declared war on France on 3 August 1914. The French army threw itself at the lost provinces while the German right wing swept through Belgium towards Paris, and was only stopped on the Marne in September 1914.',
    ] },
  { id: 'de', slug: 'germany', flag: 'germany', name: 'Germany', allies1914: 'Austria-Hungary (allied since 1879); Italy on paper, through the Triple Alliance',
    history: [
      'The German Empire, united only in 1871, was by 1914 the leading industrial and military power on the Continent, ruled by Kaiser Wilhelm II. Its closest ally was Austria-Hungary, and it was formally joined with Italy in the Triple Alliance.',
      'Facing France in the west and Russia in the east, Germany declared war on Russia on 1 August and on France on 3 August 1914, and sent its armies through Belgium to try to defeat France quickly before turning east.',
    ] },
  { id: 'ah', slug: 'austria-hungary', flag: 'austria_hungary', name: 'Austria-Hungary', allies1914: 'Germany; Italy on paper, through the Triple Alliance',
    history: [
      'Austria-Hungary was an old, many-peopled empire under the aged Emperor Franz Joseph, split since 1867 into an Austrian half and a Hungarian half. Germans, Hungarians, Czechs, Poles, Croats, Serbs, Romanians and others lived under one crown, and its rivalry with Serbia over the Balkans had grown bitter.',
      'On 28 June 1914 the heir to the throne, Archduke Franz Ferdinand, was shot in Sarajevo by a Bosnian Serb. Backed by Germany, Austria-Hungary declared war on Serbia on 28 July 1914, and within a week the great powers of Europe were at war.',
    ] },
  { id: 'ru', slug: 'russia', flag: 'russia', name: 'Russia', allies1914: 'France (allied since 1894) and Britain (the Triple Entente)',
    history: [
      'The Russian Empire of Tsar Nicholas II stretched from Poland to the Pacific and had the largest army in Europe, though it was slower to gather and less well equipped than Germany\'s. It saw itself as the protector of the Slavs of the Balkans, and of Serbia above all.',
      'When Austria-Hungary attacked Serbia, Russia mobilised, and Germany declared war on it on 1 August 1914. Russian armies invaded East Prussia that same month. The capital, St Petersburg, was renamed Petrograd to sound less German.',
    ] },
  { id: 'it', slug: 'italy', flag: 'italy', name: 'Italy', allies1914: 'Formally Germany and Austria-Hungary (the Triple Alliance), but it stayed neutral in 1914',
    history: [
      'The Kingdom of Italy, united in the 1860s, was the youngest of the great powers. In 1911-12 it had taken Libya from the Ottoman Empire. Though bound to Germany and Austria-Hungary in the Triple Alliance, it still wanted the Italian-speaking lands Austria held, around Trento and Trieste.',
      'Italy argued that the alliance only obliged it to fight if its partners were attacked, and declared itself neutral in August 1914. In 1915 it changed sides, joining Britain, France and Russia and going to war with Austria-Hungary in May.',
    ] },
  { id: 'ot', slug: 'ottoman-empire', flag: 'ottoman_empire', name: 'The Ottoman Empire', allies1914: 'Germany, by a secret treaty of 2 August 1914',
    history: [
      'Once the master of south-east Europe, the Ottoman Empire had lost nearly all its European lands in the Balkan Wars of 1912-13. From Constantinople it still ruled Anatolia, the Arab lands of the Middle East and the straits between the Black Sea and the Mediterranean, and the Young Turk leaders who held power looked to Germany to help modernise its army.',
      'A secret alliance with Germany was signed on 2 August 1914. Late in October Ottoman ships, led by two German cruisers, raided Russia\'s Black Sea ports, and by early November the empire was at war with Russia, Britain and France.',
    ] },
  { id: 'bg', slug: 'bulgaria', flag: 'bulgaria', name: 'Bulgaria', allies1914: 'None: Bulgaria was neutral in 1914',
    history: [
      'Bulgaria, a kingdom under Tsar Ferdinand, had fought alongside its neighbours to drive the Ottomans out of the Balkans in 1912, then lost much of what it won to Serbia, Greece and Romania in the Second Balkan War of 1913. It wanted those lands back, Macedonia above all.',
      'It stayed neutral when war broke out in 1914 while both sides courted it. In October 1915 it joined Germany, Austria-Hungary and the Ottoman Empire, and attacked Serbia.',
    ] },
];

// what each nation holds on the public map at the start: its node count, its capital and the theatres it's in
async function withMap() {
  const m = JSON.parse(await campaignMap.loadPublic());
  const theatre = Object.fromEntries(m.continents.map(c => [c.id, c.name]));
  return NATIONS.map(n => {
    const nodes = m.territories.filter(t => t.owner === n.id);
    const counts = {};
    nodes.forEach(t => { const th = theatre[t.continent] || t.continent; counts[th] = (counts[th] || 0) + 1; });
    const cap = (m.capitals || []).find(c => c.nation === n.id);
    const mapNation = m.nations.find(x => x.id === n.id) || {};
    return Object.assign({}, n, {
      color: mapNation.color, nodes: nodes.length, capital: cap ? cap.name : null,
      theatres: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    });
  });
}

module.exports = { NATIONS, withMap };
