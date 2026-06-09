#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/workspaces/flow-link}"
CRON_SOURCE="$REPO_DIR/.devcontainer/flow-link-codex-issue-loops.cron"
CRON_TARGET="/etc/cron.d/flow-link-codex-issue-loops"

if [[ ! -f "$CRON_SOURCE" ]]; then
  echo "Cron definition not found: $CRON_SOURCE" >&2
  exit 1
fi

if ! command -v service >/dev/null 2>&1 && [[ ! -x /usr/sbin/cron ]]; then
  echo "cron is not installed. Rebuild the devcontainer image." >&2
  exit 1
fi

sudo cp "$CRON_SOURCE" "$CRON_TARGET"
sudo chmod 0644 "$CRON_TARGET"

# Keep the new issue-based loop from running alongside the older direct
# commit/push loops.
sudo rm -f /etc/cron.d/flow-link-codex-auto-improve
sudo rm -f /etc/cron.d/flow-link-codex-auto-debug

if command -v crontab >/dev/null 2>&1; then
  crontab -l 2>/dev/null \
    | grep -v 'flow-link-codex-auto-improve' \
    | grep -v 'flow-link-codex-auto-debug' \
    | grep -v 'flow-link-codex-issue-loops' \
    | crontab - || true
fi

sudo service cron start >/dev/null 2>&1 || sudo /usr/sbin/cron

echo "Codex issue loops cron is enabled:"
sudo sed -n '1,120p' "$CRON_TARGET"
