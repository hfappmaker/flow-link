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
const {
  buildApplicationReview,
  directContractChecklist,
  directContractReadyJobWhere,
  matchedSkills,
  skillMatchPercent,
  unmatchedSkills,
  visiblePreferenceReasons,
} = await import("../src/lib/utils.ts");

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

function matchesDirectContractReadyWhere(candidate) {
  const where = directContractReadyJobWhere();
  return matchesWhere(candidate, where);
}

function matchesWhere(candidate, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((condition) => matchesWhere(candidate, condition));
    if (key === "OR") return value.some((condition) => matchesWhere(candidate, condition));
    if (typeof value === "object" && value !== null && Object.hasOwn(value, "not")) {
      return candidate[key] !== value.not;
    }
    return candidate[key] === value;
  });
}

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

test("public direct-ready query boundary matches direct contract checklist", () => {
  const candidates = [
    job({ id: "ready" }),
    job({ id: "missing-description", description: null }),
    job({ id: "browse-only-draft", description: null, requiredSkills: null, rate: null }),
    job({ id: "empty-description", description: "" }),
  ];

  assert.deepEqual(
    candidates.filter(matchesDirectContractReadyWhere).map(({ id }) => id),
    candidates.filter((candidate) => directContractChecklist(candidate).percent === 100).map(({ id }) => id),
  );
  assert.deepEqual(candidates.filter(matchesDirectContractReadyWhere).map(({ id }) => id), ["ready"]);
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

test("skill matching canonicalizes common engineering aliases and punctuation variants", () => {
  const cases = [
    ["Next.js, TypeScript", "NextJS, TS", ["Next.js", "TypeScript"], 100],
    ["Node.js", "NodeJS", ["Node.js"], 100],
    ["Vue.js", "Vue", ["Vue.js"], 100],
    ["JavaScript", "JS", ["JavaScript"], 100],
  ];

  for (const [requiredSkills, freelancerSkills, expectedMatched, expectedPercent] of cases) {
    assert.deepEqual(matchedSkills(requiredSkills, freelancerSkills), expectedMatched);
    assert.equal(skillMatchPercent(requiredSkills, freelancerSkills), expectedPercent);
    assert.deepEqual(unmatchedSkills(requiredSkills, freelancerSkills), []);
  }
});

test("skill matching does not use substring or hierarchy as required-skill matches", () => {
  assert.deepEqual(matchedSkills("React Native", "React"), []);
  assert.deepEqual(unmatchedSkills("React Native", "React"), ["React Native"]);
  assert.equal(skillMatchPercent("React Native", "React"), 0);
  assert.deepEqual(matchedSkills("AWS Lambda", "AWS"), []);
  assert.deepEqual(matchedSkills("JavaScript", "Java"), []);
  assert.deepEqual(matchedSkills("React", "Interaction Design"), []);
});

test("recommendation, preference, and company review copy share canonical skill matching", () => {
  const recommendation = buildJobRecommendation(job({ requiredSkills: "Next.js, TypeScript", preferredSkills: "Vue.js" }), {
    freelancerReadinessPercent: 100,
    freelancerSkills: "NextJS, TS",
    workPreference: {
      status: "active",
      preferredSkills: "Vue",
      lastConfirmedAt: new Date(),
    },
  });
  assert.equal(recommendation.matchPercent, 100);
  assert.deepEqual(recommendation.matched, ["Next.js", "TypeScript"]);
  assert.deepEqual(recommendation.skillGaps, []);

  const reasons = visiblePreferenceReasons({
    requiredSkills: "Next.js",
    preferredSkills: "Vue.js",
    workPreference: {
      status: "active",
      preferredSkills: "Vue",
      lastConfirmedAt: new Date(),
    },
  });
  assert.equal(reasons.some((reason) => reason.label === "希望スキル一致" && reason.detail.includes("Vue.js")), true);

  const review = buildApplicationReview({
    status: "applied",
    freelancerProfile: {
      skills: "NextJS, TS",
      documents: [{ id: "doc-1" }, { id: "doc-2" }],
      careerHistory: { summary: "Frontend" },
    },
    jobPost: { requiredSkills: "Next.js, TypeScript" },
    proposalMessage: "I can help.",
    proposedStart: "2026-07-01",
  });
  assert.deepEqual(review.requiredSkillMatches, ["Next.js", "TypeScript"]);
  assert.equal(review.matchPercent, 100);
  assert.equal(review.nextChecks.includes("必須スキルの補足"), false);
});

test("work-location preference reasons use normalized remote semantics", () => {
  const remotePreference = {
    status: "active",
    locationMode: "remote",
    lastConfirmedAt: new Date(),
  };
  const hybridPreference = {
    status: "active",
    locationMode: "hybrid",
    lastConfirmedAt: new Date(),
  };

  const wfhReasons = visiblePreferenceReasons({
    ...job({ remotePolicy: "在宅可" }),
    workPreference: remotePreference,
  }, 6);
  assert.equal(wfhReasons.find((reason) => reason.label === "働き方に近い")?.tone, "good");

  const remoteNegativeReasons = visiblePreferenceReasons({
    ...job({ remotePolicy: "リモート不可" }),
    workPreference: remotePreference,
  }, 6);
  assert.equal(remoteNegativeReasons.find((reason) => reason.label === "働き方ミスマッチ")?.tone, "warn");

  const hybridReasons = visiblePreferenceReasons({
    ...job({ remotePolicy: "週1出社" }),
    workPreference: hybridPreference,
  }, 6);
  assert.equal(hybridReasons.find((reason) => reason.label === "働き方に近い")?.tone, "good");

  const onsiteReasons = visiblePreferenceReasons({
    ...job({ remotePolicy: "常駐必須" }),
    workPreference: hybridPreference,
  }, 6);
  assert.equal(onsiteReasons.find((reason) => reason.label === "働き方ミスマッチ")?.tone, "warn");
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

test("recommendation feedback adjusts ranking without removing manual search results", () => {
  const jobs = [
    job({ id: "positive", title: "TypeScript product engineer" }),
    job({ id: "negative", title: "TypeScript product engineer" }),
    job({ id: "similar", title: "TypeScript product engineer", createdAt: "2026-05-01T00:00:00.000Z" }),
  ];
  const ranked = rankJobRecommendations(jobs, {
    ...readyContext,
    recommendationFeedback: [
      {
        jobPostId: "positive",
        reason: "good_fit",
        sentiment: "positive",
        hideSimilar: false,
        visibleReasons: "希望スキル一致",
        jobPost: jobs[0],
      },
      {
        jobPostId: "negative",
        reason: "hide_similar",
        sentiment: "negative",
        hideSimilar: true,
        visibleReasons: "単価ミスマッチ",
        jobPost: jobs[1],
      },
    ],
  });

  assert.deepEqual(ranked.map((recommendation) => recommendation.job.id).sort(), ["negative", "positive", "similar"]);
  assert.equal(ranked[0].job.id, "positive");
  assert.equal(ranked.at(-1).job.id, "negative");
  assert.equal(ranked.find((recommendation) => recommendation.job.id === "similar").directScore < ranked[0].directScore, true);
  assert.match(ranked[0].preferenceReasons[0].detail, /フィードバック/);
});
