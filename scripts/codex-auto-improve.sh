#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/workspaces/flow-link}"
BRANCH="${BRANCH:-develop}"
REMOTE="${REMOTE:-origin}"
LOG_DIR="${LOG_DIR:-$REPO_DIR/.codex-automation/logs}"
LOCK_FILE="${LOCK_FILE:-$REPO_DIR/.codex-automation/auto-improve.lock}"
LAST_MESSAGE_FILE="${LAST_MESSAGE_FILE:-$REPO_DIR/.codex-automation/last-message.md}"
CODEX_BIN="${CODEX_BIN:-codex}"
NODE_BIN_DIR="${NODE_BIN_DIR:-/usr/local/bin}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/$TIMESTAMP.log"

mkdir -p "$LOG_DIR"
ln -sfn "$(basename "$LOG_FILE")" "$LOG_DIR/latest.log"

exec >>"$LOG_FILE" 2>&1

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

export PATH="$NODE_BIN_DIR:$PATH"
cd "$REPO_DIR"

log "Starting Codex auto-improve run in $REPO_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Another auto-improve run is already active; exiting."
  exit 0
fi

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$BRANCH" ]]; then
  fail "Expected branch $BRANCH, but current branch is $current_branch"
fi

if [[ -n "$(git status --porcelain)" ]]; then
  fail "Working tree is not clean before automation run."
fi

git fetch "$REMOTE" "$BRANCH"
git pull --ff-only "$REMOTE" "$BRANCH"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "DRY_RUN=1; prerequisites passed. Skipping Codex, commit, and push."
  exit 0
fi

PROMPT=$(cat <<'PROMPT_EOF'
You are running as a scheduled local automation for this repository.

Goal:
- Consider improvements from competitor comparison, UI/UX quality, and maintainability.
- Pick exactly one small, safe, high-value improvement that fits the existing codebase.
- Implement it completely.
- Keep the change narrowly scoped.
- If you touch Next.js code, first read the relevant guide in node_modules/next/dist/docs/ because this project uses a Next.js version with breaking changes.
- Run relevant verification commands such as npm run typecheck, npm run lint, and/or npm run build when appropriate.
- Do not commit or push; the wrapper script will handle git.

If there is no safe worthwhile change, leave the working tree unchanged and explain why.
PROMPT_EOF
)

log "Running Codex CLI"
"$CODEX_BIN" exec \
  --cd "$REPO_DIR" \
  --sandbox workspace-write \
  --output-last-message "$LAST_MESSAGE_FILE" \
  "$PROMPT"

if [[ -z "$(git status --porcelain)" ]]; then
  log "Codex made no changes."
  exit 0
fi

log "Changes after Codex run:"
git status --short

if npm run typecheck; then
  log "typecheck passed"
else
  fail "typecheck failed; leaving changes uncommitted for inspection."
fi

if npm run lint; then
  log "lint passed"
else
  fail "lint failed; leaving changes uncommitted for inspection."
fi

git add -A

if git diff --cached --quiet; then
  log "No staged changes after git add."
  exit 0
fi

commit_subject="chore: automated improvement $TIMESTAMP"
commit_body="$(cat "$LAST_MESSAGE_FILE" 2>/dev/null || true)"

git commit -m "$commit_subject" -m "$commit_body"
git push "$REMOTE" "HEAD:$BRANCH"

log "Committed and pushed to $REMOTE/$BRANCH"
