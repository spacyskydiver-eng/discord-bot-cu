# Arsenal manifest: what the website reads

The render job (mi_work/arsenal/manifest.py) writes `manifest.json` next to the renders, in the greatwar repo's
`docs/website/arsenal/`. `tools/arsenal_publish.py` turns that folder into the web copy and `tools/arsenal_upload.py`
puts it on R2. Every path is relative to the manifest. Anything the website can't find is simply left out, so a
partial delivery is fine.

## Views and moves (unchanged)

```json
"views": { "tanks": { "loop": "hangar/tanks_loop.mp4", ... } },
"moves": [ { "from": "home", "to": "tanks", "file": "hangar/move_home__tanks.mp4" } ]
```

Every move starts on its `from` view's loop frame 0 and ends on its `to` view's loop frame 0. The website plays
moves back to back when there's no direct one (for example `mark_v_flag` to `a7v_emblem` goes through `tanks`), so
each pair only needs moves to and from its parent view.

Videos are published exactly as rendered (no re-encode, no rescale), so encode them at the quality you want them
seen at: 1920x1080, H.264, yuv420p, 30 fps, no audio.

## Close-ups (new)

A close-up is just another view, with its own loop and moves to and from the tank bay:

```json
"views": {
  "mark_v_flag":   { "title": "Mark V flag",   "loop": "hangar/mark_v_flag_loop.mp4" },
  "mark_v_emblem": { "title": "Mark V emblem", "loop": "hangar/mark_v_emblem_loop.mp4" }
},
"moves": [
  { "from": "tanks", "to": "mark_v_flag", "file": "hangar/move_tanks__mark_v_flag.mp4" },
  { "from": "mark_v_flag", "to": "tanks", "file": "hangar/move_mark_v_flag__tanks.mp4" }
]
```

Suggested names: `<tank>_flag` and `<tank>_emblem`, one each per tank.

Each flag or emblem look then says which close-up it's shown from, with its still rendered from that view's locked
camera (same rules as the tank-bay stills: 1920x1080 transparent PNG sitting exactly on the loop, optional
full-frame backup):

```json
{
  "id": "mark_v.flags.france", "category": "tank_flag", "area": "tanks",
  "files":   { "transparent": "tanks/mark_v/flags/france.png", "thumbnail": "..." },
  "closeup": { "view": "mark_v_flag",
               "files": { "transparent": "tanks/mark_v/flags/france_closeup.png",
                          "full": "tanks/mark_v/flags/france_closeup_full.png" } }
}
```

Keep `files` (the tank-bay still) as it is: it's used for the swatch and as the fallback whenever the close-up view,
its loop or a way to reach it is missing.

What the website does: picking a look with a close-up plays the move from wherever the camera is to the close-up
view, shows the look there, and swaps looks in place while they share that close-up. Picking anything else moves
back. The scene fills the whole screen behind the side panels (a list on the left about 300 px wide, details on the
right about 340 px, at 1440 px wide), so frame the flag or emblem near the middle of the shot.

## Re-renders

Same names, same framing: publish and upload again. Only changed files are converted and uploaded, and every file in
the web manifest carries `?v=<content hash>`, so browsers fetch the new ones straight away.
