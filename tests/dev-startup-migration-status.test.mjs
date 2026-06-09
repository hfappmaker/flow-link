import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("local Next startup scripts check Prisma migration status before serving", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(pkg.scripts["db:migration-status"], /check-prisma-migration-status\.mjs/);
  assert.match(pkg.scripts.dev, /^npm run db:migration-status && next dev$/);
  assert.match(pkg.scripts.start, /^npm run db:migration-status && next start$/);
});
