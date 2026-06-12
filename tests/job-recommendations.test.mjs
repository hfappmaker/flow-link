import assert from "node:assert/strict";
import test from "node:test";

const {
  READY_TO_APPLY_CONTRACT_THRESHOLD,
  READY_TO_APPLY_SCORE_THRESHOLD,
  buildDiscoveryIntentCounts,
  buildJobRecommendation,
  buildRecommendationInteractionState,
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
    companyProfile: value("companyProfile", { name: "Flow Link株式会社" }),
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
    if (key === "NOT") return value.every((condition) => !matchesWhere(candidate, condition));
    if (key === "companyProfile" && value?.is) return matchesWhere(candidate.companyProfile, value.is);
    if (typeof value === "object" && value !== null && Object.hasOwn(value, "not")) {
      if (value.not === "") return typeof candidate[key] === "string" && candidate[key] !== "";
      return candidate[key] !== value.not;
    }
    if (typeof value === "object" && value !== null && Object.hasOwn(value, "in")) {
      return value.in.includes(candidate[key]);
    }
    return candidate[key] === value;
  });
}

test("recommendation interaction state separates fresh, positive, saved, applied, dismissed, and handled jobs", () => {
  assert.equal(buildRecommendationInteractionState({}), "fresh");
  assert.equal(
    buildRecommendationInteractionState({
      exactFeedback: feedbackSignal({ jobPostId: "job-1", reason: "good_fit", sentiment: "positive" }),
    }),
    "positive_interest",
  );
  assert.equal(buildRecommendationInteractionState({ saved: true }), "saved");
  assert.equal(buildRecommendationInteractionState({ applied: true, saved: true }), "applied");
  assert.equal(
    buildRecommendationInteractionState({
      exactFeedback: feedbackSignal({ jobPostId: "job-1", reason: "rate_mismatch", sentiment: "negative" }),
    }),
    "negative_dismissed",
  );
  assert.equal(
    buildRecommendationInteractionState({
      exactFeedback: feedbackSignal({ jobPostId: "job-1", reason: "hide_similar", sentiment: "negative", hideSimilar: true }),
    }),
    "negative_dismissed",
  );
  assert.equal(
    buildRecommendationInteractionState({
      exactFeedback: feedbackSignal({ jobPostId: "job-1", reason: "already_handled", sentiment: "neutral" }),
    }),
    "already_handled",
  );
});

test("fresh candidate detection uses saved, applied, and exact feedback interaction state", () => {
  const cases = [
    { id: "fresh", expectedFresh: true, expectedState: "fresh" },
    { id: "applied", context: { appliedJobIds: ["applied"] }, expectedFresh: false, expectedState: "applied" },
    { id: "saved", context: { savedJobIds: ["saved"] }, expectedFresh: false, expectedState: "saved" },
    {
      id: "negative",
      context: { recommendationFeedback: [feedbackSignal({ jobPostId: "negative", reason: "not_relevant", sentiment: "negative" })] },
      expectedFresh: false,
      expectedState: "negative_dismissed",
    },
    {
      id: "handled",
      context: { recommendationFeedback: [feedbackSignal({ jobPostId: "handled", reason: "already_handled", sentiment: "neutral" })] },
      expectedFresh: false,
      expectedState: "already_handled",
    },
    {
      id: "hide-similar",
      context: { recommendationFeedback: [feedbackSignal({ jobPostId: "hide-similar", reason: "hide_similar", sentiment: "negative", hideSimilar: true })] },
      expectedFresh: false,
      expectedState: "negative_dismissed",
    },
    {
      id: "positive",
      context: { recommendationFeedback: [feedbackSignal({ jobPostId: "positive", reason: "good_fit", sentiment: "positive" })] },
      expectedFresh: true,
      expectedState: "positive_interest",
    },
    {
      id: "similar-not-exact",
      context: {
        recommendationFeedback: [
          feedbackSignal({
            jobPostId: "reference",
            reason: "hide_similar",
            sentiment: "negative",
            hideSimilar: true,
            jobPost: job({ id: "reference", requiredSkills: "TypeScript, React" }),
          }),
        ],
      },
      expectedFresh: true,
      expectedState: "fresh",
    },
  ];

  for (const { context, expectedFresh, expectedState, id } of cases) {
    const recommendation = buildJobRecommendation(job({ id }), { ...readyContext, ...context });
    assert.equal(recommendation.isFreshCandidate, expectedFresh, id);
    assert.equal(recommendation.interactionState, expectedState, id);
  }
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

test("avoided conditions take priority and prevent ready recommendations", () => {
  const avoidedCases = [
    { id: "onsite", excludedConditions: "常駐必須", remotePolicy: "常駐必須" },
    { id: "night", excludedConditions: "夜間中心", description: "夜間中心の運用改善を含みます。" },
    { id: "short", excludedConditions: "短納期のみ", workload: "短納期のみ・週3日" },
  ];

  for (const { excludedConditions, id, ...jobOverrides } of avoidedCases) {
    const recommendation = buildJobRecommendation(job({ id, ...jobOverrides }), {
      ...readyContext,
      workPreference: {
        status: "active",
        targetRole: "TypeScript",
        preferredSkills: "TypeScript, React",
        targetRate: "80万円",
        workload: "週3日",
        locationMode: "flexible",
        excludedConditions,
        lastConfirmedAt: new Date(),
      },
    });

    assert.equal(recommendation.preferenceReasons[0].label, "避けたい条件あり", id);
    assert.equal(recommendation.preferenceReasons[0].detail, excludedConditions, id);
    assert.equal(recommendation.wouldBeReadyToApplyWithoutAvoidance, true, id);
    assert.equal(recommendation.isReadyToApply, false, id);
  }
});

test("fit ready excludes avoided-condition jobs while broad search keeps them recoverable", () => {
  const avoidedJob = job({ id: "avoided", remotePolicy: "常駐必須" });
  const goodJob = job({ id: "good" });
  const context = {
    ...readyContext,
    workPreference: {
      status: "active",
      preferredSkills: "TypeScript, React",
      targetRate: "80万円",
      workload: "週3日",
      locationMode: "flexible",
      excludedConditions: "常駐必須",
      lastConfirmedAt: new Date(),
    },
  };

  const broadResults = rankJobRecommendations([avoidedJob, goodJob], context);
  const readyResults = rankJobRecommendations([avoidedJob, goodJob], context, { fit: "ready" });

  assert.deepEqual(new Set(broadResults.map((recommendation) => recommendation.job.id)), new Set(["avoided", "good"]));
  assert.deepEqual(readyResults.map((recommendation) => recommendation.job.id), ["good"]);
});

test("public direct-ready query boundary matches direct contract checklist", () => {
  const candidates = [
    job({ id: "ready" }),
    job({ id: "missing-company", companyProfile: { name: "未設定の企業" } }),
    job({ id: "missing-title", title: "" }),
    job({ id: "missing-description", description: null }),
    job({ id: "browse-only-draft", description: null, requiredSkills: null, rate: null }),
    job({ id: "empty-description", description: "" }),
    job({ id: "blank-description", description: "   " }),
  ];

  assert.deepEqual(
    candidates.filter(matchesDirectContractReadyWhere).map(({ id }) => id),
    candidates.filter((candidate) => directContractChecklist(candidate).percent === 100).map(({ id }) => id),
  );
  assert.deepEqual(candidates.filter(matchesDirectContractReadyWhere).map(({ id }) => id), ["ready"]);
  assert.deepEqual(candidates.map(({ id }) => id), [
    "ready",
    "missing-company",
    "missing-title",
    "missing-description",
    "browse-only-draft",
    "empty-description",
    "blank-description",
  ]);
});

test("public readiness uses publish readiness semantics for company, title, and trimmed fields", () => {
  const ready = directContractChecklist(job());
  assert.equal(ready.percent, 100);
  assert.equal(ready.isReady, true);

  const placeholderCompany = directContractChecklist(job({ companyProfile: { name: "未設定の企業" } }));
  assert.equal(placeholderCompany.isReady, false);
  assert.deepEqual(
    placeholderCompany.missingRequired.map((item) => item.label),
    ["企業名"],
  );

  const missingTitle = directContractChecklist(job({ title: "" }));
  assert.equal(missingTitle.isReady, false);
  assert.deepEqual(
    missingTitle.missingRequired.map((item) => item.label),
    ["案件名"],
  );

  const blankDescription = directContractChecklist(job({ description: "   " }));
  assert.equal(blankDescription.isReady, false);
  assert.deepEqual(
    blankDescription.missingRequired.map((item) => item.label),
    ["業務範囲"],
  );
});

test("public direct-ready query is accepted by the Prisma client", async (t) => {
  const { Prisma, PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    await prisma.jobPost.count({
      where: {
        status: "published",
        AND: [directContractReadyJobWhere()],
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      t.skip("database unavailable for Prisma query validation");
      return;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
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

test("recommendation preference reasons honor hourly rate fit without monthly conversion", () => {
  const matchingReasons = visiblePreferenceReasons({
    ...job({ rate: "時給8000円" }),
    workPreference: {
      status: "active",
      targetRate: "時給7000円から",
      lastConfirmedAt: new Date(),
    },
  }, 6);
  const matchingRate = matchingReasons.find((reason) => reason.label === "単価条件に近い");
  assert.equal(matchingRate?.tone, "good");
  assert.match(matchingRate?.detail ?? "", /希望: 時給7000円から \/ 案件: 時給8000円/);

  const mismatchReasons = visiblePreferenceReasons({
    ...job({ rate: "(5,000〜6,000 円/1h)" }),
    workPreference: {
      status: "active",
      targetRate: "時給7000円から",
      lastConfirmedAt: new Date(),
    },
  }, 6);
  assert.equal(mismatchReasons.find((reason) => reason.label === "単価ミスマッチ")?.tone, "warn");

  const mixedUnitReasons = visiblePreferenceReasons({
    ...job({ rate: "月額120万円" }),
    workPreference: {
      status: "active",
      targetRate: "時給7000円から",
      lastConfirmedAt: new Date(),
    },
  }, 6);
  assert.equal(mixedUnitReasons.find((reason) => reason.label === "単価要確認")?.tone, "neutral");
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

test("jobs fresh filter excludes exact dismissed jobs while all results keep them recoverable", () => {
  const jobs = [
    job({ id: "fresh", title: "TypeScript product engineer" }),
    job({ id: "positive", title: "TypeScript product engineer" }),
    job({ id: "negative", title: "TypeScript product engineer" }),
    job({ id: "handled", title: "TypeScript product engineer" }),
    job({ id: "similar", title: "TypeScript product engineer", createdAt: "2026-05-01T00:00:00.000Z" }),
  ];
  const context = {
    ...readyContext,
    recommendationFeedback: [
      feedbackSignal({ jobPostId: "positive", reason: "good_fit", sentiment: "positive", jobPost: jobs[1] }),
      feedbackSignal({ jobPostId: "negative", reason: "rate_mismatch", sentiment: "negative", jobPost: jobs[2] }),
      feedbackSignal({ jobPostId: "handled", reason: "already_handled", sentiment: "neutral", jobPost: jobs[3] }),
      feedbackSignal({ jobPostId: "reference", reason: "hide_similar", sentiment: "negative", hideSimilar: true, jobPost: job({ id: "reference" }) }),
    ],
  };

  const allResults = rankJobRecommendations(jobs, context);
  const freshResults = rankJobRecommendations(jobs, context, { candidate: "fresh" });
  const counts = buildDiscoveryIntentCounts({ jobs: allResults, readinessComplete: true });

  assert.deepEqual(new Set(allResults.map((recommendation) => recommendation.job.id)), new Set(["fresh", "positive", "negative", "handled", "similar"]));
  assert.deepEqual(
    freshResults.map((recommendation) => recommendation.job.id).sort(),
    ["fresh", "positive", "similar"],
  );
  assert.equal(counts.fresh, 3);
  assert.equal(
    allResults.findIndex((recommendation) => recommendation.job.id === "negative") >
      allResults.findIndex((recommendation) => recommendation.job.id === "fresh"),
    true,
  );
  assert.equal(allResults.find((recommendation) => recommendation.job.id === "negative").preferenceReasons[0].label, "単価が合わない");
  assert.equal(allResults.find((recommendation) => recommendation.job.id === "handled").preferenceReasons[0].label, "別で対応済み");
});

function feedbackSignal(overrides = {}) {
  const value = (key, fallback) => Object.hasOwn(overrides, key) ? overrides[key] : fallback;
  return {
    jobPostId: value("jobPostId", "job-1"),
    reason: value("reason", "not_relevant"),
    sentiment: value("sentiment", "negative"),
    hideSimilar: value("hideSimilar", false),
    visibleReasons: value("visibleReasons", null),
    jobPost: value("jobPost", null),
  };
}
