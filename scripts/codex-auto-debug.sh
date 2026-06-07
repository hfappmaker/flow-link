#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/workspaces/flow-link}"
BRANCH="${BRANCH:-develop}"
REMOTE="${REMOTE:-origin}"
LOG_DIR="${LOG_DIR:-$REPO_DIR/.codex-automation/debug-logs}"
LOCK_FILE="${LOCK_FILE:-$REPO_DIR/.codex-automation/automation.lock}"
LAST_MESSAGE_FILE="${LAST_MESSAGE_FILE:-$REPO_DIR/.codex-automation/debug-last-message.md}"
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

log "Starting Codex auto-debug run in $REPO_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  log "Loaded environment from $ENV_FILE"
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Another Codex automation run is already active; exiting."
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
You are running as a scheduled local bug-fix automation for this repository.

Primary goal:
- Find and fix real bugs by exercising the app locally and by inspecting Vercel Preview runtime logs.
- Prioritize actual errors, exceptions, failed requests, broken user flows, bad redirects, auth/session bugs, upload/download failures, database errors, and regressions.
- This automation is for bug fixes only. Do not make product enhancements, design polish, refactors, copy changes, or speculative improvements unless they are directly required to fix a reproduced bug.

Required investigation:
- Start from a clean develop branch.
- Inspect recent Vercel Preview logs for the flow-link project, especially deployments on develop. Use Vercel CLI commands when available, such as:
  - vercel ls
  - vercel logs <deployment-url-or-id>
  - vercel inspect <deployment-url-or-id>
- Treat Vercel log errors as strong signals, but verify the root cause in code before changing anything.
- Run the app locally when feasible. Prefer a production-like local check:
  - ensure dependencies are installed
  - ensure Prisma client and database schema are ready
  - run npm run typecheck and npm run lint as needed
  - run NODE_ENV=production npm run build when relevant
  - start the app locally with npm run dev or npm run start when feasible
- Exercise realistic flows in a real browser with Playwright. The repository includes @playwright/test; use Playwright scripts or npx playwright where appropriate. In this devcontainer, launch Chromium with headless mode and sandbox disabled, for example: chromium.launch({ headless: true, chromiumSandbox: false, args: ["--no-sandbox", "--disable-setuid-sandbox"] }). If the browser cannot launch, capture the failure and use HTTP checks only as a fallback.
- Cover at least the high-risk flows when feasible: register, login, public jobs list/detail, freelancer profile/document upload, company job create/edit, application submit, and document access.

Fix policy:
- Pick exactly one confirmed bug to fix per run.
- Reproduce or identify the bug clearly before editing.
- Implement the smallest complete fix.
- Add or adjust tests only when the repo has an appropriate test pattern or the fix is risky enough to justify it.
- If the bug is caused by missing environment configuration rather than code, fix repository/devcontainer/Vercel configuration when possible, and clearly state the required environment change.
- If no confirmed bug is found, leave the working tree unchanged and explain what checks were run.

Repository rules:
- If you touch Next.js code, first read the relevant guide in node_modules/next/dist/docs/ because this project uses a Next.js version with breaking changes.
- Do not overwrite unrelated user changes.
- Keep the change coherently scoped.

Verification:
- Run relevant verification commands such as npm run typecheck, npm run lint, npm run build, targeted local browser/HTTP checks, and any direct reproduction check.
- In your final message, include:
  - the bug signal or Vercel log line that motivated the fix
  - how you reproduced or verified it
  - commands/checks run

Git:
- If you make changes, commit and push them yourself from inside this Codex run.
- Choose a concise, specific Conventional Commit subject, usually "fix: ...".
- Do not use timestamp-only or generic "automated improvement" commit subjects.
- Push with: git push $REMOTE HEAD:$BRANCH
- Do not amend existing commits.
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
