#!/usr/bin/env bash
set -Eeuo pipefail

CRON_TARGET="/etc/cron.d/flow-link-codex-auto-improve"

sudo rm -f "$CRON_TARGET"

if command -v crontab >/dev/null 2>&1; then
  crontab -l 2>/dev/null | grep -v 'flow-link-codex-auto-improve' | crontab - || true
fi

sudo service cron reload >/dev/null 2>&1 || sudo service cron start >/dev/null 2>&1 || true

echo "Codex auto-improve cron is disabled."
