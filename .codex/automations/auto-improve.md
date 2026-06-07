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
- Continuously improve this product so it can compete with freelance/job matching services such as Levatech and Findy.
- Prioritize the product's core differentiation: companies and freelancers can communicate and proceed directly without an agency or sales agent in the middle.
- Consider improvements to direct matching, job discovery, application flow, company/freelancer profiles, messaging/contact handoff, trust signals, onboarding, conversion, UI/UX quality, and maintainability.
- Before choosing the improvement, research current public competitor information when network access is available. Check official or high-quality sources for Levatech, Findy, and adjacent freelance/job matching services; use the findings to pick a concrete gap or advantage to address.
- In your final message, briefly name the competitor insight that motivated the change and include source URLs when you used web research.
- Pick exactly one safe, high-value improvement that fits the existing codebase. Medium-sized changes are allowed when they clearly strengthen the core direct-matching experience.
- Implement it completely.
- Keep the change coherently scoped. Avoid broad rewrites, speculative platform pivots, or partially finished multi-area changes.
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
