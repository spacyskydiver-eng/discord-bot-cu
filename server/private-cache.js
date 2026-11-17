// S82: a page made for a signed-in visitor (his name and avatar in the header, his own cards) is never stored by a shared
// cache: any "public" Cache-Control a route sets becomes "private" (and loses stale-while-revalidate) when someone is
// signed in. Used once, in server/app.js, after the session.
function privateWhenSignedIn(req, res, next) {
  if (!req.session || !req.session.user) return next();
  const set = res.setHeader;
  res.setHeader = function (name, value) {
    if (String(name).toLowerCase() === 'cache-control' && /\bpublic\b/i.test(String(value)))
      value = String(value).replace(/\bpublic\b/i, 'private').replace(/,?\s*stale-while-revalidate=\d+/i, '');
    return set.call(this, name, value);
  };
  next();
}
module.exports = { privateWhenSignedIn };
