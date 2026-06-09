CREATE TYPE "WorkPreferenceStatus" AS ENUM ('active', 'passive', 'inactive');

CREATE TYPE "WorkLocationMode" AS ENUM ('remote', 'hybrid', 'onsite', 'flexible');

CREATE TABLE "work_preferences" (
  "id" TEXT NOT NULL,
  "freelancer_profile_id" TEXT NOT NULL,
  "status" "WorkPreferenceStatus" NOT NULL DEFAULT 'active',
  "target_role" TEXT,
  "preferred_skills" TEXT,
  "target_rate" TEXT,
  "workload" TEXT,
  "location_mode" "WorkLocationMode" NOT NULL DEFAULT 'flexible',
  "preferred_location" TEXT,
  "available_from" TEXT,
  "excluded_conditions" TEXT,
  "notification_cadence" TEXT,
  "private_notes" TEXT,
  "last_confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "work_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "saved_job_searches" (
  "id" TEXT NOT NULL,
  "freelancer_profile_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "query" TEXT,
  "remote" BOOLEAN NOT NULL DEFAULT false,
  "accepting_only" BOOLEAN NOT NULL DEFAULT true,
  "direct_ready_only" BOOLEAN NOT NULL DEFAULT false,
  "fit" TEXT,
  "workload" TEXT,
  "rate" TEXT,
  "sort" TEXT NOT NULL DEFAULT 'direct',
  "notification_cadence" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "saved_job_searches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_preferences_freelancer_profile_id_key" ON "work_preferences"("freelancer_profile_id");

CREATE INDEX "saved_job_searches_freelancer_profile_id_idx" ON "saved_job_searches"("freelancer_profile_id");

ALTER TABLE "work_preferences"
  ADD CONSTRAINT "work_preferences_freelancer_profile_id_fkey"
  FOREIGN KEY ("freelancer_profile_id") REFERENCES "freelancer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saved_job_searches"
  ADD CONSTRAINT "saved_job_searches_freelancer_profile_id_fkey"
  FOREIGN KEY ("freelancer_profile_id") REFERENCES "freelancer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
