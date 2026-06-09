#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/workspaces/flow-link}"
BRANCH="${BRANCH:-develop}"
REMOTE="${REMOTE:-origin}"
LOG_DIR="${LOG_DIR:-$REPO_DIR/.codex-automation/issue-triage-logs}"
LOCK_FILE="${LOCK_FILE:-$REPO_DIR/.codex-automation/automation.lock}"
CODEX_BIN="${CODEX_BIN:-codex}"
NODE_BIN_DIR="${NODE_BIN_DIR:-/usr/local/bin}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.devcontainer/.env}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
MODE=""
DRY_RUN="${DRY_RUN:-0}"

usage() {
  cat <<'EOF'
Usage: scripts/codex-auto-issue-triage.sh --mode <bug|product|ux|visual-design|maintainability> [--dry-run]

Creates or updates GitHub issues for one triage perspective. This script must not
edit repository files, commit, or push.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
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

case "$MODE" in
  bug)
    AREA_LABEL="area:bug"
    MODE_TITLE="Bug triage"
    MODE_FOCUS="Find real runtime errors and broken flows from Vercel Preview logs, local checks, DB/Blob/API failures, form failures, redirects, and browser-visible errors. Navigation that fails with 404/500 belongs here."
    BROWSER_POLICY="Playwright browser verification is required by default for bug triage. Reproduce or inspect the user-visible failure with Playwright against localhost or Preview before creating an issue. If Playwright cannot run, use HTTP/log checks as a fallback and state the exact browser launch or environment blocker in the issue Evidence and Verification plan."
    ;;
  product)
    AREA_LABEL="area:product"
    MODE_TITLE="Product triage"
    MODE_FOCUS="Find product gaps from competitor comparison, user value, positioning, business workflow, trust, matching quality, conversion, and whether the service solves the right user problem."
    BROWSER_POLICY="Playwright is optional for product triage. Use it when evaluating an existing user flow; otherwise competitor research, static inspection, and product reasoning are sufficient."
    ;;
  ux)
    AREA_LABEL="area:ux"
    MODE_TITLE="UX triage"
    MODE_FOCUS="Find issues in navigation, screen transitions, user flow, confusing copy, input burden, empty/loading/error states, and developer-facing terms that freelancers or companies should not need to understand."
    BROWSER_POLICY="Playwright browser verification is required by default for UX triage when the issue concerns navigation, screen transitions, forms, login/register flows, empty/loading/error states, or task completion. Copy-only issues may use static inspection. If Playwright cannot run, state the exact blocker in the issue Evidence and Verification plan."
    ;;
  visual-design)
    AREA_LABEL="area:visual-design"
    MODE_TITLE="Visual design triage"
    MODE_FOCUS="Find visual design issues in layout, spacing, hierarchy, scanability, responsive behavior, current-location indicators, component consistency, and whether screens look professionally composed."
    BROWSER_POLICY="Playwright browser verification is required by default for visual-design triage. Capture or inspect at least desktop and mobile viewports before creating an issue. If screenshots or browser launch fail, state the exact blocker in the issue Evidence and Verification plan."
    ;;
  maintainability)
    AREA_LABEL="area:maintainability"
    MODE_TITLE="Maintainability triage"
    MODE_FOCUS="Find maintainability risks in code structure, responsibility boundaries, type safety, duplicated logic, missing tests, fragile data flow, unsafe assumptions, and operational risk."
    BROWSER_POLICY="Playwright is not required for maintainability triage unless the maintainability concern is tied to a visible flow. Prefer static inspection, typecheck, lint, tests, and build signals."
    ;;
  *)
    echo "Missing or invalid --mode: $MODE" >&2
    usage >&2
    exit 2
    ;;
esac

LOG_FILE="$LOG_DIR/$MODE-$TIMESTAMP.log"
LAST_MESSAGE_FILE="${LAST_MESSAGE_FILE:-$REPO_DIR/.codex-automation/issue-triage-$MODE-last-message.md}"

mkdir -p "$LOG_DIR"
ln -sfn "$(basename "$LOG_FILE")" "$LOG_DIR/$MODE-latest.log"

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

export PATH="$NODE_BIN_DIR:$PATH"
cd "$REPO_DIR"

log "Starting Codex issue triage run mode=$MODE in $REPO_DIR"

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

if [[ -n "$(git status --porcelain)" && "$DRY_RUN" != "1" ]]; then
  fail "Working tree is not clean before issue triage run."
fi

if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY_RUN=1; skipping git fetch/pull."
else
  git fetch "$REMOTE" "$BRANCH"
  git pull --ff-only "$REMOTE" "$BRANCH"
fi

if ! command -v gh >/dev/null 2>&1; then
  fail "gh command was not found."
fi

if ! gh auth status >/dev/null 2>&1; then
  fail "gh is not authenticated. Set GH_TOKEN or GITHUB_TOKEN and run gh auth login/setup."
fi

PROMPT=$(cat <<PROMPT_EOF
You are running as a scheduled GitHub Issue triage automation for this repository.

Mode:
- $MODE
- $MODE_FOCUS

Hard rules:
- Do not edit repository files.
- Do not commit.
- Do not push.
- Do not run formatters or code generators that modify tracked files.
- You may read files, run read-only checks, inspect logs, use network access, and use the gh CLI to create or update GitHub issues.
- Create or update at most one GitHub issue in this run.
- If no worthwhile issue exists, create no issue and explain why.

Browser verification policy:
- $BROWSER_POLICY
- Prefer Playwright with Chromium in headless mode and sandbox disabled when needed, for example: chromium.launch({ headless: true, chromiumSandbox: false, args: ["--no-sandbox", "--disable-setuid-sandbox"] }).
- Prefer read-only browser checks. Do not write to Preview unless the issue truly needs it; if Preview write-path verification is needed, label the issue needs:preview-write and define cleanup requirements.
- Include the browser target, viewport(s), observed result, and any fallback reason in the issue body.

Repository workflow:
- Use gh CLI in this repository.
- Before creating a new issue, search open issues with labels "codex" and "$AREA_LABEL".
- Deduplicate by fingerprint. Issue bodies must contain an HTML marker:
  <!-- codex:fingerprint=$MODE:<stable-kebab-case-summary> -->
- If an open issue with the same fingerprint exists, add a comment with any new evidence instead of creating a duplicate.

Labels:
- Every automated issue must include: codex, $AREA_LABEL, codex:ready.
- Add exactly one risk label: risk:low, risk:medium, or risk:high.
- If Preview write-path verification is needed, add needs:preview-write and explain the required cleanup.
- risk:high issues will not be implemented by the worker unless codex:approved is later added.

Classification:
- Screen transitions and user flow problems usually belong to area:ux.
- Navigation that fails with 404/500, broken redirects, or runtime errors belongs to area:bug.
- Business workflow or service-positioning questions belong to area:product.
- Navigation visual treatment, current-location indicators, and layout consistency belong to area:visual-design.

Issue body format:
## Summary
## Evidence
## User impact
## Acceptance criteria
## Out of scope
## Risk
## Environment
## Preview write policy
## Verification plan

Quality bar:
- Write issues from the freelancer/company user's perspective.
- Avoid developer-facing UI terms such as MVC, MVP, direct matching, direct contract, direct match, core differentiation, or implementation jargon unless the issue is explicitly about source code maintainability.
- For product mode, use current public competitor or adjacent-market information when network access is available, and include source URLs in the issue body.
- For bug mode, treat Vercel Preview logs as strong signals but describe the likely user-visible failure, not just the stack trace.
- For maintainability mode, tie code risk to a concrete future bug, operating cost, or verification gap.

End by summarizing whether you created an issue, updated an issue, or skipped this run.
PROMPT_EOF
)

if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY_RUN=1; prerequisites passed. Skipping label writes and Codex. Prompt follows."
  printf '%s\n' "$PROMPT"
  exit 0
fi

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
ensure_label "$AREA_LABEL" "1D76DB" "$MODE_TITLE area."

log "Running Codex CLI for issue triage"
"$CODEX_BIN" exec \
  --cd "$REPO_DIR" \
  --dangerously-bypass-approvals-and-sandbox \
  --output-last-message "$LAST_MESSAGE_FILE" \
  "$PROMPT"

if [[ -n "$(git status --porcelain)" ]]; then
  log "Codex issue triage left repository changes:"
  git status --short
  fail "Issue triage must not edit repository files."
fi

log "Codex issue triage completed mode=$MODE"
