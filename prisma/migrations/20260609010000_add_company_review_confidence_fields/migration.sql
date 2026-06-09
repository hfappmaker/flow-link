ALTER TABLE "company_profiles"
  ADD COLUMN "flow_link_reviewed_company_at" TIMESTAMP(3),
  ADD COLUMN "flow_link_reviewed_company_scope" TEXT,
  ADD COLUMN "flow_link_reviewed_payment_at" TIMESTAMP(3),
  ADD COLUMN "flow_link_reviewed_payment_scope" TEXT;
