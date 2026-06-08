CREATE TABLE "saved_jobs" (
    "id" TEXT NOT NULL,
    "freelancer_profile_id" TEXT NOT NULL,
    "job_post_id" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_jobs_freelancer_profile_id_job_post_id_key" ON "saved_jobs"("freelancer_profile_id", "job_post_id");

ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_freelancer_profile_id_fkey" FOREIGN KEY ("freelancer_profile_id") REFERENCES "freelancer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
