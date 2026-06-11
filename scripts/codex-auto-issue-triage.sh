#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/workspaces/flow-link}"
BRANCH="${BRANCH:-develop}"
REMOTE="${REMOTE:-origin}"
LOG_DIR="${LOG_DIR:-$REPO_DIR/.codex-automation/issue-triage-logs}"
LOCK_FILE="${LOCK_FILE:-$REPO_DIR/.codex-automation/issue-triage.lock}"
CODEX_BIN="${CODEX_BIN:-codex}"
NODE_BIN_DIR="${NODE_BIN_DIR:-/usr/local/bin}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.devcontainer/.env}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
MODE=""
DRY_RUN="${DRY_RUN:-0}"
MATURITY_GATE_ENABLED="${MATURITY_GATE_ENABLED:-1}"
MAX_READY_ISSUES="${MAX_READY_ISSUES:-8}"
MAX_READY_PER_MODE="${MAX_READY_PER_MODE:-3}"
MAX_RECENT_MODE_ISSUES="${MAX_RECENT_MODE_ISSUES:-3}"
RECENT_ISSUE_DAYS="${RECENT_ISSUE_DAYS:-1}"

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
    LOCAL_APP_PORT="3011"
    MODE_FOCUS="Find real runtime errors and broken flows from Vercel Preview logs, local checks, DB/Blob/API failures, form failures, redirects, and browser-visible errors. Navigation that fails with 404/500 belongs here."
    BROWSER_POLICY="Playwright browser verification is required by default for bug triage. Reproduce or inspect the user-visible failure with Playwright against localhost or Preview before creating an issue. If Playwright cannot run, use HTTP/log checks as a fallback and state the exact browser launch or environment blocker in the issue Evidence and Verification plan."
    MODE_POLICY=$(cat <<'EOF'
Bug checklist:
- Find user-visible failures, not only stack traces: 404/500, broken redirects, failed forms, DB/Blob/Auth/API errors, and Preview/local runtime errors.
- Prefer Vercel Preview logs and Playwright/HTTP reproduction when available.
- For Vercel errors, explain the likely user impact and affected route/action.
- Do not file a bug for mere copy, option design, or product preference unless it causes broken or unsafe behavior.
EOF
)
    ;;
  product)
    AREA_LABEL="area:product"
    MODE_TITLE="Product triage"
    LOCAL_APP_PORT="3012"
    MODE_FOCUS="Find product gaps from competitor comparison, user value, positioning, business workflow, trust, matching quality, conversion, semantic correctness of search/filter/recommendation/rate/trust behavior, and whether the service solves the right user problem."
    BROWSER_POLICY="Playwright is optional for product triage. Use it when evaluating an existing user flow; otherwise competitor research, static inspection, and product reasoning are sufficient."
    MODE_POLICY=$(cat <<'EOF'
Product checklist:
- Prioritize gaps that affect acquisition, activation, trust, speed to useful match/application, fit clarity, or competitor switching.
- Compare Flow Link with current competitor or adjacent-market behavior when network access is available; include source URLs.
- Audit search, filters, recommendations, saved searches, alerts, rate/price behavior, trust labels, readiness gates, and marketplace matching.
- Look for semantic correctness gaps: UI copy promises concrete behavior, but implementation uses free-text matching, keyword contains checks, loose heuristics, hard-coded fragments, incomplete placeholders, or duplicated ad hoc parsing.
- Look for option granularity gaps: controls whose choices are too narrow, arbitrary, or implementation-shaped, such as a single hard-coded threshold where users need practical bands.
- For semantic or option issues, include the user-facing promise, actual implementation rule, incorrect pass/fail examples, and the durable model/parser/test boundary needed.
- Treat applying and publishing readiness as marketplace product quality: prefer actionable readiness guidance before hard blocks, and hard-block only when missing data would harm the other side.
EOF
)
    ;;
  ux)
    AREA_LABEL="area:ux"
    MODE_TITLE="UX triage"
    LOCAL_APP_PORT="3013"
    MODE_FOCUS="Find issues in navigation, screen transitions, user flow, missing pending/loading feedback, confusing copy, input burden, empty/loading/error states, and developer-facing terms that freelancers or companies should not need to understand."
    BROWSER_POLICY="Playwright browser verification is required by default for UX triage when the issue concerns navigation, screen transitions, missing route-transition or form-submit pending feedback, forms, login/register flows, empty/loading/error states, or task completion. Copy-only issues may use static inspection. If Playwright cannot run, state the exact blocker in the issue Evidence and Verification plan."
    MODE_POLICY=$(cat <<'EOF'
UX checklist:
- Focus on navigation, screen transitions, user flow, pending/loading feedback, form-submit feedback, copy clarity, input burden, and empty/loading/error states.
- Treat missing feedback after clicking links, submitting forms, switching filters, or starting navigation as issue-worthy unless already covered.
- Avoid developer-facing terms such as MVC, MVP, direct matching, direct contract, core differentiation, or implementation jargon in user-facing flows.
- Use Playwright for navigation, forms, pending/loading, and task-completion issues. Copy-only issues may use static inspection.
- If behavior fails with 404/500 or a runtime error, classify it as bug instead.
EOF
)
    ;;
  visual-design)
    AREA_LABEL="area:visual-design"
    MODE_TITLE="Visual design triage"
    LOCAL_APP_PORT="3014"
    MODE_FOCUS="Find visual design issues in layout, spacing, hierarchy, scanability, responsive behavior, current-location indicators, component consistency, and whether screens look professionally composed."
    BROWSER_POLICY="Playwright browser verification and screenshots are required for visual-design triage. Capture at least desktop and mobile screenshots before creating an issue, normally 1280x900 and 375x812. Save screenshots under .codex-automation/screenshots/ with stable names that include the mode, route, viewport, and timestamp. Include screenshot paths and visual observations in the issue Evidence section. If screenshots or browser launch fail, do not create a visual-design issue unless the issue is still critical; state the exact blocker in Evidence and Verification plan."
    MODE_POLICY=$(cat <<'EOF'
Visual-design checklist:
- Focus on layout, spacing, hierarchy, scanability, responsive behavior, current-location indicators, and component consistency.
- Screenshots are mandatory evidence for normal visual-design issues. Capture desktop and mobile, normally 1280x900 and 375x812.
- Include exact screenshot paths and concrete visual observations.
- Do not file purely aesthetic preferences unless they affect trust, clarity, conversion, repeated use, or professional polish.
- If the problem is navigation behavior or copy comprehension, classify as UX. If it is a runtime failure, classify as bug.
EOF
)
    ;;
  maintainability)
    AREA_LABEL="area:maintainability"
    MODE_TITLE="Maintainability triage"
    LOCAL_APP_PORT="3015"
    MODE_FOCUS="Find maintainability risks in code structure, responsibility boundaries, type safety, duplicated logic, missing tests, fragile data flow, unsafe assumptions, and operational risk."
    BROWSER_POLICY="Playwright is not required for maintainability triage unless the maintainability concern is tied to a visible flow. Prefer static inspection, typecheck, lint, tests, and build signals."
    MODE_POLICY=$(cat <<'EOF'
Maintainability checklist:
- Focus on responsibility boundaries, type safety, duplicated logic, missing tests, fragile data flow, parser/type drift, and operational risk.
- Tie every issue to a concrete future bug, operating cost, verification gap, or marketplace reliability risk.
- Mention product/user impact, but do not create broad product feature issues from maintainability mode.
- Approximate string matching, duplicated ad hoc parsing, missing normalized fields, or missing semantic tests are maintainability risks when they can cause inconsistent behavior across search, alerts, trust, readiness, or recommendations.
- Prefer static inspection, targeted tests, typecheck, lint, and build signals. Use Playwright only when the risk is visible-flow dependent.
EOF
)
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

count_issues() {
  gh issue list "$@" --json number --jq 'length' 2>/dev/null || printf '0\n'
}

count_recent_mode_issues() {
  gh issue list \
    --state all \
    --label "codex" \
    --label "$AREA_LABEL" \
    --limit 100 \
    --json createdAt \
    --jq "[.[] | select((now - (.createdAt | fromdateiso8601)) <= ($RECENT_ISSUE_DAYS * 86400))] | length" \
    2>/dev/null || printf '0\n'
}

run_maturity_gate() {
  if [[ "$MATURITY_GATE_ENABLED" != "1" ]]; then
    log "MATURITY_GATE_ENABLED=$MATURITY_GATE_ENABLED; maturity gate is disabled."
    return 0
  fi

  local ready_total ready_mode recent_mode
  ready_total="$(count_issues --state open --label "codex" --label "codex:ready" --limit 100)"
  ready_mode="$(count_issues --state open --label "codex" --label "codex:ready" --label "$AREA_LABEL" --limit 100)"
  recent_mode="$(count_recent_mode_issues)"

  log "Maturity gate: ready_total=$ready_total/$MAX_READY_ISSUES ready_mode=$ready_mode/$MAX_READY_PER_MODE recent_mode_${RECENT_ISSUE_DAYS}d=$recent_mode/$MAX_RECENT_MODE_ISSUES"

  if (( ready_total >= MAX_READY_ISSUES )); then
    log "Maturity gate skipped $MODE triage: open codex:ready backlog is at or above threshold."
    exit 0
  fi

  if (( ready_mode >= MAX_READY_PER_MODE )); then
    log "Maturity gate skipped $MODE triage: this mode already has enough open codex:ready issues."
    exit 0
  fi

  if (( recent_mode >= MAX_RECENT_MODE_ISSUES )); then
    log "Maturity gate skipped $MODE triage: this mode created enough recent issues in the last $RECENT_ISSUE_DAYS days."
    exit 0
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
  log "Another Codex issue triage run is already active; exiting."
  exit 0
fi

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$BRANCH" && "${SKIP_BRANCH_CHECK:-0}" != "1" ]]; then
  fail "Expected branch $BRANCH, but current branch is $current_branch"
elif [[ "$current_branch" != "$BRANCH" ]]; then
  log "Skipping branch-name check because SKIP_BRANCH_CHECK=1. current_branch=${current_branch:-detached}, expected=$BRANCH"
fi

DIRTY_TREE=0
if [[ -n "$(git status --porcelain)" ]]; then
  DIRTY_TREE=1
  log "Working tree is dirty; issue triage will continue and treat local code as provisional."
fi

if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY_RUN=1; skipping git fetch/pull."
elif [[ "${TRIAGE_SKIP_GIT_SYNC:-0}" == "1" ]]; then
  log "TRIAGE_SKIP_GIT_SYNC=1; skipping git fetch/pull."
else
  git fetch "$REMOTE" "$BRANCH"
  remote_head="$(git rev-parse "$REMOTE/$BRANCH")"
  local_head="$(git rev-parse HEAD)"

  if [[ "$DIRTY_TREE" == "1" ]]; then
    if [[ "$local_head" != "$remote_head" ]]; then
      log "Working tree is dirty and local HEAD is not current with $REMOTE/$BRANCH; skipping triage to avoid stale issue creation."
      log "local_head=$local_head remote_head=$remote_head"
      exit 0
    fi
    log "Working tree is dirty but already current with $REMOTE/$BRANCH; continuing with provisional local observations."
  else
    git pull --ff-only "$REMOTE" "$BRANCH"
  fi
fi

if ! command -v gh >/dev/null 2>&1; then
  fail "gh command was not found."
fi

if ! gh auth status >/dev/null 2>&1; then
  fail "gh is not authenticated. Set GH_TOKEN or GITHUB_TOKEN and run gh auth login/setup."
fi

run_maturity_gate

PROMPT=$(cat <<PROMPT_EOF
You are running as a scheduled GitHub Issue triage automation for this repository.

Mode:
- $MODE
- $MODE_FOCUS

Strategic filter:
- Create an issue only when it clearly improves Flow Link's ability to win users from レバテック, Findy Freelance, or adjacent freelance/job marketplaces.
- Prefer concrete gains in freelancer/company acquisition, activation, trust, speed to useful match/application, fit clarity, conversion, or core marketplace reliability.
- Skip cosmetic, speculative, or internally interesting findings when competitive/user impact is weak.

Mode-specific checklist:
$MODE_POLICY

Operational rules:
- Do not edit files, commit, push, format, or generate tracked files.
- Create or update at most one GitHub issue; creating no issue is a valid successful outcome.
- The wrapper already skips runs when open ready backlog, same-mode ready backlog, or recent same-mode issue creation exceeds thresholds.
- Inspect recent .codex-automation/issue-triage-logs/ and .codex-automation/issue-worker-logs/ before filing.
- Search existing issues for duplicates by labels and fingerprint. If an open duplicate exists, comment instead of creating another issue.
- If a similar issue was closed or fixed, verify the current behavior still fails before reopening or filing a follow-up.
- If the working tree was dirty at start, treat local observations as provisional and say so in Evidence. Never base an issue only on uncommitted local changes.

Browser and environment:
- $BROWSER_POLICY
- Use Playwright Chromium headless with sandbox disabled when browser verification is needed.
- Prefer local checks on port $LOCAL_APP_PORT. If unavailable, use the next available port and record it.
- Do not stop another automation's dev server unless this run started it.
- Prefer read-only checks. Do not write to Preview unless the issue needs it; then add needs:preview-write and define cleanup.

Issue workflow:
- Use gh CLI.
- Required labels: codex, $AREA_LABEL, codex:ready, and exactly one of risk:low/risk:medium/risk:high.
- Add codex:approved only if a human has approved a high-risk issue later; do not add it during triage.
- Add fingerprint marker: <!-- codex:fingerprint=$MODE:<stable-kebab-case-summary> -->

Issue body:
## Summary
## Evidence
## Competitive relevance
## User impact
## Acceptance criteria
## Out of scope
## Risk
## Environment
## Preview write policy
## Verification plan

Quality bar:
- Write from the freelancer/company user's perspective.
- In Competitive relevance, state which competitor user behavior this affects, why Flow Link becomes more attractive, and why now.
- Acceptance criteria must be specific enough for the worker to verify item by item.
- End by saying whether you created an issue, updated an issue, reopened an issue, or skipped this run.
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

if [[ "$DIRTY_TREE" == "0" && -n "$(git status --porcelain)" ]]; then
  log "Codex issue triage left repository changes:"
  git status --short
  fail "Issue triage must not edit repository files."
elif [[ "$DIRTY_TREE" == "1" ]]; then
  log "Repository was dirty before triage; skipping final dirty-tree failure."
fi

log "Codex issue triage completed mode=$MODE"
