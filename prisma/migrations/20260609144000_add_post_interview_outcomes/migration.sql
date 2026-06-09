CREATE TYPE "PostInterviewOutcomeStatus" AS ENUM (
  'waiting_company_decision',
  'offer_sent',
  'freelancer_considering',
  'clarification_requested',
  'accepted',
  'declined_by_company',
  'declined_by_freelancer',
  'contract_preparing',
  'contract_agreed',
  'work_started',
  'closed_no_hire'
);

CREATE TYPE "PostInterviewDeclineReason" AS ENUM (
  'rate_mismatch',
  'workload_mismatch',
  'timing',
  'company_trust_concern',
  'contract_payment_concern',
  'role_mismatch',
  'accepted_elsewhere',
  'other'
);

CREATE TABLE "post_interview_outcomes" (
  "id" TEXT NOT NULL,
  "job_application_id" TEXT NOT NULL,
  "status" "PostInterviewOutcomeStatus" NOT NULL DEFAULT 'waiting_company_decision',
  "proposed_start_date" TEXT,
  "agreed_start_date" TEXT,
  "agreed_rate" TEXT,
  "agreed_workload" TEXT,
  "contract_payment_notes" TEXT,
  "external_confirmation_needed" TEXT,
  "response_deadline" TEXT,
  "decline_reason" "PostInterviewDeclineReason",
  "private_outcome_note" TEXT,
  "job_should_stay_open" BOOLEAN,
  "company_updated_at" TIMESTAMP(3),
  "freelancer_updated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_interview_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_interview_outcomes_job_application_id_key"
  ON "post_interview_outcomes"("job_application_id");

CREATE INDEX "post_interview_outcomes_status_idx"
  ON "post_interview_outcomes"("status");

ALTER TABLE "post_interview_outcomes"
  ADD CONSTRAINT "post_interview_outcomes_job_application_id_fkey"
  FOREIGN KEY ("job_application_id")
  REFERENCES "job_applications"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
