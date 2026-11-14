# The war feed: what the website needs from the game server

The public War Report (/war) and the Daily Front (/daily-front) read two JSON documents from the game. The game's web API
(greatwar `docs/WEB_API.md`) only serves signed-in players their own view, so these are two new **public, read-only**
reads. The website's backend calls them with the shared secret, caches them for a minute, and serves the pages; browsers
never call the game.

Nothing in either may carry node values, coordinates, player positions, or anything a scout would have to earn (living
players per node, troop counts). Battle sizes are only published once the window they happened in has closed.

## `GET /api/public/report` (header `X-Greatwar-Secret`)
```json
{
  "ok": true,
  "now": 1797800000000,            // server time, ms
  "day": 5,                         // event day, 1-based
  "nextWindow": 1797966000000,      // start of the next war window, ms (null if none left)
  "windowOpen": false,
  "nations": [                      // all 8, every time
    { "id": "de", "nodes": 23, "captured24h": 2, "lost24h": 0, "capitalHeld": true, "wiped": false }
  ],
  "owners": { "paris": "fr", "berlin": "de" },   // node id -> nation id ("none" for neutral); node ids as on the public map
  "relations": [                    // only pairs that aren't plain neutral
    { "a": "de", "b": "fr", "state": "war", "since": 1797600000000 },
    { "a": "de", "b": "ah", "state": "ally", "since": 1797400000000 },
    { "a": "it", "b": "ah", "state": "war_pending", "from": 1797966000000 }
  ],
  "events": [                       // newest first, the last 7 days
    { "at": 1797790000000, "kind": "capture", "node": "verdun", "from": "fr", "to": "de" }
    // kind: capture | capital_lost | capital_retaken | wiped | war_declared | war_begun | peace | alliance | alliance_broken
    //       (node / from / to / a / b as they apply)
  ],
  "battles": [                      // closed windows only, biggest first, at most 10
    { "window": 4, "node": "verdun", "attacker": "de", "defender": "fr", "deaths": 37, "result": "captured" }
  ]
}
```

## `GET /api/public/front?days=7` (header `X-Greatwar-Secret`)
```json
{
  "ok": true,
  "editions": [                     // newest first
    { "day": 5, "date": "2026-12-21", "headline": "Verdun falls",
      "articles": [ { "kind": "auto", "title": "Germany takes Verdun", "body": "..." },
                    { "kind": "press", "nation": "fr", "author": "Marianne", "title": "...", "body": "..." } ] }
  ]
}
```

Until the game serves these, the website shows sample data built from the real map (`server/war-feed.js`), with a banner.
Set `WAR_FEED_URL` (the game's web API base) and `WAR_FEED_SECRET` on the website to switch to the live feed.
