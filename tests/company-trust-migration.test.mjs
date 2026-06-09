import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile("prisma/migrations/20260609000000_add_company_trust_fields/migration.sql", "utf8");
const reviewMigrationSql = await readFile(
  "prisma/migrations/20260609010000_add_company_review_confidence_fields/migration.sql",
  "utf8",
);
const verificationMigrationSql = await readFile(
  "prisma/migrations/20260609040000_add_company_verification_requests/migration.sql",
  "utf8",
);
const schema = await readFile("prisma/schema.prisma", "utf8");

test("company trust fields migration is additive for existing company profiles", () => {
  assert.match(migrationSql, /ALTER TABLE "company_profiles"/);

  for (const column of ["contact_team", "operating_area", "payment_policy"]) {
    assert.match(migrationSql, new RegExp(`ADD COLUMN "${column}" TEXT`));
  }

  assert.doesNotMatch(migrationSql, /NOT NULL/);
});

test("company trust fields stay optional in the Prisma schema", () => {
  assert.match(schema, /contactTeam\s+String\?\s+@map\("contact_team"\)/);
  assert.match(schema, /operatingArea\s+String\?\s+@map\("operating_area"\)/);
  assert.match(schema, /paymentPolicy\s+String\?\s+@map\("payment_policy"\)/);
});

test("review confidence fields are additive and optional", () => {
  assert.match(reviewMigrationSql, /ALTER TABLE "company_profiles"/);
  for (const column of [
    "flow_link_reviewed_company_at",
    "flow_link_reviewed_company_scope",
    "flow_link_reviewed_payment_at",
    "flow_link_reviewed_payment_scope",
  ]) {
    assert.match(reviewMigrationSql, new RegExp(`ADD COLUMN "${column}"`));
  }
  assert.match(schema, /flowLinkReviewedCompanyAt\s+DateTime\?\s+@map\("flow_link_reviewed_company_at"\)/);
  assert.match(schema, /flowLinkReviewedPaymentAt\s+DateTime\?\s+@map\("flow_link_reviewed_payment_at"\)/);
});

test("company verification request migration records review outcomes and safety reports", () => {
  for (const enumName of [
    "CompanyVerificationKind",
    "CompanyVerificationStatus",
    "CompanySafetyReportType",
    "CompanySafetyReportStatus",
  ]) {
    assert.match(verificationMigrationSql, new RegExp(`CREATE TYPE "${enumName}"`));
    assert.match(schema, new RegExp(`enum ${enumName}`));
  }

  assert.match(verificationMigrationSql, /CREATE TABLE "company_verification_requests"/);
  for (const column of [
    "evidence_summary",
    "confirmed_scope",
    "reviewer_notes",
    "reason_code",
    "reviewed_at",
    "expires_at",
    "renewal_requested_at",
  ]) {
    assert.match(verificationMigrationSql, new RegExp(`"${column}"`));
  }

  assert.match(verificationMigrationSql, /CREATE TABLE "company_safety_reports"/);
  assert.match(schema, /model CompanyVerificationRequest/);
  assert.match(schema, /model CompanySafetyReport/);
});
