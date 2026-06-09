import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile(
  "prisma/migrations/20260609050000_add_recommendation_feedback_loop/migration.sql",
  "utf8",
);
const schema = await readFile("prisma/schema.prisma", "utf8");

test("recommendation feedback migration creates discovery feedback separate from interaction feedback", () => {
  assert.match(migrationSql, /CREATE TABLE "recommendation_feedback"/);
  assert.match(migrationSql, /"visible_reasons" TEXT/);
  assert.match(migrationSql, /"source_context" TEXT/);
  assert.match(migrationSql, /"hide_similar" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(migrationSql, /UNIQUE INDEX "recommendation_feedback_freelancer_profile_id_job_post_id_key"/);
  assert.match(schema, /model RecommendationFeedback/);
  assert.match(schema, /@@map\("recommendation_feedback"\)/);
  assert.match(schema, /interactionFeedback\s+InteractionFeedback\[\]/);
});
