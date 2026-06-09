import assert from "node:assert/strict";
import test from "node:test";

const {
  READY_TO_APPLY_CONTRACT_THRESHOLD,
  READY_TO_APPLY_SCORE_THRESHOLD,
  buildDiscoveryIntentCounts,
  buildJobRecommendation,
  countReadySavedJobs,
  filterJobRecommendations,
  rankJobRecommendations,
} = await import("../src/lib/job-recommendations.ts");

function job(overrides = {}) {
  const value = (key, fallback) => Object.hasOwn(overrides, key) ? overrides[key] : fallback;
  return {
    id: value("id", "job-1"),
    title: value("title", "TypeScript platform engineer"),
    description: value("description", "Build product features with TypeScript and React."),
    requiredSkills: value("requiredSkills", "TypeScript, React"),
    preferredSkills: value("preferredSkills", null),
    rate: value("rate", "80万円"),
    workload: value("workload", "週3日"),
    contractPeriod: value("contractPeriod", "3ヶ月"),
    selectionFlow: value("selectionFlow", "面談1回"),
    contractTerms: value("contractTerms", "月末締め翌月末払い"),
    location: value("location", null),
    remotePolicy: value("remotePolicy", "リモート可"),
    applicationStatus: value("applicationStatus", "open"),
    createdAt: value("createdAt", "2026-06-01T00:00:00.000Z"),
    updatedAt: value("updatedAt", "2026-06-01T00:00:00.000Z"),
  };
}

const readyContext = {
  freelancerReadinessPercent: 100,
  freelancerSkills: "TypeScript, React",
};

test("fresh candidate detection uses both applied and saved job ids", () => {
  assert.equal(buildJobRecommendation(job({ id: "fresh" }), readyContext).isFreshCandidate, true);
  assert.equal(
    buildJobRecommendation(job({ id: "applied" }), { ...readyContext, appliedJobIds: ["applied"] }).isFreshCandidate,
    false,
  );
  assert.equal(
    buildJobRecommendation(job({ id: "saved" }), { ...readyContext, savedJobIds: ["saved"] }).isFreshCandidate,
    false,
  );
});

test("ready-to-apply requires score and contract readiness thresholds", () => {
  const ready = buildJobRecommendation(job(), readyContext);
  assert.equal(ready.directScore >= READY_TO_APPLY_SCORE_THRESHOLD, true);
  assert.equal(ready.contractReadinessPercent >= READY_TO_APPLY_CONTRACT_THRESHOLD, true);
  assert.equal(ready.isReadyToApply, true);

  const weakScore = buildJobRecommendation(job({ requiredSkills: "Go" }), {
    freelancerReadinessPercent: 100,
    freelancerSkills: "TypeScript",
  });
  assert.equal(weakScore.directScore < READY_TO_APPLY_SCORE_THRESHOLD, true);
  assert.equal(weakScore.isReadyToApply, false);

  const weakContract = buildJobRecommendation(job({ contractTerms: null, selectionFlow: null }), readyContext);
  assert.equal(weakContract.directScore >= READY_TO_APPLY_SCORE_THRESHOLD, true);
  assert.equal(weakContract.contractReadinessPercent < READY_TO_APPLY_CONTRACT_THRESHOLD, true);
  assert.equal(weakContract.isReadyToApply, false);
});

test("skill-match filtering keeps only open recommendations with matching required skills", () => {
  const recommendations = [
    buildJobRecommendation(job({ id: "match", requiredSkills: "TypeScript" }), readyContext),
    buildJobRecommendation(job({ id: "gap", requiredSkills: "Go" }), readyContext),
    buildJobRecommendation(job({ id: "paused", applicationStatus: "paused", requiredSkills: "TypeScript" }), readyContext),
  ];

  assert.deepEqual(
    filterJobRecommendations(recommendations, { fit: "skill" }).map((recommendation) => recommendation.job.id),
    ["match"],
  );
});

test("saved-job readiness counts use the shared open score and contract thresholds", () => {
  const savedRecommendations = [
    buildJobRecommendation(job({ id: "ready" }), readyContext),
    buildJobRecommendation(job({ id: "applied" }), readyContext),
    buildJobRecommendation(job({ id: "paused", applicationStatus: "paused" }), readyContext),
    buildJobRecommendation(job({ id: "missing-contract", contractTerms: null, selectionFlow: null }), readyContext),
  ];

  assert.equal(countReadySavedJobs(savedRecommendations, new Map([["applied", "applied"]])), 1);
});

test("dashboard recommendation ordering scores every candidate before limiting", () => {
  const newestWeakJobs = Array.from({ length: 24 }, (_, index) =>
    job({
      id: `new-weak-${index}`,
      requiredSkills: "Go",
      createdAt: `2026-06-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    }),
  );
  const olderStrongJob = job({
    id: "older-strong",
    createdAt: "2026-05-01T00:00:00.000Z",
  });

  const ranked = rankJobRecommendations([...newestWeakJobs, olderStrongJob], readyContext);

  assert.equal(ranked[0].job.id, "older-strong");
  assert.equal(buildDiscoveryIntentCounts({ jobs: ranked, readinessComplete: true }).readyToApply, 1);
});
