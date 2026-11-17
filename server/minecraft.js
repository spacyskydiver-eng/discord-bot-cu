// Minecraft Java account lookup through Mojang, as the 150-player IGN check does.
// Returns { name, uuid } for a real account, null if no such account, and throws if Mojang
// can't be reached so the caller can ask the player to try again.
const NAME = /^[A-Za-z0-9_]{3,16}$/;

// S82: answers (and "no such account") are kept a minute, and Mojang being unreachable 15 seconds, so a visitor can't
// make the site call Mojang for every request (Mojang limits the site's address).
const seen = new Map(), MAX = 5000;
async function javaAccount(name) {
  name = String(name || '').trim();
  if (!NAME.test(name)) return null;
  const key = name.toLowerCase(), hit = seen.get(key);
  if (hit && Date.now() - hit.at < (hit.error ? 15 : 60) * 1000) { if (hit.error) throw hit.error; return hit.acc && Object.assign({}, hit.acc); }
  let acc;
  try {
    const r = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(6000) });
    if (r.status === 404 || r.status === 204) acc = null;
    else if (!r.ok) throw new Error('Mojang returned ' + r.status);
    else { const d = await r.json(); acc = { name: d.name, uuid: d.id }; }
  } catch (e) {
    if (!/^Mojang/.test(e.message)) e = new Error('Mojang unreachable: ' + e.message);
    remember(key, { at: Date.now(), error: e });
    throw e;
  }
  remember(key, { at: Date.now(), acc });
  return acc && Object.assign({}, acc);
}
function remember(key, v) { seen.delete(key); seen.set(key, v); if (seen.size > MAX) seen.delete(seen.keys().next().value); }

module.exports = { javaAccount, NAME };
