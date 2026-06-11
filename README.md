# Flow Link

フリーランス案件・書類選考プラットフォームのMVPです。

## Stack

- Next.js App Router
- TypeScript
- Auth.js Credentials
- Prisma + Postgres
- Vercel Blob private uploads
- Tailwind CSS

## Setup

```bash
npm install
cp .env.example .env.local
npm run prisma:generate
npm run prisma:migrate
npm run db:migration-status
npm run dev
```

`.env.local` に以下を設定してください。

```bash
DATABASE_URL="postgresql://flowlink:flowlink@db:5432/flow_link?schema=public"
PRISMA_RUNTIME_DATABASE_URL="" # optional pooled app-runtime URL for serverless reads
AUTH_SECRET="replace-with-a-long-random-secret"
AUTH_TRUST_HOST="true"
BLOB_READ_WRITE_TOKEN="vercel-blob-token"
```

## Scripts

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm run db:migration-status
npm run prisma:generate
npm run prisma:migrate
```

## Codex Issue Automation

Local Codex automation is organized around GitHub Issues instead of direct
unscoped edits.

- Issue triage scripts create or update at most one `codex` issue per run:
  `bug`, `product`, `ux`, `visual-design`, and `maintainability`.
- The worker script handles one `codex:ready` issue at a time in a dedicated git
  worktree, opens a PR, merges it, and removes the remote branch after merge.
- `bug`, `ux`, and `visual-design` issues require Playwright verification by
  default. Visual-design issues also require desktop and mobile screenshots.
- Product, UX, and visual-design triage must use the persona and competitor
  lens in `docs/automation/agent-loop-competitive-lens.md`.
- Product issues should include current competitor specification evidence and
  at least one user-voice source when network access is available. The loop
  should not rely only on search snippets, memory, or generic affiliate claims.
- New functionality must pass a simplicity check: adding controls or surfaced
  information is only valid when it reduces decision time, ambiguity, risk, or
  mismatched applications more than it increases user choice burden.

Useful local commands:

```bash
bash scripts/start-codex-issue-loops-cron.sh
bash scripts/stop-codex-issue-loops-cron.sh
DRY_RUN=1 MATURITY_GATE_ENABLED=0 bash scripts/codex-auto-issue-triage.sh --mode product --dry-run
DRY_RUN=1 bash scripts/codex-auto-issue-worker.sh --dry-run
```

## MVP Scope

- アカウント登録/ログイン
- フリーランスプロフィール、職務経歴、PDF書類登録
- 企業プロフィール、案件作成/編集、公開状態/応募受付管理
- 公開案件一覧/詳細
- 案件応募
- 応募者一覧/詳細
- 書類選考OK/NG
- プラットフォーム内通知
- 書類選考OK後の面談日程調整チャット

## Notes

- Prisma 7 は Node.js 20.19+ が必要なため、この環境では Prisma 6.19 に固定しています。
- 初期 migration SQL は `prisma/migrations/20260606000000_init/migration.sql` にあります。
- ローカル起動前に `npm run db:migration-status` で pending migration がないことを確認してください。`npm run dev` と `npm start` は同じ確認を実行してから Next.js を起動します。フリーランスのダッシュボード、希望条件、案件一覧は `work_preferences`、`saved_job_searches`、`recommendation_feedback` などの新しいテーブルが適用済みであることを前提にしています。
- Vercel のビルドでは `vercel-build` が `prisma migrate deploy` を実行してから `next build` します。
- Vercel などの serverless runtime では、`PRISMA_RUNTIME_DATABASE_URL` に pooled app-runtime 用の Postgres URL を設定してください。`DATABASE_URL` は migration/direct-role 用に残せます。`POSTGRES_PRISMA_URL` または `POSTGRES_URL` がある場合も runtime datasource として使われます。
- Preview smoke check after deployment: read-only browser or HTTP sweeps should repeatedly request `/` and `/jobs` across desktop and mobile user agents and confirm 200 responses. Then verify runtime logs do not contain `P2037`, `PrismaClientInitializationError`, or `too many connections` for those public reads.
- PDFは Vercel Blob private に保存し、アプリ内の権限チェック済みAPI経由で表示します。
