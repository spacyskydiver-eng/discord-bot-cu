// A small in-memory rate limit (S82) for the routes that call the game or Mojang for a visitor (/soldier/<name>,
// /night/<name>, /war-office/link), so nobody can hammer the game's API through the site. Per visitor: 30 requests a
// minute. The visitor is Cloudflare's CF-Connecting-IP when the request came through Cloudflare, else the connection's
// address. A request sent straight to the origin can make up that header, so there is also a cap for everyone together
// (the game is protected either way; a flood can then only slow these pages, not the game).
const MAX_KEYS = 50000;

function visitor(req) {
  const cf = req.get('cf-connecting-ip');
  return (cf && cf.length < 64 ? cf : null) || req.ip || (req.socket && req.socket.remoteAddress) || '?';
}

function limit({ perMinute = 30, allPerMinute = 600 } = {}) {
  const buckets = new Map();
  let all = { at: 0, n: 0 };
  return (req, res, next) => {
    const now = Date.now(), key = visitor(req);
    if (now - all.at >= 60000) all = { at: now, n: 0 };
    let b = buckets.get(key);
    if (!b || now - b.at >= 60000) {
      if (!b && buckets.size >= MAX_KEYS) for (const [k, v] of buckets) { if (now - v.at >= 60000 || buckets.size >= MAX_KEYS) buckets.delete(k); if (buckets.size < MAX_KEYS * 0.9) break; }
      b = { at: now, n: 0 };
      buckets.set(key, b);
    }
    b.n++; all.n++;
    if (b.n > perMinute || all.n > allPerMinute) {
      res.set({ 'Retry-After': String(Math.ceil((60000 - (now - Math.min(b.at, all.at))) / 1000)), 'Cache-Control': 'no-store' });
      return res.status(429).type('text/plain').send('Too many requests. Please wait a minute and try again.');
    }
    next();
  };
}

module.exports = { limit, visitor };
