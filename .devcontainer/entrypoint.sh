#!/usr/bin/env bash
set -euo pipefail

workspace=/workspaces/flow-link
authorized_keys_source="$workspace/.devcontainer/ssh/authorized_keys"
node_ssh_dir=/home/node/.ssh
node_authorized_keys="$node_ssh_dir/authorized_keys"
host_keys_dir=/etc/ssh/flow-link-host-keys

mkdir -p "$workspace/node_modules" "$workspace/.next" /home/node/.npm /home/node/.codex /home/node/.claude
chown -R node:node /home/node "$workspace/node_modules" "$workspace/.next"

mkdir -p "$host_keys_dir"
if ! compgen -G "$host_keys_dir/ssh_host_*_key" > /dev/null; then
  cp /etc/ssh/ssh_host_*_key* "$host_keys_dir"/ 2>/dev/null || true
fi
if ! compgen -G "$host_keys_dir/ssh_host_*_key" > /dev/null; then
  ssh-keygen -A
  cp /etc/ssh/ssh_host_*_key* "$host_keys_dir"/
fi
chmod 600 "$host_keys_dir"/ssh_host_*_key
chmod 644 "$host_keys_dir"/ssh_host_*_key.pub
ln -sf "$host_keys_dir"/ssh_host_*_key "$host_keys_dir"/ssh_host_*_key.pub /etc/ssh/

mkdir -p "$node_ssh_dir"
touch "$node_authorized_keys"

if [ -s "$authorized_keys_source" ]; then
  cp "$authorized_keys_source" "$node_authorized_keys"
fi

chown -R node:node "$node_ssh_dir"
chmod 700 "$node_ssh_dir"
chmod 600 "$node_authorized_keys"

service cron start >/dev/null 2>&1 || true
if command -v crontab >/dev/null 2>&1 && [ -x "$workspace/scripts/install-codex-auto-improve-cron.sh" ]; then
  su node -s /bin/bash -c "$workspace/scripts/install-codex-auto-improve-cron.sh" >/dev/null 2>&1 || true
fi

exec "$@"
