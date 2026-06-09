CREATE TYPE "CompanyVerificationKind" AS ENUM ('company_identity', 'payment_policy');

CREATE TYPE "CompanyVerificationStatus" AS ENUM ('submitted', 'confirmed', 'rejected', 'needs_renewal');

CREATE TYPE "CompanySafetyReportType" AS ENUM ('off_platform_payment_request', 'suspicious_evidence', 'unsafe_company');

CREATE TYPE "CompanySafetyReportStatus" AS ENUM ('submitted', 'reviewing', 'resolved');

CREATE TABLE "company_verification_requests" (
  "id" TEXT NOT NULL,
  "company_profile_id" TEXT NOT NULL,
  "requested_by_company_user_id" TEXT NOT NULL,
  "kind" "CompanyVerificationKind" NOT NULL,
  "status" "CompanyVerificationStatus" NOT NULL DEFAULT 'submitted',
  "public_evidence_url" TEXT,
  "contact_evidence" TEXT,
  "contract_evidence" TEXT,
  "payment_evidence" TEXT,
  "off_platform_policy" TEXT,
  "evidence_summary" TEXT NOT NULL,
  "confirmed_scope" TEXT,
  "reviewer_notes" TEXT,
  "reason_code" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "renewal_requested_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "company_verification_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_safety_reports" (
  "id" TEXT NOT NULL,
  "company_profile_id" TEXT NOT NULL,
  "reporter_user_id" TEXT,
  "job_post_id" TEXT,
  "report_type" "CompanySafetyReportType" NOT NULL,
  "status" "CompanySafetyReportStatus" NOT NULL DEFAULT 'submitted',
  "detail" TEXT NOT NULL,
  "internal_note" TEXT,
  "affected_user_note" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "company_safety_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "company_verification_requests_company_profile_id_kind_status_idx"
  ON "company_verification_requests"("company_profile_id", "kind", "status");

CREATE INDEX "company_safety_reports_company_profile_id_status_idx"
  ON "company_safety_reports"("company_profile_id", "status");

CREATE INDEX "company_safety_reports_report_type_status_idx"
  ON "company_safety_reports"("report_type", "status");

ALTER TABLE "company_verification_requests"
  ADD CONSTRAINT "company_verification_requests_company_profile_id_fkey"
  FOREIGN KEY ("company_profile_id") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_verification_requests"
  ADD CONSTRAINT "company_verification_requests_requested_by_company_user_id_fkey"
  FOREIGN KEY ("requested_by_company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_safety_reports"
  ADD CONSTRAINT "company_safety_reports_company_profile_id_fkey"
  FOREIGN KEY ("company_profile_id") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_safety_reports"
  ADD CONSTRAINT "company_safety_reports_reporter_user_id_fkey"
  FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "company_safety_reports"
  ADD CONSTRAINT "company_safety_reports_job_post_id_fkey"
  FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
