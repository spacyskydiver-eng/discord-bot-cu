// Minecraft Java account lookup through Mojang, as the 150-player IGN check does.
// Returns { name, uuid } for a real account, null if no such account, and throws if Mojang
// can't be reached so the caller can ask the player to try again.
const NAME = /^[A-Za-z0-9_]{3,16}$/;

async function javaAccount(name) {
  name = String(name || '').trim();
  if (!NAME.test(name)) return null;
  const r = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(6000) });
  if (r.status === 404 || r.status === 204) return null;
  if (!r.ok) throw new Error('Mojang returned ' + r.status);
  const d = await r.json();
  return { name: d.name, uuid: d.id };
}

module.exports = { javaAccount, NAME };
