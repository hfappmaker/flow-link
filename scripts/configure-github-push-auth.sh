#!/usr/bin/env bash
set -Eeuo pipefail

REMOTE_HOST="${REMOTE_HOST:-github.com}"
REMOTE_PATH="${REMOTE_PATH:-hfappmaker/flow-link.git}"
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
USERNAME="${GITHUB_USERNAME:-x-access-token}"

if [[ -z "$TOKEN" ]]; then
  if [[ -t 0 ]]; then
    read -r -s -p "GitHub token for $REMOTE_PATH: " TOKEN
    echo
  fi
fi

if [[ -z "$TOKEN" ]]; then
  echo "Set GITHUB_TOKEN or GH_TOKEN, or run this script from an interactive terminal." >&2
  echo "The token needs repository write access for $REMOTE_PATH." >&2
  exit 1
fi

git config --global credential.helper store

printf 'protocol=https\nhost=%s\npath=%s\nusername=%s\npassword=%s\n\n' \
  "$REMOTE_HOST" \
  "$REMOTE_PATH" \
  "$USERNAME" \
  "$TOKEN" | git credential approve

echo "Stored GitHub HTTPS credentials for $REMOTE_HOST/$REMOTE_PATH"
echo "You can now run: git push origin develop"
