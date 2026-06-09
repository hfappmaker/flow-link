import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile("prisma/migrations/20260609144000_add_post_interview_outcomes/migration.sql", "utf8");
const schema = await readFile("prisma/schema.prisma", "utf8");

test("post-interview outcome migration tracks handoff state separate from feedback", () => {
  assert.match(migrationSql, /CREATE TYPE "PostInterviewOutcomeStatus"/);
  assert.match(migrationSql, /'offer_sent'/);
  assert.match(migrationSql, /'contract_agreed'/);
  assert.match(migrationSql, /'work_started'/);
  assert.match(migrationSql, /CREATE TABLE "post_interview_outcomes"/);
  assert.match(migrationSql, /UNIQUE INDEX "post_interview_outcomes_job_application_id_key"/);
});

test("post-interview outcome schema preserves agreement snapshot fields", () => {
  assert.match(schema, /model PostInterviewOutcome/);
  assert.match(schema, /agreedRate\s+String\?/);
  assert.match(schema, /agreedWorkload\s+String\?/);
  assert.match(schema, /contractPaymentNotes\s+String\?/);
  assert.match(schema, /jobShouldStayOpen\s+Boolean\?/);
  assert.match(schema, /@@map\("post_interview_outcomes"\)/);
});
