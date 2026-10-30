// The Arsenal: a showcase of everything built for The Great War. The public page says "Coming Soon";
// staff (and the owner) can preview the real viewer with ?preview=1 (and switch it off with ?preview=0).
module.exports = {
  // where the viewer reads manifest.json from; every file path in the manifest is relative to it. It's set in
  // the control centre (Arsenal card, stored in site_settings) so the bucket's address stays out of this public
  // repo; ARSENAL_MANIFEST_URL in the environment works too. With neither, a small placeholder manifest with
  // dummy images and loops that ships with the site.
  manifestUrl: process.env.ARSENAL_MANIFEST_URL || '/arsenal-placeholder/manifest.json',

  store: {
    vip: 'https://collective-union.tebex.io/checkout/packages/add/7526228/single',
    vip_plus: 'https://collective-union.tebex.io/checkout/packages/add/7526241/single',
  },

  // tabs, in order: which manifest categories each holds. A tab only shows once it has something in it.
  tabs: [
    { key: 'tanks', label: 'Tanks', categories: ['tank'] },
    { key: 'vip', label: 'VIP', tiers: ['vip'] },
    { key: 'vip_plus', label: 'VIP+', tiers: ['vip_plus'] },
    { key: 'weapons', label: 'Weapons', categories: ['weapon'] },
    { key: 'uniforms', label: 'Uniforms', categories: ['uniform'] },
    { key: 'melee', label: 'Melee', categories: ['melee'] },
  ],

  // what the render manifest doesn't carry: each tank's nation, a two-line history and its stats. The
  // stats are the real tanks' historical figures, shown as bars against the largest of the four.
  tanks: {
    mark_v: {
      nation: 'British Empire',
      history: "Britain's last heavy tank of the war. A new gearbox let a single man drive it, and it first fought at Hamel on 4 July 1918.",
      stats: { weight: 29, speed: 7.4, armour: 14, crew: 8 },
    },
    a7v: {
      nation: 'German Empire',
      history: "Germany's only tank to see action; just 20 were built. At Villers-Bretonneux on 24 April 1918 it fought the first tank-against-tank battle.",
      stats: { weight: 30, speed: 15, armour: 30, crew: 18 },
    },
    fiat_2000: {
      nation: 'Italy',
      history: "Italy's heavy tank: a 40-tonne fortress with a domed turret. Only two were built, and neither fought in the war.",
      stats: { weight: 40, speed: 7, armour: 20, crew: 10 },
    },
    renault_ft: {
      nation: 'France',
      history: 'The first tank with a fully turning turret, the layout nearly every tank since has followed. France built over 3,000.',
      stats: { weight: 6.5, speed: 7.7, armour: 22, crew: 2 },
    },
  },
  stats: [
    { key: 'weight', label: 'Weight', unit: 't' },
    { key: 'speed', label: 'Top speed', unit: 'km/h' },
    { key: 'armour', label: 'Armour', unit: 'mm' },
    { key: 'crew', label: 'Crew', unit: '' },
  ],
};
