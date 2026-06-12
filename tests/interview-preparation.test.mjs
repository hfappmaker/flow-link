import assert from "node:assert/strict";
import test from "node:test";

const {
  getInterviewCareerHistoryTrustSignal,
  hasMeaningfulInterviewCareerHistoryEvidence,
  isInterviewApplicantInfoPrepared,
} = await import("../src/lib/interview-preparation.ts");

test("interview career-history trust signal requires meaningful text", () => {
  const cases = [
    ["no row", null, false],
    ["blank row", {}, false],
    ["whitespace-only summary", { summary: "   ", workExperiences: "" }, false],
    ["meaningful summary", { summary: "SaaS platform lead", workExperiences: "" }, true],
    ["meaningful work experiences", { summary: "", workExperiences: "Backend API migration" }, true],
  ];

  for (const [name, careerHistory, expected] of cases) {
    assert.equal(hasMeaningfulInterviewCareerHistoryEvidence(careerHistory), expected, name);

    const trustSignal = getInterviewCareerHistoryTrustSignal(careerHistory);
    assert.equal(trustSignal.done, expected, `${name} trust signal`);
    assert.equal(trustSignal.value, expected ? "登録済み" : "未登録", `${name} trust label`);
  }
});

test("interview applicant information task depends on meaningful career history evidence", () => {
  assert.equal(
    isInterviewApplicantInfoPrepared({
      readinessPercent: 100,
      documentCount: 2,
      hasMeaningfulCareerHistoryEvidence: false,
    }),
    false,
  );

  assert.equal(
    isInterviewApplicantInfoPrepared({
      readinessPercent: 100,
      documentCount: 2,
      hasMeaningfulCareerHistoryEvidence: true,
    }),
    true,
  );

  assert.equal(
    isInterviewApplicantInfoPrepared({
      readinessPercent: 86,
      documentCount: 2,
      hasMeaningfulCareerHistoryEvidence: true,
    }),
    false,
  );
});
