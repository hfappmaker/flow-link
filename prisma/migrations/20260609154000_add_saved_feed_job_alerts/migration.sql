CREATE TYPE "JobAlertCadence" AS ENUM ('immediate', 'daily', 'weekly', 'paused');

CREATE TYPE "JobAlertMatchStatus" AS ENUM ('pending_digest', 'notified', 'suppressed');

ALTER TYPE "NotificationType" ADD VALUE 'job_alert';
ALTER TYPE "NotificationType" ADD VALUE 'job_alert_digest';

ALTER TABLE "notifications" ADD COLUMN "action_url" TEXT;

ALTER TABLE "saved_job_searches"
  ALTER COLUMN "notification_cadence" DROP DEFAULT,
  ALTER COLUMN "notification_cadence" TYPE "JobAlertCadence"
  USING (
    CASE
      WHEN "notification_cadence" IS NULL OR btrim("notification_cadence") = '' THEN 'immediate'
      WHEN lower("notification_cadence") IN ('immediate', 'instant', '即時', 'すぐ') THEN 'immediate'
      WHEN lower("notification_cadence") IN ('daily', 'daily_digest', '毎日', '日次') THEN 'daily'
      WHEN lower("notification_cadence") IN ('weekly', 'weekly_digest', '週1回', '週次') THEN 'weekly'
      WHEN lower("notification_cadence") IN ('paused', 'none', 'off', '通知なし', '停止') THEN 'paused'
      ELSE 'immediate'
    END::"JobAlertCadence"
  ),
  ALTER COLUMN "notification_cadence" SET NOT NULL,
  ALTER COLUMN "notification_cadence" SET DEFAULT 'immediate';

CREATE TABLE "job_alert_matches" (
    "id" TEXT NOT NULL,
    "freelancer_profile_id" TEXT NOT NULL,
    "saved_job_search_id" TEXT NOT NULL,
    "job_post_id" TEXT NOT NULL,
    "notification_id" TEXT,
    "cadence" "JobAlertCadence" NOT NULL,
    "status" "JobAlertMatchStatus" NOT NULL DEFAULT 'pending_digest',
    "fit_reasons" TEXT NOT NULL,
    "trust_warning" TEXT,
    "suppression_reason" TEXT,
    "matched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_alert_matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_alert_matches_saved_job_search_id_job_post_id_key" ON "job_alert_matches"("saved_job_search_id", "job_post_id");
CREATE INDEX "job_alert_matches_freelancer_profile_id_status_cadence_idx" ON "job_alert_matches"("freelancer_profile_id", "status", "cadence");
CREATE INDEX "job_alert_matches_job_post_id_idx" ON "job_alert_matches"("job_post_id");

ALTER TABLE "job_alert_matches" ADD CONSTRAINT "job_alert_matches_freelancer_profile_id_fkey" FOREIGN KEY ("freelancer_profile_id") REFERENCES "freelancer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_alert_matches" ADD CONSTRAINT "job_alert_matches_saved_job_search_id_fkey" FOREIGN KEY ("saved_job_search_id") REFERENCES "saved_job_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_alert_matches" ADD CONSTRAINT "job_alert_matches_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_alert_matches" ADD CONSTRAINT "job_alert_matches_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
