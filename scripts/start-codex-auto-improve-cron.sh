#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/workspaces/flow-link}"
CRON_SOURCE="$REPO_DIR/.devcontainer/flow-link-codex-auto-improve.cron"
CRON_TARGET="/etc/cron.d/flow-link-codex-auto-improve"

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

if command -v crontab >/dev/null 2>&1; then
  crontab -l 2>/dev/null | grep -v 'flow-link-codex-auto-improve' | crontab - || true
fi

sudo service cron start >/dev/null 2>&1 || sudo /usr/sbin/cron

echo "Codex auto-improve cron is enabled:"
sudo sed -n '1,120p' "$CRON_TARGET"
