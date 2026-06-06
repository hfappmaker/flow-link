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

echo
echo "DevContainer is ready."
echo "SSH from the host with: ssh flow-link-devcontainer"
echo "Start the app with: npm run dev"
