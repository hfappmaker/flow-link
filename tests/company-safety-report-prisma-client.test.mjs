import assert from "node:assert/strict";
import test from "node:test";
import { CompanySafetyReportType, Prisma } from "@prisma/client";

test("generated Prisma client can query safety reports by application and interview thread", () => {
  const reportModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "CompanySafetyReport");
  assert.ok(reportModel, "CompanySafetyReport model should exist in the generated Prisma client");

  const fieldNames = new Set(reportModel.fields.map((field) => field.name));
  assert.ok(fieldNames.has("jobApplicationId"));
  assert.ok(fieldNames.has("interviewThreadId"));

  assert.equal(
    CompanySafetyReportType.mismatched_job_company_details,
    "mismatched_job_company_details",
  );
  assert.equal(CompanySafetyReportType.other_trust_concern, "other_trust_concern");
});
