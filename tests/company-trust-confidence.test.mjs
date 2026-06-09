import assert from "node:assert/strict";
import test from "node:test";

const {
  buildTrustConfidence,
  trustRecommendationAdjustment,
} = await import("../src/lib/utils.ts");

test("company trust confidence distinguishes submitted verification from self reported data", () => {
  const confidence = buildTrustConfidence({
    company: {
      description: "SaaS company",
      websiteUrl: "https://example.test",
      contactTeam: "Business team",
      paymentPolicy: "Month-end close, next-month payment",
      verificationRequests: [
        {
          kind: "payment_policy",
          status: "submitted",
          evidenceSummary: "Payment policy and contract template submitted",
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    },
    job: {
      contractTerms: "Month-end close",
      rate: "80万円",
      workload: "週3日",
      contractPeriod: "3ヶ月",
    },
  });

  assert.equal(confidence.paymentStatus, "pending");
  assert.equal(confidence.companyStatus, "selfReported");
  assert.equal(confidence.label, "確認リクエスト中");
  assert.equal(trustRecommendationAdjustment(confidence), 0);
});

test("company trust confidence marks old Flow Link reviews as stale", () => {
  const confidence = buildTrustConfidence({
    now: new Date("2026-06-09T00:00:00.000Z"),
    company: {
      flowLinkReviewedCompanyAt: "2025-01-01T00:00:00.000Z",
      flowLinkReviewedPaymentAt: "2025-01-01T00:00:00.000Z",
      flowLinkReviewedCompanyScope: "Public website checked",
      flowLinkReviewedPaymentScope: "Payment terms checked",
    },
    job: {
      rate: "80万円",
      workload: "週3日",
      contractPeriod: "3ヶ月",
      remotePolicy: "リモート",
    },
  });

  assert.equal(confidence.companyStatus, "stale");
  assert.equal(confidence.paymentStatus, "stale");
  assert.equal(confidence.tone, "warn");
  assert.equal(trustRecommendationAdjustment(confidence), -10);
});
