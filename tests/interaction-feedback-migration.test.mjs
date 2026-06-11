import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile("prisma/migrations/20260609020000_add_interaction_feedback/migration.sql", "utf8");
const ratingRangeMigrationSql = await readFile(
  "prisma/migrations/20260611184500_bound_interaction_feedback_ratings/migration.sql",
  "utf8",
);
const schema = await readFile("prisma/schema.prisma", "utf8");

test("interaction feedback migration creates directional participant feedback", () => {
  assert.match(migrationSql, /CREATE TABLE "interaction_feedback"/);
  assert.match(migrationSql, /"direction" "InteractionFeedbackDirection" NOT NULL/);
  assert.match(migrationSql, /"private_note" TEXT/);
  assert.match(migrationSql, /"moderation_status" "InteractionFeedbackModerationStatus" NOT NULL DEFAULT 'visible'/);
  assert.match(migrationSql, /UNIQUE INDEX "interaction_feedback_job_application_id_direction_author_user_id_key"/);
});

test("interaction feedback schema keeps public targets separate from private notes", () => {
  assert.match(schema, /targetCompanyProfileId\s+String\?\s+@map\("target_company_profile_id"\)/);
  assert.match(schema, /targetFreelancerProfileId\s+String\?\s+@map\("target_freelancer_profile_id"\)/);
  assert.match(schema, /privateNote\s+String\?\s+@map\("private_note"\)/);
  assert.match(schema, /@@index\(\[targetCompanyProfileId, moderationStatus\]\)/);
  assert.match(schema, /@@index\(\[targetFreelancerProfileId, moderationStatus\]\)/);
});

test("interaction feedback migration guards rating ranges for future PostgreSQL writes", () => {
  assert.match(
    ratingRangeMigrationSql,
    /CONSTRAINT "interaction_feedback_follow_through_rating_range_check"\s+CHECK \("follow_through_rating" BETWEEN 1 AND 5\) NOT VALID/,
  );
  assert.match(
    ratingRangeMigrationSql,
    /CONSTRAINT "interaction_feedback_collaboration_rating_range_check"\s+CHECK \("collaboration_rating" BETWEEN 1 AND 5\) NOT VALID/,
  );
});
