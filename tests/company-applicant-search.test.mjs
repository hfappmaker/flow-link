import assert from "node:assert/strict";
import test from "node:test";

const {
  applicantKeywordCandidateWhere,
  applicantKeywordCandidateTerms,
  applicantMatchesSearchQuery,
  filterApplicantsBySearchQuery,
} = await import("../src/lib/company-applicant-search.ts");
const {
  SEMANTIC_SEARCH_CANDIDATE_PAGE_SIZE,
  SEMANTIC_SEARCH_MAX_CANDIDATES,
  SEMANTIC_SEARCH_MATCH_LIMIT,
  collectSemanticCandidateMatches,
} = await import("../src/lib/semantic-candidate-search.ts");
const {
  applicationConditionFit,
  applicationConditionTerms,
  buildApplicationReview,
  skillMatchPercent,
} = await import("../src/lib/utils.ts");

test("company applicant search and review agree on canonical skill aliases", () => {
  const cases = [
    { query: "TS", requiredSkills: "TS", applicantSkills: "TypeScript, React" },
    { query: "Next JS", requiredSkills: "Next JS", applicantSkills: "Next.js, TypeScript" },
    { query: "NodeJS", requiredSkills: "NodeJS", applicantSkills: "Node.js, GraphQL" },
  ];

  for (const { query, requiredSkills, applicantSkills } of cases) {
    const matchingApplication = application({ id: `match-${query}`, skills: applicantSkills });
    const nonMatchingApplication = application({ id: `miss-${query}`, skills: "Go, GraphQL" });

    assert.equal(applicantMatchesSearchQuery(query, matchingApplication), true, `${query} should match applicant list search`);
    assert.equal(skillMatchPercent(requiredSkills, applicantSkills), 100, `${query} should match applicant review skills`);
    assert.deepEqual(
      filterApplicantsBySearchQuery([matchingApplication, nonMatchingApplication], query).map((item) => item.id),
      [matchingApplication.id],
      `${query} should keep only the canonical skill match`,
    );

    const review = buildApplicationReview({
      ...matchingApplication,
      jobPost: { requiredSkills },
    });
    assert.equal(review.matchPercent, 100, `${query} should preserve applicant detail/review matching`);
  }
});

test("company applicant search rejects short skill fragments", () => {
  const reactApplication = application({ skills: "React, TypeScript" });

  assert.equal(applicantMatchesSearchQuery("act", reactApplication), false);
  assert.deepEqual(filterApplicantsBySearchQuery([reactApplication], "act"), []);
});

test("company applicant search matches career-history-only evidence", () => {
  const cases = [
    {
      query: "GraphQL",
      careerHistory: { summary: "GraphQL API migration lead" },
    },
    {
      query: "SRE",
      careerHistory: { workExperiences: "SREとして可観測性と障害対応を担当" },
    },
    {
      query: "決済",
      careerHistory: { projects: "BtoB決済プラットフォームの0→1開発" },
    },
    {
      query: "AWS認定",
      careerHistory: { certifications: "AWS認定 Solutions Architect Professional" },
    },
    {
      query: "情報工学",
      careerHistory: { education: "情報工学専攻 修士課程修了" },
    },
  ];

  for (const { query, careerHistory } of cases) {
    const matchingApplication = application({
      id: `career-match-${query}`,
      proposalMessage: "Queue review text.",
      skills: "Product management",
      careerHistory,
    });
    const nonMatchingApplication = application({
      id: `career-miss-${query}`,
      proposalMessage: "Queue review text.",
      skills: "Product management",
      careerHistory: { summary: "Customer support operations" },
    });

    assert.equal(applicantMatchesSearchQuery(query, matchingApplication), true, `${query} should match career history`);
    assert.deepEqual(
      filterApplicantsBySearchQuery([matchingApplication, nonMatchingApplication], query).map((item) => item.id),
      [matchingApplication.id],
      `${query} should keep only the career-history match`,
    );
  }
});

test("company applicant search matches displayed profile fallback condition signals", () => {
  const cases = [
    { query: "2026-07-01", overrides: { availableFrom: "2026-07-01" } },
    { query: "週3日", overrides: { availability: "週3日" } },
    { query: "月90万円", overrides: { desiredRate: "月90万円" } },
    { query: "フルリモート", overrides: { remotePreference: "フルリモート" } },
  ];

  for (const { query, overrides } of cases) {
    const matchingApplication = application({
      id: `profile-condition-match-${query}`,
      proposedStart: "",
      rateExpectation: "",
      workloadExpectation: "",
      ...overrides,
    });
    const nonMatchingApplication = application({
      id: `profile-condition-miss-${query}`,
      proposedStart: "",
      rateExpectation: "",
      workloadExpectation: "",
      availableFrom: "2026-08-01",
      availability: "週5日",
      desiredRate: "月70万円",
      remotePreference: "一部出社可",
    });

    assert.equal(applicantMatchesSearchQuery(query, matchingApplication), true, `${query} should match profile fallback conditions`);
    assert.deepEqual(
      filterApplicantsBySearchQuery([matchingApplication, nonMatchingApplication], query).map((item) => item.id),
      [matchingApplication.id],
      `${query} should keep only the profile fallback condition match`,
    );
  }
});

test("company applicant search matches public work-preference condition labels", () => {
  const cases = [
    { query: "月110万円", workPreference: { targetRate: "月110万円以上" } },
    { query: "週2日", workPreference: { workload: "週2日から週3日" } },
    { query: "関西", workPreference: { preferredLocation: "関西または全国リモート" } },
    { query: "2026年8月", workPreference: { availableFrom: "2026年8月から" } },
    { query: "リモート中心", workPreference: { locationMode: "remote" } },
  ];

  for (const { query, workPreference } of cases) {
    const matchingApplication = application({
      id: `work-preference-match-${query}`,
      proposedStart: "",
      rateExpectation: "",
      workloadExpectation: "",
      desiredRate: "",
      availability: "",
      availableFrom: "",
      remotePreference: "",
      preferredLocation: "",
      workPreference,
    });
    const nonMatchingApplication = application({
      id: `work-preference-miss-${query}`,
      proposedStart: "",
      rateExpectation: "",
      workloadExpectation: "",
      desiredRate: "",
      availability: "",
      availableFrom: "",
      remotePreference: "",
      preferredLocation: "",
      workPreference: {
        targetRate: "月70万円",
        workload: "週5日",
        preferredLocation: "東京",
        availableFrom: "2026年10月",
        locationMode: "onsite",
      },
    });

    assert.equal(applicantMatchesSearchQuery(query, matchingApplication), true, `${query} should match public work preference`);
    assert.deepEqual(
      filterApplicantsBySearchQuery([matchingApplication, nonMatchingApplication], query).map((item) => item.id),
      [matchingApplication.id],
      `${query} should keep only the public work-preference match`,
    );
  }
});

test("company applicant search does not match avoided work-preference conditions", () => {
  const avoidedConditionOnlyApplication = application({
    proposalMessage: "Queue review text.",
    proposedStart: "",
    rateExpectation: "",
    workloadExpectation: "",
    contactPreference: "",
    fullName: "Aoi Tanaka",
    desiredOccupation: "Frontend engineer",
    skills: "React, TypeScript",
    desiredRate: "",
    availability: "",
    availableFrom: "",
    preferredLocation: "",
    remotePreference: "",
    careerHistory: { summary: "Frontend apps" },
    workPreference: {
      excludedConditions: "夜間中心, 短納期のみ, 常駐必須",
    },
  });
  const matchingApplication = application({
    id: "positive-night-work-match",
    proposalMessage: "夜間中心の保守運用も対応できます",
    workPreference: {
      excludedConditions: "短納期のみ",
    },
  });

  for (const query of ["夜間中心", "短納期", "常駐必須"]) {
    assert.equal(
      applicantMatchesSearchQuery(query, avoidedConditionOnlyApplication),
      false,
      `${query} should not match avoided conditions`,
    );
  }

  assert.deepEqual(filterApplicantsBySearchQuery([avoidedConditionOnlyApplication], "夜間中心"), []);
  assert.deepEqual(
    filterApplicantsBySearchQuery([avoidedConditionOnlyApplication, matchingApplication], "夜間中心").map((item) => item.id),
    [matchingApplication.id],
  );
});

test("company applicant keyword candidate where includes the same career-history fields", () => {
  const whereJson = JSON.stringify(applicantKeywordCandidateWhere("決済"));

  for (const field of ["summary", "workExperiences", "projects", "certifications", "education"]) {
    assert.match(whereJson, new RegExp(`"careerHistory".*"${field}"`));
  }
});

test("company applicant keyword candidate where includes safe profile and work-preference condition fields", () => {
  const whereJson = JSON.stringify(applicantKeywordCandidateWhere("月90万円"));

  for (const field of [
    "desiredRate",
    "availability",
    "availableFrom",
    "remotePreference",
    "targetRate",
    "workload",
    "preferredLocation",
  ]) {
    assert.match(whereJson, new RegExp(`"${field}"`));
  }

  assert.match(JSON.stringify(applicantKeywordCandidateWhere("リモート中心")), /"locationMode".*"remote"/);
});

test("company applicant search excludes private freelancer work-preference notes", () => {
  const privateNoteOnlyApplication = application({
    proposalMessage: "Queue review text.",
    skills: "Product management",
    careerHistory: { summary: "Customer support operations" },
    workPreference: {
      privateNotes: "GraphQL案件だけ検討したい",
      notificationCadence: "GraphQL通知",
    },
  });

  assert.equal(applicantMatchesSearchQuery("GraphQL", privateNoteOnlyApplication), false);
  assert.deepEqual(filterApplicantsBySearchQuery([privateNoteOnlyApplication], "GraphQL"), []);

  const whereJson = JSON.stringify(applicantKeywordCandidateWhere("GraphQL"));
  assert.doesNotMatch(
    whereJson,
    /excludedConditions|excluded_conditions|privateNotes|private_notes|notificationCadence|notification_cadence/,
  );
});

test("company applicant keyword candidates include aliases and broad text terms", () => {
  assert.deepEqual(applicantKeywordCandidateTerms("TS"), ["TS", "TypeScript"]);
  assert.deepEqual(applicantKeywordCandidateTerms("Next JS"), ["Next JS", "Next", "JS", "Next.js", "NextJS"]);
  assert.deepEqual(applicantKeywordCandidateTerms("NodeJS"), ["NodeJS", "Node.js"]);
  assert.deepEqual(applicantKeywordCandidateTerms("frontend Tokyo"), ["frontend Tokyo", "frontend", "Tokyo"]);
});

test("company applicant search pages beyond the first capped candidate batch", async () => {
  const nonMatches = Array.from({ length: SEMANTIC_SEARCH_CANDIDATE_PAGE_SIZE + 25 }, (_, index) =>
    application({
      id: `miss-${index}`,
      proposalMessage: "Product operations and tests.",
      skills: "Go, GraphQL",
    }),
  );
  const matchingApplication = application({ id: "match-beyond-first-page", skills: "TypeScript, React" });
  const candidates = [...nonMatches, matchingApplication];

  const result = await collectSemanticCandidateMatches({
    fetchCandidates: async ({ skip, take }) => candidates.slice(skip, skip + take),
    matchesCandidate: (candidate) => applicantMatchesSearchQuery("TS", candidate),
  });

  assert.equal(result.inspectedCandidateCount, candidates.length);
  assert.equal(result.maxCandidateCount, SEMANTIC_SEARCH_MAX_CANDIDATES);
  assert.equal(result.matchLimit, SEMANTIC_SEARCH_MATCH_LIMIT);
  assert.equal(result.hasMoreCandidateMatches, false);
  assert.deepEqual(result.matches.map((item) => item.id), [matchingApplication.id]);
});

test("company applicant search reports truncation at the bounded candidate ceiling", async () => {
  const candidates = Array.from({ length: SEMANTIC_SEARCH_MAX_CANDIDATES }, (_, index) =>
    application({
      id: `miss-${index}`,
      proposalMessage: "Product operations and tests.",
      skills: "Go, GraphQL",
    }),
  );

  const result = await collectSemanticCandidateMatches({
    fetchCandidates: async ({ skip, take }) => candidates.slice(skip, skip + take),
    matchesCandidate: (candidate) => applicantMatchesSearchQuery("TS", candidate),
  });

  assert.equal(result.inspectedCandidateCount, SEMANTIC_SEARCH_MAX_CANDIDATES);
  assert.equal(result.pagesFetched, SEMANTIC_SEARCH_MAX_CANDIDATES / SEMANTIC_SEARCH_CANDIDATE_PAGE_SIZE);
  assert.equal(result.hasMoreCandidateMatches, true);
  assert.deepEqual(result.matches, []);
});

test("company review uses application-specific condition expectations before profile fallback", () => {
  const applicationSpecific = application({
    rateExpectation: "月120万円以上",
    workloadExpectation: "週5日",
    desiredRate: "月90万円",
    availability: "週3日",
  });
  assert.deepEqual(applicationConditionTerms(applicationSpecific), {
    rate: { value: "月120万円以上", source: "application", display: "月120万円以上" },
    workload: { value: "週5日", source: "application", display: "週5日" },
  });

  const profileFallback = application({
    rateExpectation: "",
    workloadExpectation: null,
    desiredRate: "月90万円",
    availability: "週3日",
  });
  assert.deepEqual(applicationConditionTerms(profileFallback), {
    rate: { value: "月90万円", source: "profile", display: "月90万円（プロフィール）" },
    workload: { value: "週3日", source: "profile", display: "週3日（プロフィール）" },
  });

  const missingCandidateTerms = application({
    rateExpectation: "",
    workloadExpectation: "",
    desiredRate: "",
    availability: "",
  });
  assert.deepEqual(applicationConditionTerms(missingCandidateTerms), {
    rate: { value: "未設定", source: "missing", display: "未設定" },
    workload: { value: "未設定", source: "missing", display: "未設定" },
  });

  const review = buildApplicationReview({
    ...missingCandidateTerms,
    jobPost: { requiredSkills: "React, TypeScript", rate: "月100万円", workload: "週5日" },
  });
  assert.deepEqual(review.nextChecks, ["希望単価", "希望稼働量"]);
  assert.match(review.reviewQuestions.join("\n"), /応募者のこの案件での希望単価/);
});

test("company review marks compatible application rate and workload as interview-ready", () => {
  const review = buildApplicationReview({
    ...application({
      rateExpectation: "月80万円以上",
      workloadExpectation: "週5日",
    }),
    jobPost: { requiredSkills: "React, TypeScript", rate: "月80万円", workload: "週5日" },
  });
  const fit = applicationConditionFit({
    ...application({
      rateExpectation: "月80万円以上",
      workloadExpectation: "週5日",
    }),
    jobPost: { rate: "月80万円", workload: "週5日" },
  });

  assert.equal(fit.rate.readiness, "ready");
  assert.equal(fit.workload.readiness, "ready");
  assert.equal(review.interviewReadinessPercent, 100);
  assert.equal(review.isInterviewReady, true);
  assert.deepEqual(review.nextChecks, []);
});

test("company review flags applicant rate above the posted job rate before interview-ready", () => {
  const review = buildApplicationReview({
    ...application({
      rateExpectation: "月120万円以上",
      workloadExpectation: "週5日",
    }),
    jobPost: { requiredSkills: "React, TypeScript", rate: "月80万円", workload: "週5日" },
  });
  const fit = applicationConditionFit({
    ...application({
      rateExpectation: "月120万円以上",
      workloadExpectation: "週5日",
    }),
    jobPost: { rate: "月80万円", workload: "週5日" },
  });

  assert.equal(fit.rate.readiness, "mismatch");
  assert.equal(fit.rate.label, "要すり合わせ");
  assert.notEqual(review.interviewReadinessPercent, 100);
  assert.equal(review.isInterviewReady, false);
  assert.deepEqual(review.nextChecks, ["希望単価のすり合わせ"]);
  assert.match(review.reviewQuestions.join("\n"), /希望単価/);
});

test("company review flags light applicant workload against weekly-five jobs before interview-ready", () => {
  const review = buildApplicationReview({
    ...application({
      rateExpectation: "月80万円以上",
      workloadExpectation: "週2〜3日",
    }),
    jobPost: { requiredSkills: "React, TypeScript", rate: "月80万円", workload: "週5日" },
  });
  const fit = applicationConditionFit({
    ...application({
      rateExpectation: "月80万円以上",
      workloadExpectation: "週2〜3日",
    }),
    jobPost: { rate: "月80万円", workload: "週5日" },
  });

  assert.equal(fit.workload.readiness, "mismatch");
  assert.equal(fit.workload.label, "要すり合わせ");
  assert.notEqual(review.interviewReadinessPercent, 100);
  assert.equal(review.isInterviewReady, false);
  assert.deepEqual(review.nextChecks, ["希望稼働量のすり合わせ"]);
  assert.match(review.reviewQuestions.join("\n"), /希望稼働量/);
});

test("company review keeps unparseable condition text reviewable without hard-blocking", () => {
  const review = buildApplicationReview({
    ...application({
      rateExpectation: "応相談",
      workloadExpectation: "平日日中で調整",
    }),
    jobPost: { requiredSkills: "React, TypeScript", rate: "月80万円", workload: "週5日" },
  });
  const fit = applicationConditionFit({
    ...application({
      rateExpectation: "応相談",
      workloadExpectation: "平日日中で調整",
    }),
    jobPost: { rate: "月80万円", workload: "週5日" },
  });

  assert.equal(fit.rate.readiness, "review");
  assert.equal(fit.rate.label, "要確認");
  assert.equal(fit.workload.readiness, "review");
  assert.equal(fit.workload.label, "要確認");
  assert.equal(review.interviewReadinessPercent, 100);
  assert.equal(review.isInterviewReady, true);
  assert.deepEqual(review.nextChecks, []);
  assert.match(review.reviewQuestions.join("\n"), /希望単価と案件単価の前提/);
  assert.match(review.reviewQuestions.join("\n"), /希望稼働量と案件稼働量の前提/);
});

function application(overrides = {}) {
  return {
    id: overrides.id ?? "application-1",
    status: overrides.status ?? "applied",
    proposalMessage: overrides.proposalMessage ?? "Platform delivery experience.",
    proposedStart: overrides.proposedStart ?? "2026-07-01",
    rateExpectation: field(overrides, "rateExpectation", "月100万円以上"),
    workloadExpectation: field(overrides, "workloadExpectation", "週4日"),
    contactPreference: field(overrides, "contactPreference", "メール希望"),
    freelancerProfile: {
      fullName: overrides.fullName ?? "Aoi Tanaka",
      desiredOccupation: overrides.desiredOccupation ?? "Frontend engineer",
      skills: overrides.skills ?? "React, TypeScript",
      preferredLocation: overrides.preferredLocation ?? "Tokyo remote",
      desiredRate: field(overrides, "desiredRate", "月90万円"),
      availability: field(overrides, "availability", "週3日"),
      availableFrom: field(overrides, "availableFrom", "2026-07-01"),
      remotePreference: field(overrides, "remotePreference", "フルリモート"),
      documents: overrides.documents ?? [{ id: "doc-1" }, { id: "doc-2" }],
      careerHistory: overrides.careerHistory ?? { summary: "Frontend apps" },
      workPreference: overrides.workPreference,
    },
  };
}

function field(overrides, key, fallback) {
  return Object.hasOwn(overrides, key) ? overrides[key] : fallback;
}
