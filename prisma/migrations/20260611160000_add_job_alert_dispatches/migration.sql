CREATE TYPE "JobAlertDispatchStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE "job_alert_dispatches" (
    "id" TEXT NOT NULL,
    "job_post_id" TEXT NOT NULL,
    "status" "JobAlertDispatchStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "locked_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_alert_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_alert_dispatches_job_post_id_key" ON "job_alert_dispatches"("job_post_id");
CREATE INDEX "job_alert_dispatches_status_created_at_idx" ON "job_alert_dispatches"("status", "created_at");

ALTER TABLE "job_alert_dispatches" ADD CONSTRAINT "job_alert_dispatches_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
