# flow-link Auto Improve Automation

Use this prompt for a Codex App standalone/project automation targeting the
SSH-connected Dev Container project at `/workspaces/flow-link`.

Run cadence: every 20 minutes, or a less frequent schedule if the automation
creates too many review items.

Recommended execution mode: dedicated worktree for Git repositories.

Prompt:

```text
You are running as a scheduled automation for this repository.

Goal:
- Consider improvements from competitor comparison, UI/UX quality, and maintainability.
- Pick exactly one small, safe, high-value improvement that fits the existing codebase.
- Implement it completely.
- Keep the change narrowly scoped.
- If you touch Next.js code, first read the relevant guide in node_modules/next/dist/docs/ because this project uses a Next.js version with breaking changes.
- Run relevant verification commands such as npm run typecheck, npm run lint, and/or npm run build when appropriate.
- If you make changes, commit them yourself.
- Choose a concise, specific commit subject yourself after reviewing the final diff.
- Use Conventional Commit style when it fits, such as "fix:", "feat:", "refactor:", "docs:", "test:", or "chore:".
- Do not use a generic timestamp-only or "automated improvement" commit subject.
- Do not amend existing commits.

If there is no safe worthwhile change, leave the working tree unchanged and explain why.
```

After the first Codex App automation run succeeds, stop the in-container cron
to avoid duplicate automated changes:

```bash
/workspaces/flow-link/scripts/stop-codex-auto-improve-cron.sh
```
