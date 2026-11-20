// Owner, 20 Nov 23:47: no messages to players unless Alex sends them himself. One gate for every way the site and the
// bot can post to Discord: plain fetch() calls to the API (DMs, channel posts, webhooks) and discord.js's REST client
// (level-up posts, DMs, channel sends). Everything that creates a message is blocked unless site setting
// `player_messages` is 'on'. Replies to someone's own slash command or button (interaction responses) still work, since
// those answer the person who clicked. Default and any error: blocked.
const access = require('./access');

let open = false, readAt = 0;
async function refresh() {
  if (Date.now() - readAt < 30000) return;
  readAt = Date.now();
  try { open = String((await access.getSetting('player_messages')) || '').trim() === 'on'; } catch (_) { open = false; }
}
refresh();

// routes that create a message or a DM channel (POST only)
const MESSAGE_ROUTE = /\/(channels\/\d+\/(messages|threads)|users\/@me\/channels|webhooks\/\d+\/[^/?]+(\?|$))/;
const INTERACTION_FOLLOWUP = /\/webhooks\/\d+\/aW50ZXJhY3Rpb24/;   // token starts with base64 'interaction'
const blocked = (method, route) => String(method || 'GET').toUpperCase() === 'POST' && MESSAGE_ROUTE.test(route)
  && !INTERACTION_FOLLOWUP.test(route) && !open;

function log(route) { console.log('[message-gate] blocked a message (player_messages is off):', route.replace(/\d{6,}/g, 'N')); }

// 1. fetch()
const realFetch = globalThis.fetch;
globalThis.fetch = async function gatedFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  if (/^https:\/\/(\w+\.)?discord(app)?\.com\/api\//.test(url)) {
    await refresh();
    const method = init.method || (input && input.method);
    if (blocked(method, url)) {
      log(new URL(url).pathname);
      return new Response(JSON.stringify({ message: 'blocked by player_messages', code: 0 }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return realFetch(input, init);
};

// 2. discord.js: wrap the client's REST so channel sends, DMs and threads are stopped the same way
function gateClient(client) {
  const rest = client.rest;
  if (!rest || rest.__gated) return;
  const real = rest.request.bind(rest);
  rest.request = async function (options) {
    await refresh();
    if (blocked(options.method, options.fullRoute || '')) {
      log(options.fullRoute || '');
      const e = new Error('Message blocked: site setting player_messages is off'); e.code = 'MESSAGE_GATE'; throw e;
    }
    return real(options);
  };
  rest.__gated = true;
}

module.exports = { gateClient, isOpen: async () => { readAt = 0; await refresh(); return open; } };
