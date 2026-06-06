#!/usr/bin/env bash
set -euo pipefail

workspace=/workspaces/flow-link
authorized_keys_source="$workspace/.devcontainer/ssh/authorized_keys"
node_ssh_dir=/home/node/.ssh
node_authorized_keys="$node_ssh_dir/authorized_keys"

mkdir -p "$workspace/node_modules" "$workspace/.next" /home/node/.npm /home/node/.codex /home/node/.claude
chown -R node:node /home/node "$workspace/node_modules" "$workspace/.next"

mkdir -p "$node_ssh_dir"
touch "$node_authorized_keys"

if [ -s "$authorized_keys_source" ]; then
  cp "$authorized_keys_source" "$node_authorized_keys"
fi

chown -R node:node "$node_ssh_dir"
chmod 700 "$node_ssh_dir"
chmod 600 "$node_authorized_keys"

exec "$@"
