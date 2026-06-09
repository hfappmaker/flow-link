CREATE TYPE "RecommendationFeedbackReason" AS ENUM (
  'good_fit',
  'not_relevant',
  'wrong_role_skill',
  'rate_mismatch',
  'workload_mismatch',
  'location_mismatch',
  'company_trust_concern',
  'already_handled',
  'hide_similar'
);

CREATE TYPE "RecommendationFeedbackSentiment" AS ENUM (
  'positive',
  'negative',
  'neutral'
);

CREATE TABLE "recommendation_feedback" (
  "id" TEXT NOT NULL,
  "freelancer_profile_id" TEXT NOT NULL,
  "job_post_id" TEXT NOT NULL,
  "reason" "RecommendationFeedbackReason" NOT NULL,
  "sentiment" "RecommendationFeedbackSentiment" NOT NULL,
  "hide_similar" BOOLEAN NOT NULL DEFAULT false,
  "visible_reasons" TEXT,
  "source" TEXT NOT NULL,
  "source_context" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "recommendation_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recommendation_feedback_freelancer_profile_id_job_post_id_key"
  ON "recommendation_feedback"("freelancer_profile_id", "job_post_id");

CREATE INDEX "recommendation_feedback_job_post_id_reason_idx"
  ON "recommendation_feedback"("job_post_id", "reason");

CREATE INDEX "recommendation_feedback_freelancer_profile_id_reason_hide_similar_idx"
  ON "recommendation_feedback"("freelancer_profile_id", "reason", "hide_similar");

ALTER TABLE "recommendation_feedback"
  ADD CONSTRAINT "recommendation_feedback_freelancer_profile_id_fkey"
  FOREIGN KEY ("freelancer_profile_id") REFERENCES "freelancer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recommendation_feedback"
  ADD CONSTRAINT "recommendation_feedback_job_post_id_fkey"
  FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
