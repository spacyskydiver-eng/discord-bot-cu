// A small in-memory rate limit (S82) for the routes that call the game or Mojang for a visitor (/soldier/<name>,
// /night/<name>, /war-office/link), so nobody can hammer the game's API through the site. Per visitor: 30 requests a
// minute; and for everyone together a cap (600 a minute) that counts only the requests let through, so one visitor
// being refused can't use it up for everyone else.
//
// Who the visitor is: the address that connected to the site's own proxy (Render: one hop, the last X-Forwarded-For
// entry; set TRUST_PROXY_HOPS to change it, 0 when the app is reached directly). Only when that address is one of
// Cloudflare's (its published ranges, below) is Cloudflare's CF-Connecting-IP believed; anyone else could make it up.
const net = require('net');

// https://www.cloudflare.com/ips-v4 and /ips-v6 (published ranges, embedded; they change rarely)
const CLOUDFLARE_V4 = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14',
  '172.64.0.0/13', '131.0.72.0/22'];
const CLOUDFLARE_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'];
const cloudflare = new net.BlockList();
CLOUDFLARE_V4.forEach(c => { const [a, b] = c.split('/'); cloudflare.addSubnet(a, +b, 'ipv4'); });
CLOUDFLARE_V6.forEach(c => { const [a, b] = c.split('/'); cloudflare.addSubnet(a, +b, 'ipv6'); });

const plain = a => { a = String(a || '').trim(); const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(a); return m ? m[1] : a; };
function isCloudflare(addr) {
  const a = plain(addr), v = net.isIP(a);
  return v ? cloudflare.check(a, v === 4 ? 'ipv4' : 'ipv6') : false;
}
const HOPS = () => { const h = parseInt(process.env.TRUST_PROXY_HOPS, 10); return Number.isFinite(h) && h >= 0 ? h : (process.env.RENDER ? 1 : 0); };

/** The visitor's address: the peer that reached our proxy, or Cloudflare's word for who reached Cloudflare. */
function visitor(req, hops = HOPS()) {
  const header = name => (req.headers && req.headers[name]) || (req.get && req.get(name)) || '';
  const chain = String(header('x-forwarded-for')).split(',').map(plain).filter(Boolean);
  chain.push(plain((req.socket && req.socket.remoteAddress) || req.ip || ''));
  // the last `hops` entries are our own proxies; the one before them is who connected to the first of them
  const peer = chain[Math.max(0, chain.length - 1 - hops)];
  const cf = plain(header('cf-connecting-ip'));
  if (cf && net.isIP(cf) && isCloudflare(peer)) return cf;
  return peer || '?';
}

const MAX_KEYS = 50000;
function limit({ perMinute = 30, allPerMinute = 600, now = () => Date.now() } = {}) {
  const buckets = new Map();
  let all = { at: 0, n: 0 };
  const refuse = (res, wait) => {
    res.set({ 'Retry-After': String(Math.max(1, Math.ceil(wait / 1000))), 'Cache-Control': 'no-store' });
    return res.status(429).type('text/plain').send('Too many requests. Please wait a minute and try again.');
  };
  return (req, res, next) => {
    const t = now(), key = visitor(req);
    if (t - all.at >= 60000) all = { at: t, n: 0 };
    let b = buckets.get(key);
    if (!b || t - b.at >= 60000) {
      if (!b && buckets.size >= MAX_KEYS) for (const [k, v] of buckets) { if (t - v.at >= 60000 || buckets.size >= MAX_KEYS) buckets.delete(k); if (buckets.size < MAX_KEYS * 0.9) break; }
      b = { at: t, n: 0 };
      buckets.set(key, b);
    }
    if (b.n >= perMinute) return refuse(res, 60000 - (t - b.at));
    if (all.n >= allPerMinute) return refuse(res, 60000 - (t - all.at));
    b.n++; all.n++; // only requests let through count
    next();
  };
}

module.exports = { limit, visitor, isCloudflare };
