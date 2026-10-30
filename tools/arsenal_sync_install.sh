#!/bin/bash
# arsenal_sync_install.sh: sets up (or updates) the automatic Arsenal publishing on this Mac: copies arsenal_sync.sh,
# arsenal_publish.py and arsenal_upload.py into ~/Library/Application Support/cue-arsenal and has launchd run the
# sync every 5 minutes (log: that folder's sync.log). Run it again after changing any of the three tools.
set -euo pipefail
WORK="$HOME/Library/Application Support/cue-arsenal"
HERE="$(cd "$(dirname "$0")" && pwd)"
FFMPEG="${FFMPEG:-$HOME/Library/Application Support/ModrinthApp/profiles/Lucidity+/dreamdisplays/ffmpeg/macos-aarch64/ffmpeg}"
PLIST="$HOME/Library/LaunchAgents/com.cue.arsenal-sync.plist"
mkdir -p "$WORK"
cp "$HERE/arsenal_sync.sh" "$HERE/arsenal_publish.py" "$HERE/arsenal_upload.py" "$WORK/"
chmod +x "$WORK/arsenal_sync.sh"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.cue.arsenal-sync</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$WORK/arsenal_sync.sh</string></array>
  <key>WorkingDirectory</key><string>$WORK</string>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$HOME/.local/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/3.14/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>FFMPEG</key><string>$FFMPEG</string>
  </dict>
  <key>StandardOutPath</key><string>$WORK/sync.log</string>
  <key>StandardErrorPath</key><string>$WORK/sync.log</string>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>10</integer>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/com.cue.arsenal-sync" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed: launchd runs $WORK/arsenal_sync.sh every 5 minutes; log $WORK/sync.log"
