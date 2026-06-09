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
npm run dev
```

`.env.local` に以下を設定してください。

```bash
DATABASE_URL="postgresql://flowlink:flowlink@db:5432/flow_link?schema=public"
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
- 本番起動前に `npm run db:migration-status` で pending migration がないことを確認してください。`npm start` は同じ確認を実行してから `next start` を起動します。企業プロフィール画面は `20260609000000_add_company_trust_fields`（`contact_team`, `operating_area`, `payment_policy`）が適用済みであることを前提にしています。
- Vercel のビルドでは `vercel-build` が `prisma migrate deploy` を実行してから `next build` します。
- PDFは Vercel Blob private に保存し、アプリ内の権限チェック済みAPI経由で表示します。
