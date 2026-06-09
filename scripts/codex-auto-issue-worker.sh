#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/workspaces/flow-link}"
BRANCH="${BRANCH:-develop}"
REMOTE="${REMOTE:-origin}"
LOG_DIR="${LOG_DIR:-$REPO_DIR/.codex-automation/issue-worker-logs}"
LOCK_FILE="${LOCK_FILE:-$REPO_DIR/.codex-automation/issue-worker.lock}"
WORKTREE_ROOT="${WORKTREE_ROOT:-$REPO_DIR/.codex-automation/worktrees}"
CODEX_BIN="${CODEX_BIN:-codex}"
NODE_BIN_DIR="${NODE_BIN_DIR:-/usr/local/bin}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.devcontainer/.env}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/$TIMESTAMP.log"
LAST_MESSAGE_FILE="${LAST_MESSAGE_FILE:-$REPO_DIR/.codex-automation/issue-worker-last-message.md}"
DRY_RUN="${DRY_RUN:-0}"
MERGE_METHOD="${MERGE_METHOD:-squash}"
KEEP_WORKTREE="${KEEP_WORKTREE:-0}"

usage() {
  cat <<'EOF'
Usage: scripts/codex-auto-issue-worker.sh [--dry-run]

Reads one ready GitHub issue, asks Codex to implement exactly that issue in a
dedicated git worktree, then pushes a branch, opens a PR, merges it, and closes
the issue through the merged PR.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

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

ensure_label() {
  local name="$1"
  local color="$2"
  local description="$3"

  if gh label list --limit 200 --json name --jq '.[].name' | grep -Fxq "$name"; then
    gh label edit "$name" --color "$color" --description "$description" >/dev/null || true
  else
    gh label create "$name" --color "$color" --description "$description" >/dev/null
  fi
}

mark_blocked() {
  local issue_number="$1"
  local reason="$2"

  gh issue edit "$issue_number" --remove-label "codex:in-progress" >/dev/null 2>&1 || true
  gh issue edit "$issue_number" --remove-label "codex:ready" >/dev/null 2>&1 || true
  gh issue edit "$issue_number" --add-label "codex:blocked" >/dev/null 2>&1 || true
  gh issue comment "$issue_number" --body "Codex issue worker blocked: $reason" >/dev/null 2>&1 || true
}

cleanup_success_worktree() {
  local worktree_dir="${1:-}"

  if [[ -n "$worktree_dir" && "$KEEP_WORKTREE" != "1" && -d "$worktree_dir" ]]; then
    git -C "$REPO_DIR" worktree remove "$worktree_dir" --force >/dev/null 2>&1 || true
  fi
}

export PATH="$NODE_BIN_DIR:$PATH"
cd "$REPO_DIR"

log "Starting Codex issue worker run in $REPO_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  log "Loaded environment from $ENV_FILE"
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Another Codex issue worker run is already active; exiting."
  exit 0
fi

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$BRANCH" ]]; then
  fail "Expected branch $BRANCH, but current branch is $current_branch"
fi

if [[ -n "$(git status --porcelain)" && "$DRY_RUN" != "1" ]]; then
  fail "Main working tree is not clean before issue worker run."
fi

if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY_RUN=1; skipping git fetch/pull."
else
  git fetch "$REMOTE" "$BRANCH"
  git pull --ff-only "$REMOTE" "$BRANCH"
fi

if [[ -n "${GITHUB_TOKEN:-${GH_TOKEN:-}}" ]]; then
  git config --global credential.helper store
  printf 'protocol=https\nhost=github.com\npath=hfappmaker/flow-link.git\nusername=%s\npassword=%s\n\n' \
    "${GITHUB_USERNAME:-x-access-token}" \
    "${GITHUB_TOKEN:-${GH_TOKEN:-}}" | git credential approve
fi

if ! command -v gh >/dev/null 2>&1; then
  fail "gh command was not found."
fi

if ! gh auth status >/dev/null 2>&1; then
  fail "gh is not authenticated. Set GH_TOKEN or GITHUB_TOKEN and run gh auth login/setup."
fi

if [[ "$DRY_RUN" != "1" ]]; then
  ensure_label "codex" "5319E7" "Created or managed by Codex automation."
  ensure_label "codex:ready" "0E8A16" "Ready for the Codex issue worker."
  ensure_label "codex:in-progress" "FBCA04" "Currently being handled by the Codex issue worker."
  ensure_label "codex:blocked" "B60205" "Blocked automation item that needs human input."
  ensure_label "codex:done" "8250DF" "Completed by Codex automation."
  ensure_label "codex:approved" "0E8A16" "Human-approved high-risk automation item."
  ensure_label "risk:low" "C2E0C6" "Low-risk change."
  ensure_label "risk:medium" "FBCA04" "Medium-risk change."
  ensure_label "risk:high" "D93F0B" "High-risk change; requires codex:approved before worker implementation."
  ensure_label "needs:preview-write" "D4C5F9" "Preview write-path verification is allowed and requires cleanup."
fi

ISSUE_LINE="$(
  gh issue list \
    --state open \
    --label "codex" \
    --label "codex:ready" \
    --limit 50 \
    --json number,title,labels,updatedAt \
    --jq 'map(select((([.labels[].name] | index("codex:in-progress")) | not) and (([.labels[].name] | index("codex:blocked")) | not) and ((([.labels[].name] | index("risk:high")) | not) or (([.labels[].name] | index("codex:approved")))))) | sort_by(.updatedAt) | first | if . == null then empty else [.number, .title] | @tsv end'
)"

if [[ -z "$ISSUE_LINE" ]]; then
  log "No ready issue found."
  exit 0
fi

ISSUE_NUMBER="${ISSUE_LINE%%$'\t'*}"
ISSUE_TITLE="${ISSUE_LINE#*$'\t'}"

if [[ -z "$ISSUE_NUMBER" ]]; then
  fail "Failed to parse selected issue."
fi

log "Selected issue #$ISSUE_NUMBER: $ISSUE_TITLE"

if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY_RUN=1; selected issue only. Skipping labels, worktree, Codex, PR, and merge."
  printf 'issue=%s title=%s\n' "$ISSUE_NUMBER" "$ISSUE_TITLE"
  exit 0
fi

gh issue edit "$ISSUE_NUMBER" --add-label "codex:in-progress" >/dev/null

ISSUE_CONTEXT_FILE="$(mktemp)"
trap 'rm -f "$ISSUE_CONTEXT_FILE"' EXIT

gh issue view "$ISSUE_NUMBER" \
  --json number,title,body,labels,comments,url \
  >"$ISSUE_CONTEXT_FILE"

mkdir -p "$WORKTREE_ROOT"
WORK_BRANCH="codex/issue-${ISSUE_NUMBER}-${TIMESTAMP}"
WORKTREE_DIR="$WORKTREE_ROOT/issue-${ISSUE_NUMBER}-${TIMESTAMP}"

log "Creating worktree $WORKTREE_DIR on branch $WORK_BRANCH"
git worktree add -b "$WORK_BRANCH" "$WORKTREE_DIR" "$REMOTE/$BRANCH"

START_HEAD="$(git -C "$WORKTREE_DIR" rev-parse HEAD)"

PROMPT=$(cat <<PROMPT_EOF
You are running as a scheduled GitHub Issue worker for this repository.

Selected issue:
- Number: #$ISSUE_NUMBER
- Title: $ISSUE_TITLE
- Full issue context JSON is available at: $ISSUE_CONTEXT_FILE

Repository context:
- You are working in a dedicated git worktree: $WORKTREE_DIR
- Current branch: $WORK_BRANCH
- Base branch: $BRANCH

Primary goal:
- Read the selected issue and implement exactly the requested fix or improvement.
- Do not broaden the scope beyond the issue body and comments.
- Handle only this one issue in this run.

Issue rules:
- If the issue is unclear, risky, impossible, or missing required credentials/configuration, leave the worktree clean and explain the blocker in your final message.
- If the issue has label needs:preview-write, Preview write-path checks are allowed only with disposable automation-prefixed data, recorded IDs/titles/emails, and verified cleanup before the run ends.
- If the issue does not have label needs:preview-write, do not create or mutate Preview data.
- Prefer local write-path verification when feasible.

Playwright verification policy:
- If the issue has label area:bug, area:ux, or area:visual-design, Playwright browser verification is required by default before marking the issue fixed.
- For area:bug, reproduce or verify the fixed user-visible behavior in a browser when feasible.
- For area:ux, verify the relevant navigation, screen transition, form, login/register flow, empty/loading/error state, or task completion in a browser when feasible.
- For area:visual-design, screenshots are mandatory. Verify at least desktop and mobile viewports in a browser, normally 1280x900 and 375x812, and save screenshots under .codex-automation/screenshots/ with stable names that include the issue number, route, viewport, and timestamp.
- Use Chromium headless with sandbox disabled if needed: chromium.launch({ headless: true, chromiumSandbox: false, args: ["--no-sandbox", "--disable-setuid-sandbox"] }).
- If Playwright cannot run, do not silently skip it. State the exact blocker, use the best available fallback such as HTTP checks or static inspection, and leave enough detail in your final message for the PR and issue comment.
- For product or maintainability issues, Playwright is optional unless the issue acceptance criteria require visible flow verification.

Repository rules:
- If you touch Next.js code, first read the relevant guide in node_modules/next/dist/docs/ because this project uses a Next.js version with breaking changes.
- Do not overwrite unrelated user changes.
- Keep the change coherently scoped.
- Use existing project patterns.
- Do not amend existing commits.

Verification:
- Run relevant commands, usually npm run typecheck, npm run lint, npm run build, or targeted checks based on the issue.
- For area:bug, area:ux, and area:visual-design, include the Playwright scenario, target URL, viewport(s), and result in your final message. If Playwright could not run, include the exact reason and fallback checks.
- For area:visual-design, include the saved screenshot paths in your final message.
- Include commands/checks run in your final message.

Git:
- If you make changes, commit them yourself on the current worktree branch with a concise Conventional Commit subject.
- Do not push.
- Do not create a pull request.
- Do not merge.
- Do not close or edit the GitHub issue. The wrapper script handles push, PR creation, merge, labels, and close after your commit.
- Do not leave uncommitted changes.

Final message:
- Say whether the issue was fixed or blocked.
- Include the commit SHA if fixed.
- Include verification commands and any Preview/local checks.
PROMPT_EOF
)

log "Running Codex CLI for issue #$ISSUE_NUMBER in $WORKTREE_DIR"
set +e
"$CODEX_BIN" exec \
  --cd "$WORKTREE_DIR" \
  --dangerously-bypass-approvals-and-sandbox \
  --output-last-message "$LAST_MESSAGE_FILE" \
  "$PROMPT"
CODEX_STATUS=$?
set -e

if [[ "$CODEX_STATUS" -ne 0 ]]; then
  mark_blocked "$ISSUE_NUMBER" "Codex CLI exited with status $CODEX_STATUS. Worktree kept at $WORKTREE_DIR. See $LOG_FILE."
  exit "$CODEX_STATUS"
fi

if [[ -n "$(git -C "$WORKTREE_DIR" status --porcelain)" ]]; then
  log "Codex issue worker left uncommitted changes in worktree:"
  git -C "$WORKTREE_DIR" status --short
  mark_blocked "$ISSUE_NUMBER" "Codex left uncommitted changes in $WORKTREE_DIR. See $LOG_FILE."
  fail "Codex must commit its own changes."
fi

END_HEAD="$(git -C "$WORKTREE_DIR" rev-parse HEAD)"

if [[ "$START_HEAD" == "$END_HEAD" ]]; then
  SUMMARY="$(sed -n '1,180p' "$LAST_MESSAGE_FILE" 2>/dev/null || true)"
  NO_COMMIT_COMMENT=$(cat <<COMMENT_EOF
Codex issue worker did not create a commit and is leaving this issue open.

Worktree: $WORKTREE_DIR

$SUMMARY
COMMENT_EOF
)
  gh issue comment "$ISSUE_NUMBER" --body "$NO_COMMIT_COMMENT" >/dev/null || true
  gh issue edit "$ISSUE_NUMBER" --remove-label "codex:in-progress" >/dev/null 2>&1 || true
  gh issue edit "$ISSUE_NUMBER" --remove-label "codex:ready" >/dev/null 2>&1 || true
  gh issue edit "$ISSUE_NUMBER" --add-label "codex:blocked" >/dev/null 2>&1 || true
  log "No commit was created for issue #$ISSUE_NUMBER; marked blocked."
  exit 0
fi

log "Pushing branch $WORK_BRANCH"
git -C "$WORKTREE_DIR" push "$REMOTE" "HEAD:$WORK_BRANCH"

SUMMARY="$(sed -n '1,220p' "$LAST_MESSAGE_FILE" 2>/dev/null || true)"
PR_BODY=$(cat <<PR_EOF
Closes #$ISSUE_NUMBER

Implemented by Codex issue worker.

Commit: $END_HEAD
Worktree: $WORKTREE_DIR

## Codex Summary
$SUMMARY
PR_EOF
)

PR_URL="$(
  gh pr create \
    --base "$BRANCH" \
    --head "$WORK_BRANCH" \
    --title "Codex: $ISSUE_TITLE" \
    --body "$PR_BODY"
)"

log "Created PR $PR_URL"

gh issue comment "$ISSUE_NUMBER" --body "Codex issue worker opened PR: $PR_URL" >/dev/null

set +e
gh pr merge "$PR_URL" \
  --"$MERGE_METHOD" \
  --delete-branch \
  --subject "Codex: $ISSUE_TITLE" \
  --body "Closes #$ISSUE_NUMBER"
MERGE_STATUS=$?
set -e

if [[ "$MERGE_STATUS" -ne 0 ]]; then
  mark_blocked "$ISSUE_NUMBER" "PR was created but could not be merged automatically: $PR_URL"
  fail "PR merge failed: $PR_URL"
fi

gh issue edit "$ISSUE_NUMBER" --remove-label "codex:in-progress" >/dev/null 2>&1 || true
gh issue edit "$ISSUE_NUMBER" --remove-label "codex:ready" >/dev/null 2>&1 || true
gh issue edit "$ISSUE_NUMBER" --add-label "codex:done" >/dev/null 2>&1 || true
gh issue comment "$ISSUE_NUMBER" --body "Codex issue worker merged PR: $PR_URL" >/dev/null || true

git fetch "$REMOTE" "$BRANCH"
git pull --ff-only "$REMOTE" "$BRANCH"
cleanup_success_worktree "$WORKTREE_DIR"

log "Codex issue worker completed issue #$ISSUE_NUMBER with branch commit $END_HEAD and merged PR $PR_URL"
