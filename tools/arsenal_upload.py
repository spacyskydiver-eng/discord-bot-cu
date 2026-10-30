"""arsenal_upload.py <out> [bucket/prefix]: uploads the web copy made by arsenal_publish.py to Cloudflare R2 with
wrangler (signed in as the account that owns the bucket). Only files whose bytes changed since the last upload are
sent; manifest.json goes last, so a visitor never gets a manifest naming files that aren't up yet.

The Arsenal lives in the cue-arsenal bucket under arsenal/; its public address (kept out of this public repo) is
set as ARSENAL_MANIFEST_URL on Render.

A re-render with the same file names (new lighting, same framing) is a drop-in swap, with no code or settings changes:
  python3 tools/arsenal_publish.py ~/Downloads/greatwar-tanks/docs/website/arsenal <out>
  python3 tools/arsenal_upload.py <out>
The manifest gives every file a ?v=<content hash>, so the new files are fetched straight away; the files themselves
are cached for a year, the manifest for a minute."""
import hashlib
import json
import os
import subprocess
import sys
import time

TYPES = {'.mp4': 'video/mp4', '.webp': 'image/webp', '.json': 'application/json', '.png': 'image/png'}


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def put(target, key, path, cache):
    """one file, tried again after a pause if the connection drops"""
    cmd = ['wrangler', 'r2', 'object', 'put', f'{target}/{key}', '--remote', '--file', path,
           '--content-type', TYPES.get(os.path.splitext(path)[1], 'application/octet-stream'), '--cache-control', cache]
    for attempt in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0:
            return
        time.sleep(5 * (attempt + 1))
    sys.exit(f'upload failed: {key}\n{r.stderr.strip()[-800:]}')


def main(out, target):
    state_file = os.path.join(out, '.uploaded.json')
    state = json.load(open(state_file)) if os.path.exists(state_file) else {}
    files = sorted(os.path.relpath(os.path.join(d, f), out) for d, _, fs in os.walk(out) for f in fs if not f.startswith('.'))
    files = [f for f in files if f != 'manifest.json'] + ['manifest.json']
    sent = 0
    for key in files:
        path = os.path.join(out, key)
        h = sha(path)
        if state.get(key) == h:
            continue
        put(target, key, path, 'public, max-age=60' if key == 'manifest.json' else 'public, max-age=31536000')
        state[key] = h
        sent += 1
        json.dump(state, open(state_file, 'w'), indent=1)       # progress survives an interruption
        print(f'  {key}', flush=True)
    print(f'{sent} uploaded, {len(files) - sent} unchanged')


if __name__ == '__main__':
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    main(os.path.expanduser(sys.argv[1]), sys.argv[2] if len(sys.argv) == 3 else 'cue-arsenal/arsenal')
