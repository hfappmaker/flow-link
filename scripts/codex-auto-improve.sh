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
ENV_FILE="${ENV_FILE:-$REPO_DIR/.devcontainer/.env}"
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

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  log "Loaded environment from $ENV_FILE"
fi

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

if [[ -n "${GITHUB_TOKEN:-${GH_TOKEN:-}}" ]]; then
  git config --global credential.helper store
  printf 'protocol=https\nhost=github.com\npath=hfappmaker/flow-link.git\nusername=%s\npassword=%s\n\n' \
    "${GITHUB_USERNAME:-x-access-token}" \
    "${GITHUB_TOKEN:-${GH_TOKEN:-}}" | git credential approve
fi

if ! git push --dry-run "$REMOTE" "HEAD:$BRANCH" >/dev/null; then
  fail "Git push dry-run failed. Configure GitHub push auth before running automation."
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "DRY_RUN=1; prerequisites passed. Skipping Codex, commit, and push."
  exit 0
fi

PROMPT=$(cat <<PROMPT_EOF
You are running as a scheduled local automation for this repository.

Goal:
- Continuously improve this product so it can compete with freelance/job matching services such as Levatech and Findy.
- Prioritize the product's core differentiation: companies and freelancers can communicate and proceed directly without an agency or sales agent in the middle.
- Consider improvements to direct matching, job discovery, application flow, company/freelancer profiles, messaging/contact handoff, trust signals, onboarding, conversion, UI/UX quality, and maintainability.
- Pick exactly one safe, high-value improvement that fits the existing codebase. Medium-sized changes are allowed when they clearly strengthen the core direct-matching experience.
- Implement it completely.
- Keep the change coherently scoped. Avoid broad rewrites, speculative platform pivots, or partially finished multi-area changes.
- If you touch Next.js code, first read the relevant guide in node_modules/next/dist/docs/ because this project uses a Next.js version with breaking changes.
- Run relevant verification commands such as npm run typecheck, npm run lint, and/or npm run build when appropriate.
- If you make changes, commit and push them yourself from inside this Codex run.
- Choose a concise, specific commit subject yourself after reviewing the final diff.
- Use Conventional Commit style when it fits, such as "fix:", "feat:", "refactor:", "docs:", "test:", or "chore:".
- Do not use a generic timestamp-only or "automated improvement" commit subject.
- Push with: git push $REMOTE HEAD:$BRANCH
- Do not amend existing commits.

If there is no safe worthwhile change, leave the working tree unchanged and explain why.
PROMPT_EOF
)

log "Running Codex CLI"
"$CODEX_BIN" exec \
  --cd "$REPO_DIR" \
  --dangerously-bypass-approvals-and-sandbox \
  --output-last-message "$LAST_MESSAGE_FILE" \
  "$PROMPT"

if [[ -z "$(git status --porcelain)" ]]; then
  log "Codex left the working tree clean."
else
  log "Codex left uncommitted changes:"
  git status --short
  fail "Codex must commit and push its own changes."
fi

local_head="$(git rev-parse HEAD)"
remote_head="$(git ls-remote "$REMOTE" "refs/heads/$BRANCH" | awk '{print $1}')"
if [[ "$local_head" != "$remote_head" ]]; then
  fail "Local HEAD $local_head is not pushed to $REMOTE/$BRANCH ($remote_head)."
fi

log "Codex completed with HEAD pushed to $REMOTE/$BRANCH"
