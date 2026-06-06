#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/workspaces/flow-link}"
SCRIPT="$REPO_DIR/scripts/codex-auto-improve.sh"
CRON_MARKER="flow-link-codex-auto-improve"
SCHEDULE="${SCHEDULE:-*/20 * * * *}"
CRON_LINE="$SCHEDULE $SCRIPT # $CRON_MARKER"

if [[ ! -x "$SCRIPT" ]]; then
  echo "Expected executable script at $SCRIPT" >&2
  echo "Run: chmod +x $SCRIPT" >&2
  exit 1
fi

if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab command was not found. Install cron, or run this on a host with cron available." >&2
  exit 1
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

crontab -l 2>/dev/null | grep -v "$CRON_MARKER" >"$tmp" || true
printf '%s\n' "$CRON_LINE" >>"$tmp"
crontab "$tmp"

echo "Installed cron entry:"
echo "$CRON_LINE"
