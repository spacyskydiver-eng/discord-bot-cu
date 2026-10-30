#!/bin/bash
# arsenal_sync.sh: publishes new Arsenal renders as soon as they're pushed. Checks the greatwar repo's tank-models
# branch; when docs/website/arsenal/ has changed since the last run, takes that folder from the branch, publishes it
# (arsenal_publish.py, next to this script) and uploads it to R2 (arsenal_upload.py). Safe to run by hand any time.
#
# Installed with tools/arsenal_sync_install.sh, which copies this script and the two tools into ARSENAL_WORK and has
# launchd run it every 5 minutes (background jobs can't read ~/Desktop or ~/Downloads, so it keeps its own slim
# clone of the branch there instead of using a working copy).
#
#   ARSENAL_WORK  clone, staging, web copy, log   (default ~/Library/Application Support/cue-arsenal)
#   FFMPEG        an ffmpeg with libx264
set -euo pipefail
WORK="${ARSENAL_WORK:-$HOME/Library/Application Support/cue-arsenal}"
REPO="$WORK/greatwar.git"
TOOLS="$(cd "$(dirname "$0")" && pwd)"
BRANCH=tank-models
DIR=docs/website/arsenal
mkdir -p "$WORK"
cd "$WORK"          # wrangler keeps a cache in the folder it runs from (launchd starts jobs in /)
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# one run at a time
if ! mkdir "$WORK/lock" 2>/dev/null; then
  # a lock left by a run that died more than an hour ago doesn't count
  if [ -n "$(find "$WORK/lock" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then rmdir "$WORK/lock"; mkdir "$WORK/lock"; else exit 0; fi
fi
trap 'rmdir "$WORK/lock" 2>/dev/null' EXIT

# a bare clone of just the branch; file contents are only downloaded when a version is published
if [ ! -d "$REPO" ]; then
  git clone -q --bare --single-branch --branch "$BRANCH" --filter=blob:none https://github.com/spacyskydiver-eng/greatwar.git "$REPO"
  git -C "$REPO" config credential.helper osxkeychain
  git -C "$REPO" config remote.origin.fetch "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
fi
git -C "$REPO" fetch -q origin "$BRANCH"
TREE="$(git -C "$REPO" rev-parse "origin/$BRANCH:$DIR" 2>/dev/null || true)"
[ -n "$TREE" ] || exit 0
[ "$(cat "$WORK/last-tree" 2>/dev/null || true)" = "$TREE" ] && exit 0
COMMIT="$(git -C "$REPO" rev-parse --short "origin/$BRANCH")"
log "new renders at $COMMIT ($(git -C "$REPO" log -1 --format=%s "origin/$BRANCH"))"

rm -rf "$WORK/stage"; mkdir -p "$WORK/stage"
git -C "$REPO" archive "origin/$BRANCH" "$DIR" | tar -x -C "$WORK/stage"
python3 "$TOOLS/arsenal_publish.py" "$WORK/stage/$DIR" "$WORK/pub"
python3 "$TOOLS/arsenal_upload.py" "$WORK/pub"
echo "$TREE" > "$WORK/last-tree"
echo "$COMMIT" > "$WORK/last-commit"
log "published $COMMIT"
