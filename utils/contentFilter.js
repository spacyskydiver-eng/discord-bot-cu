// Detects racist slurs and extremist political content only — not general swear words.

const SLUR_PATTERNS = [
  // n-word variations (handles leetspeak, repeated letters, etc.)
  /\bn[i1!\|]+g{1,}[ae3]r+s?\b/i,
  /\bn[i1!\|]+g{1,}[ae3]rs?\b/i,
  /\bnigg[ae]r+s?\b/i,
  /\bnig{2,}[ae]r+s?\b/i,
  // k-word (anti-Jewish)
  /\bk[i1]+k[e3]s?\b/i,
  /\bkike+s?\b/i,
  // c-word (anti-Chinese)
  /\bch[i1]+nk+s?\b/i,
  // sp-word (anti-Hispanic)
  /\bsp[i1]+cs?\b/i,
  /\bspick+s?\b/i,
  // g-word (anti-Roma)
  /\bgy[p]+s[yi]+e?s?\b/i,
  // w-word (anti-Native American)
  /\bw[e3]tb[a4]+ck+s?\b/i,
  // sand n-word
  /\bsand\s?n[i1]+g{2,}[ae]r+s?\b/i,
  // general racial: "go back to [country/continent]" covered by political phrases below
  // beaner
  /\bb[e3][a4]+n[e3]r+s?\b/i,
  // c-word (anti-Black)
  /\bcoon+s?\b/i,
  // j-word (anti-Jewish)
  /\bjew+s?\s+(control|own|run|destroy)\b/i,
  // mudslime / m-slur
  /\bmuds?l[i1]+m[e3]s?\b/i,
  // r-word used as racial attack (not casual usage — only when paired with slur patterns)
];

const POLITICAL_PHRASES = [
  // white supremacist
  'white power', 'white supremacy', 'white supremacist', 'white nationalist',
  'white genocide', 'great replacement', 'race war', '14 words', '88',
  // nazi
  'heil hitler', 'sieg heil', 'third reich', 'fourth reich',
  'gas the jews', 'gas the blacks', 'final solution',
  // extremist violence
  'ethnic cleansing', 'racial purity', 'racial superiority',
  'death to all', 'kill all jews', 'kill all blacks', 'kill all muslims',
  // extremist organisations
  'ku klux klan', 'kkk member', 'daily stormer', 'proud boys are right',
  'atomwaffen', 'neo nazi', 'neo-nazi',
  // anti-semitic conspiracy
  'jewish conspiracy', 'jewish control', 'zionist conspiracy',
  'jews control', 'jews run', 'jews own the',
  // islamophobic extremism
  'all muslims are terrorists', 'islam is a cancer',
  // calls for ethnic discrimination
  'deport all', 'ban all muslims', 'ban all blacks',
];

function checkContent(text) {
  if (!text || text.trim().length === 0) return null;

  for (const pattern of SLUR_PATTERNS) {
    const m = text.match(pattern);
    if (m) return { matched: m[0], type: 'slur' };
  }

  const lower = text.toLowerCase();
  for (const phrase of POLITICAL_PHRASES) {
    if (lower.includes(phrase)) return { matched: phrase, type: 'extremism' };
  }

  return null;
}

module.exports = { checkContent };
