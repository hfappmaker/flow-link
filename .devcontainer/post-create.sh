#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/flow-link

mkdir -p "$HOME/.local/share/npm"
git config --global --add safe.directory /workspaces/flow-link

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

npm run prisma:generate

if command -v gh >/dev/null 2>&1; then
  github_token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  if [ -n "$github_token" ] && ! gh auth status >/dev/null 2>&1; then
    printf '%s' "$github_token" | gh auth login --with-token >/dev/null 2>&1 || true
  fi
  gh auth setup-git >/dev/null 2>&1 || true
fi

echo
echo "DevContainer is ready."
echo "SSH from the host with: ssh flow-link-devcontainer"
echo "Start the app with: npm run dev"
