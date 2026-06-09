import { spawnSync } from "node:child_process";

const status = spawnSync(
  "prisma",
  ["migrate", "status", "--schema=prisma/schema.prisma"],
  {
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

if (status.error) {
  console.error(`\nUnable to run Prisma migration status: ${status.error.message}`);
}

if (status.status !== 0) {
  console.error(`
Flow Link database schema is not ready.
Make sure \`DATABASE_URL\` is configured in \`.env.local\`.
If Prisma reports pending migrations, run \`npm run prisma:migrate\` for local development, then start the app again.
This check prevents authenticated freelancer pages from starting against a stale schema and returning 500s for missing tables such as work preferences, saved feeds, or recommendation feedback.
`);
  process.exit(status.status ?? 1);
}
