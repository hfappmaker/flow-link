#!/usr/bin/env bash
set -Eeuo pipefail

CRON_TARGET="/etc/cron.d/flow-link-codex-auto-debug"

sudo rm -f "$CRON_TARGET"
sudo service cron reload >/dev/null 2>&1 || sudo service cron start >/dev/null 2>&1 || true

echo "Codex auto-debug cron is disabled."
