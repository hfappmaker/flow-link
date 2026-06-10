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
MAX_RECENT_MODE_ISSUES="${MAX_RECENT_MODE_ISSUES:-5}"
RECENT_ISSUE_DAYS="${RECENT_ISSUE_DAYS:-7}"

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
    ;;
  product)
    AREA_LABEL="area:product"
    MODE_TITLE="Product triage"
    LOCAL_APP_PORT="3012"
    MODE_FOCUS="Find product gaps from competitor comparison, user value, positioning, business workflow, trust, matching quality, conversion, and whether the service solves the right user problem."
    BROWSER_POLICY="Playwright is optional for product triage. Use it when evaluating an existing user flow; otherwise competitor research, static inspection, and product reasoning are sufficient."
    ;;
  ux)
    AREA_LABEL="area:ux"
    MODE_TITLE="UX triage"
    LOCAL_APP_PORT="3013"
    MODE_FOCUS="Find issues in navigation, screen transitions, user flow, missing pending/loading feedback, confusing copy, input burden, empty/loading/error states, and developer-facing terms that freelancers or companies should not need to understand."
    BROWSER_POLICY="Playwright browser verification is required by default for UX triage when the issue concerns navigation, screen transitions, missing route-transition or form-submit pending feedback, forms, login/register flows, empty/loading/error states, or task completion. Copy-only issues may use static inspection. If Playwright cannot run, state the exact blocker in the issue Evidence and Verification plan."
    ;;
  visual-design)
    AREA_LABEL="area:visual-design"
    MODE_TITLE="Visual design triage"
    LOCAL_APP_PORT="3014"
    MODE_FOCUS="Find visual design issues in layout, spacing, hierarchy, scanability, responsive behavior, current-location indicators, component consistency, and whether screens look professionally composed."
    BROWSER_POLICY="Playwright browser verification and screenshots are required for visual-design triage. Capture at least desktop and mobile screenshots before creating an issue, normally 1280x900 and 375x812. Save screenshots under .codex-automation/screenshots/ with stable names that include the mode, route, viewport, and timestamp. Include screenshot paths and visual observations in the issue Evidence section. If screenshots or browser launch fail, do not create a visual-design issue unless the issue is still critical; state the exact blocker in Evidence and Verification plan."
    ;;
  maintainability)
    AREA_LABEL="area:maintainability"
    MODE_TITLE="Maintainability triage"
    LOCAL_APP_PORT="3015"
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

Strategic goal:
- Flow Link's automation exists to help win users from competitor services such as レバテック, Findy Freelance, and adjacent freelance/job marketplace services.
- Do not create an issue unless it clearly improves at least one of: freelancer acquisition or activation, company acquisition or activation, trust and perceived reliability, speed from registration to useful match/application, clarity of job/company/freelancer fit, reduction of friction compared with competitor workflows, or reliability of the core marketplace flow.
- Prefer issues that create a concrete reason for a freelancer or company already using a competitor to try, trust, or switch to Flow Link.
- Skip cosmetic, speculative, or internally interesting issues when their competitive relevance is weak.

Maturity and stopping conditions:
- The wrapper skips this run before Codex starts when open codex:ready backlog, same-mode ready backlog, or recent same-mode issue creation exceeds configured thresholds.
- Even when the wrapper allows the run, do not create an issue if the main freelancer/company marketplace flows already appear competitively adequate for this mode and no high-leverage gap is found.
- Treat "no issue created" as a valid successful outcome when further changes would be low-impact iteration rather than a credible reason for competitor users to try or switch to Flow Link.

Hard rules:
- Do not edit repository files.
- Do not commit.
- Do not push.
- Do not run formatters or code generators that modify tracked files.
- You may read files, run read-only checks, inspect logs, use network access, and use the gh CLI to create or update GitHub issues.
- Create or update at most one GitHub issue in this run.
- If no worthwhile issue exists, create no issue and explain why.

Dirty working tree policy:
- This triage run may execute when the local working tree has uncommitted changes.
- If the working tree is dirty, treat local code and browser observations as provisional.
- If the working tree is dirty and local HEAD is behind or different from origin/develop, the wrapper skips the run before Codex starts so issues are not created from stale code.
- Do not create an issue based only on uncommitted local changes.
- Prefer evidence from Vercel logs, Preview, GitHub issues, committed code, or behavior that still applies to the intended develop branch.
- If dirty-tree observations are included, explicitly say so in the issue Evidence section.
- Never edit, format, revert, stage, commit, or push local changes from triage.

Browser verification policy:
- $BROWSER_POLICY
- Prefer Playwright with Chromium in headless mode and sandbox disabled when needed, for example: chromium.launch({ headless: true, chromiumSandbox: false, args: ["--no-sandbox", "--disable-setuid-sandbox"] }).
- Prefer read-only browser checks. Do not write to Preview unless the issue truly needs it; if Preview write-path verification is needed, label the issue needs:preview-write and define cleanup requirements.
- Include the browser target, viewport(s), observed result, and any fallback reason in the issue body.
- For visual-design mode, screenshots are mandatory evidence. Store them in .codex-automation/screenshots/ and mention the exact paths in the issue body.
- This automation runs in the local devcontainer using the locally authenticated Codex CLI session.
- Prefer local app checks when the issue can be reproduced with local data.
- Use localhost port $LOCAL_APP_PORT for this $MODE triage run when starting the app for browser checks, for example HOSTNAME=127.0.0.1 PORT=$LOCAL_APP_PORT npm run dev.
- If port $LOCAL_APP_PORT is already in use, choose the next available port in the same range and record the actual port in the issue Environment section.
- Do not stop another automation's dev server unless it was started by this same run and is no longer needed.
- For bug mode, Preview URL read-only checks are strongly preferred when a Preview URL is discoverable from Vercel or GitHub deployment metadata. If Vercel Protection is enabled and VERCEL_AUTOMATION_BYPASS_SECRET is available, use the x-vercel-protection-bypass header and x-vercel-set-bypass-cookie=true. If the secret is missing and Preview is protected, record that as Preview-protection evidence instead of failing the run.

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
- Missing feedback after clicking links, submitting forms, switching filters, or starting any user-visible navigation belongs to area:ux unless it causes a runtime error.
- Navigation that fails with 404/500, broken redirects, or runtime errors belongs to area:bug.
- Business workflow or service-positioning questions belong to area:product.
- Navigation visual treatment, current-location indicators, and layout consistency belong to area:visual-design.

Issue body format:
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
- Write issues from the freelancer/company user's perspective.
- In the Competitive relevance section, state which competitor user behavior this could affect, why this would make Flow Link more attractive, and why it is worth doing now.
- Treat clear pending feedback for route transitions and form submissions as a baseline marketplace UX requirement. If a user can click and wait without knowing whether anything is happening, create or update an area:ux issue unless an equivalent issue already exists.
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

if [[ "$DIRTY_TREE" == "0" && -n "$(git status --porcelain)" ]]; then
  log "Codex issue triage left repository changes:"
  git status --short
  fail "Issue triage must not edit repository files."
elif [[ "$DIRTY_TREE" == "1" ]]; then
  log "Repository was dirty before triage; skipping final dirty-tree failure."
fi

log "Codex issue triage completed mode=$MODE"
