CREATE TYPE "InteractionFeedbackDirection" AS ENUM ('company_to_freelancer', 'freelancer_to_company');

CREATE TYPE "InteractionFeedbackModerationStatus" AS ENUM ('visible', 'reported', 'hidden');

CREATE TABLE "interaction_feedback" (
    "id" TEXT NOT NULL,
    "job_application_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "direction" "InteractionFeedbackDirection" NOT NULL,
    "target_company_profile_id" TEXT,
    "target_freelancer_profile_id" TEXT,
    "follow_through_rating" INTEGER NOT NULL,
    "collaboration_rating" INTEGER NOT NULL,
    "interaction_completed" BOOLEAN NOT NULL DEFAULT false,
    "would_work_again" BOOLEAN,
    "private_note" TEXT,
    "moderation_status" "InteractionFeedbackModerationStatus" NOT NULL DEFAULT 'visible',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interaction_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "interaction_feedback_job_application_id_direction_author_user_id_key"
  ON "interaction_feedback"("job_application_id", "direction", "author_user_id");

CREATE INDEX "interaction_feedback_target_company_profile_id_moderation_status_idx"
  ON "interaction_feedback"("target_company_profile_id", "moderation_status");

CREATE INDEX "interaction_feedback_target_freelancer_profile_id_moderation_status_idx"
  ON "interaction_feedback"("target_freelancer_profile_id", "moderation_status");

ALTER TABLE "interaction_feedback"
  ADD CONSTRAINT "interaction_feedback_job_application_id_fkey"
  FOREIGN KEY ("job_application_id") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interaction_feedback"
  ADD CONSTRAINT "interaction_feedback_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interaction_feedback"
  ADD CONSTRAINT "interaction_feedback_target_company_profile_id_fkey"
  FOREIGN KEY ("target_company_profile_id") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interaction_feedback"
  ADD CONSTRAINT "interaction_feedback_target_freelancer_profile_id_fkey"
  FOREIGN KEY ("target_freelancer_profile_id") REFERENCES "freelancer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
