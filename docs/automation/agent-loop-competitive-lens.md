# Agent Loop Competitive Lens

This note gives Codex issue triage a stable product lens. Use it to create
better issues, not to copy competitor features wholesale.

## Primary personas

- Freelancer: wants to quickly decide whether a job is worth applying to by
  checking rate, workload, remote policy, company trust, required skills,
  application readiness, and selection status with as little manual entry as
  possible.
- Company operator: wants to quickly decide whether a candidate is worth moving
  to interview by checking skills, experience, documents, start timing, rate
  expectations, and response priority with as little manual entry as possible.
- Shared need: neither persona should need to understand implementation terms,
  internal product strategy, or a crowded control surface. The next action must
  be obvious, and repeated free-text entry should be avoided.

## Competitor reference points

### Levtech Freelance

- Reference behavior: large job inventory, high-rate positioning, full-remote
  and favorable-condition discovery, and agent-style support.
- User expectation: freelancers can quickly narrow many jobs to viable,
  high-quality options and trust that terms are concrete enough to compare.
- Flow Link opportunity: make rate, remote policy, workload, company trust, and
  application readiness easier to evaluate before applying.
- Do not blindly copy: avoid presenting many filters or metrics unless they
  materially speed up job comparison.

### Findy Freelance

- Reference behavior: high-skill freelance positioning, hourly rate ranges,
  tech/skill/job search, remote and weekly workload filters, startup and modern
  technology emphasis, and user-success support from matching through contract
  and operation.
- User expectation: engineers can evaluate fit by technology, rate, workload,
  and work style without opening every job.
- Flow Link opportunity: improve semantic search, practical rate bands, saved
  searches, alerts, recommendations, and fit explanations that help users choose
  fewer, better jobs.
- Do not blindly copy: avoid exposing every advanced condition on the first
  screen; progressively disclose advanced search or save it as a reusable
  condition.

### Midworks

- Reference behavior: freelance support and reassurance such as benefits,
  accounting support, learning/event cost support, and continuity-oriented
  positioning.
- User expectation: freelancers want reassurance that working independently will
  not leave operational or financial concerns ambiguous.
- Flow Link opportunity: make company trust, payment terms, contract conditions,
  and safety reporting visible and actionable.
- Do not blindly copy: do not imply Flow Link provides benefits, insurance, or
  guarantees that the product does not actually provide.

### IT Professionals Partners

- Reference behavior: weekly 2-3 day work, flexible/remote work, direct-client
  high-rate positioning, startup/trend technology jobs, and consultation.
- User expectation: freelancers can find flexible work that fits their schedule,
  and companies can attract talent by clearly presenting flexibility and value.
- Flow Link opportunity: make workload, remote policy, contract period,
  selection speed, and direct communication expectations clear before applying.
- Do not blindly copy: avoid using "direct" or contract-structure claims as
  user-facing copy unless the underlying product and legal model support them.

## Issue quality rules

- Create issues for persona pain, not for feature inventory parity.
- Prefer issues that reduce decision time, ambiguity, risk, or mismatched
  applications for one or both personas.
- Treat unnecessary manual entry as a first-class product and UX problem. Prefer
  reuse, defaults, inferred values, import/upload, saved conditions, structured
  choices, draft preservation, and progressive disclosure over repeated free
  text fields.
- Do not treat this document as sufficient research. Before filing product, UX,
  or visual-design issues, inspect current competitor pages or credible recent
  writeups and include the relevant source URLs.
- For product issues, include at least one user-voice source when network access
  is available. Useful sources include recent comparison articles, reviews,
  blog posts, note/Zenn/Qiita posts, social posts, or support/community
  discussions. Prefer concrete user praise, complaints, anxieties, or switching
  reasons over generic affiliate summaries.
- Separate competitor specification from user voice:
  - Competitor specification: what the service actually exposes or promises,
    such as search fields, rate display, application steps, support flow,
    trust/payment information, saved searches, alerts, or mobile layout.
  - User voice: what users say helped, confused, reassured, annoyed, delayed,
    or made them switch services.
- Translate research into a Flow Link issue only after identifying a concrete
  target persona pain and a smaller or clearer product move Flow Link can make.
- For input-heavy flows, ask whether users could complete the same job with
  fewer required fields, fewer repeated answers, clearer structured choices, or
  better reuse of existing profile/company/job data.
- For new functionality, prove that the value outweighs the added choice burden.
  Consider removing, combining, staging, or moving details to a secondary view
  before adding controls to the main flow.
- If the finding is only polish, preference, or speculative optimization, skip
  it unless it has clear trust, conversion, repeated-use, or reliability impact.
- Acceptance criteria should state how the target persona can complete or judge
  the relevant task with less confusion.

## Research checklist

- Open at least one current competitor page, not just search result snippets.
- Capture specific observed behavior: labels, filters, card fields, ordering,
  onboarding steps, support promises, or mobile/desktop layout.
- Capture how much manual input competitors require or avoid: selectable
  options, profile reuse, document import, saved searches, suggested text,
  defaults, or progressive onboarding.
- Capture at least one user voice for product issues when available, including
  the source URL and whether it is praise, complaint, anxiety, or switching
  reason.
- Compare Flow Link against the observed behavior and voice. Ask whether the
  answer is to add, remove, combine, stage, rename, or verify behavior.
- Skip the issue when research only shows that a competitor has more features,
  but does not show a clear persona pain Flow Link can address.
