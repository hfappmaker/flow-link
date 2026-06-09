ALTER TYPE "CompanySafetyReportType" ADD VALUE IF NOT EXISTS 'mismatched_job_company_details';
ALTER TYPE "CompanySafetyReportType" ADD VALUE IF NOT EXISTS 'other_trust_concern';

ALTER TABLE "company_safety_reports"
  ADD COLUMN "job_application_id" TEXT,
  ADD COLUMN "interview_thread_id" TEXT;

ALTER TABLE "company_safety_reports"
  ADD CONSTRAINT "company_safety_reports_job_application_id_fkey"
  FOREIGN KEY ("job_application_id") REFERENCES "job_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "company_safety_reports"
  ADD CONSTRAINT "company_safety_reports_interview_thread_id_fkey"
  FOREIGN KEY ("interview_thread_id") REFERENCES "interview_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "company_safety_reports_reporter_user_id_status_idx"
  ON "company_safety_reports"("reporter_user_id", "status");

CREATE INDEX "company_safety_reports_job_application_id_idx"
  ON "company_safety_reports"("job_application_id");

CREATE INDEX "company_safety_reports_interview_thread_id_idx"
  ON "company_safety_reports"("interview_thread_id");
