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

test("company applicant search matches public work-preference status labels", () => {
  const cases = [
    { query: "募集中", status: "active" },
    { query: "積極的に探している", status: "active" },
    { query: "よい案件があれば", status: "passive" },
    { query: "情報収集", status: "passive" },
    { query: "停止中", status: "inactive" },
    { query: "積極募集外", status: "inactive" },
  ];

  for (const { query, status } of cases) {
    const matchingApplication = application({
      id: `work-preference-status-match-${status}-${query}`,
      proposedStart: "",
      rateExpectation: "",
      workloadExpectation: "",
      desiredRate: "",
      availability: "",
      availableFrom: "",
      remotePreference: "",
      preferredLocation: "",
      workPreference: { status },
    });
    const nonMatchingApplication = application({
      id: `work-preference-status-miss-${status}-${query}`,
      proposedStart: "",
      rateExpectation: "",
      workloadExpectation: "",
      desiredRate: "",
      availability: "",
      availableFrom: "",
      remotePreference: "",
      preferredLocation: "",
      workPreference: { status: status === "active" ? "inactive" : "active" },
    });

    assert.equal(applicantMatchesSearchQuery(query, matchingApplication), true, `${query} should match ${status} status`);
    assert.equal(applicantMatchesSearchQuery(query, nonMatchingApplication), false, `${query} should not match other statuses`);
    assert.deepEqual(
      filterApplicantsBySearchQuery([matchingApplication, nonMatchingApplication], query).map((item) => item.id),
      [matchingApplication.id],
      `${query} should keep only the matching work-preference status`,
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

test("company applicant keyword candidate where maps public work-preference status labels", () => {
  const cases = [
    { query: "募集中", status: "active", otherStatuses: ["passive", "inactive"] },
    { query: "積極的に探している", status: "active", otherStatuses: ["passive", "inactive"] },
    { query: "よい案件があれば", status: "passive", otherStatuses: ["active", "inactive"] },
    { query: "情報収集", status: "passive", otherStatuses: ["active", "inactive"] },
    { query: "停止中", status: "inactive", otherStatuses: ["active", "passive"] },
    { query: "積極募集外", status: "inactive", otherStatuses: ["active", "passive"] },
  ];

  for (const { query, status, otherStatuses } of cases) {
    const whereJson = JSON.stringify(applicantKeywordCandidateWhere(query));
    assert.match(whereJson, new RegExp(`"status"\\s*:\\s*\\{\\s*"equals"\\s*:\\s*"${status}"`), `${query} should map to ${status}`);

    for (const otherStatus of otherStatuses) {
      assert.doesNotMatch(
        whereJson,
        new RegExp(`"status"\\s*:\\s*\\{\\s*"equals"\\s*:\\s*"${otherStatus}"`),
        `${query} should not map to ${otherStatus}`,
      );
    }
  }
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
  assert.deepEqual(review.nextChecks, ["希望単価の確認", "希望稼働量の確認"]);
  assert.match(review.reviewQuestions.join("\n"), /応募者のこの案件での希望単価/);
});

test("company review keeps unconfirmed job defaults out of application expectations and interview candidates", () => {
  const jobDefault = application({
    rateExpectation: "月80万円",
    rateExpectationSource: "job_default",
    workloadExpectation: "週5日",
    workloadExpectationSource: "job_default",
    desiredRate: "",
    availability: "",
  });

  assert.deepEqual(applicationConditionTerms(jobDefault), {
    rate: { value: "月80万円", source: "job", display: "月80万円（案件条件・未確認）" },
    workload: { value: "週5日", source: "job", display: "週5日（案件条件・未確認）" },
  });

  const fit = applicationConditionFit({
    ...jobDefault,
    jobPost: { rate: "月80万円", workload: "週5日" },
  });
  assert.equal(fit.rate.readiness, "unconfirmed");
  assert.equal(fit.rate.label, "要確認");
  assert.equal(fit.workload.readiness, "unconfirmed");
  assert.equal(fit.workload.label, "要確認");

  const review = buildApplicationReview({
    ...jobDefault,
    jobPost: { requiredSkills: "React, TypeScript", rate: "月80万円", workload: "週5日" },
  });
  assert.equal(review.interviewReadinessPercent, 71);
  assert.equal(review.isInterviewReady, false);
  assert.deepEqual(review.nextChecks, ["希望単価の確認", "希望稼働量の確認"]);
  assert.match(review.reviewQuestions.join("\n"), /案件単価を応募者本人の希望単価/);
});

test("company review treats invalid application expectation sources as unconfirmed", () => {
  const invalidSource = application({
    rateExpectation: "月80万円",
    rateExpectationSource: "unexpected_value",
    workloadExpectation: "週5日",
    workloadExpectationSource: "unexpected_value",
    desiredRate: "",
    availability: "",
  });

  assert.deepEqual(applicationConditionTerms(invalidSource), {
    rate: { value: "月80万円", source: "job", display: "月80万円（要確認）" },
    workload: { value: "週5日", source: "job", display: "週5日（要確認）" },
  });

  const fit = applicationConditionFit({
    ...invalidSource,
    jobPost: { rate: "月80万円", workload: "週5日" },
  });
  assert.equal(fit.rate.readiness, "unconfirmed");
  assert.equal(fit.rate.label, "要確認");
  assert.equal(fit.workload.readiness, "unconfirmed");
  assert.equal(fit.workload.label, "要確認");

  const review = buildApplicationReview({
    ...invalidSource,
    jobPost: { requiredSkills: "React, TypeScript", rate: "月80万円", workload: "週5日" },
  });
  assert.equal(review.interviewReadinessPercent, 71);
  assert.equal(review.isInterviewReady, false);
  assert.deepEqual(review.nextChecks, ["希望単価の確認", "希望稼働量の確認"]);
});

test("company review counts explicitly confirmed job terms as application expectations", () => {
  const confirmedJobTerms = application({
    rateExpectation: "月80万円",
    rateExpectationSource: "confirmed_job",
    workloadExpectation: "週5日",
    workloadExpectationSource: "confirmed_job",
    desiredRate: "",
    availability: "",
  });
  const fit = applicationConditionFit({
    ...confirmedJobTerms,
    jobPost: { rate: "月80万円", workload: "週5日" },
  });
  const review = buildApplicationReview({
    ...confirmedJobTerms,
    jobPost: { requiredSkills: "React, TypeScript", rate: "月80万円", workload: "週5日" },
  });

  assert.deepEqual(applicationConditionTerms(confirmedJobTerms), {
    rate: { value: "月80万円", source: "application", display: "月80万円" },
    workload: { value: "週5日", source: "application", display: "週5日" },
  });
  assert.equal(fit.rate.readiness, "ready");
  assert.equal(fit.workload.readiness, "ready");
  assert.equal(review.isInterviewReady, true);
  assert.deepEqual(review.nextChecks, []);
});

test("company review requires meaningful career-history text for interview readiness", () => {
  const cases = [
    { name: "no career-history row", careerHistory: null },
    { name: "blank career-history row", careerHistory: {} },
    { name: "whitespace-only summary", careerHistory: { summary: "   ", workExperiences: "" } },
  ];

  for (const { name, careerHistory } of cases) {
    const review = buildApplicationReview({
      ...application({ careerHistory, rateExpectation: "月80万円以上", workloadExpectation: "週5日" }),
      jobPost: { requiredSkills: "React, TypeScript", rate: "月80万円", workload: "週5日" },
    });

    assert.equal(review.interviewReadinessPercent, 86, `${name} should keep the score below complete`);
    assert.equal(review.isInterviewReady, false, `${name} should not be interview-ready`);
    assert.deepEqual(review.nextChecks, ["職務経歴"], `${name} should keep the career-history next check`);
    assert.match(review.reviewQuestions.join("\n"), /直近プロジェクトの役割/);
  }
});

test("company review accepts meaningful career-history summary or work experiences", () => {
  const cases = [
    { name: "summary", careerHistory: { summary: "SaaS platform renewal lead", workExperiences: "" } },
    { name: "work experiences", careerHistory: { summary: "", workExperiences: "BtoB billing API migration" } },
  ];

  for (const { name, careerHistory } of cases) {
    const review = buildApplicationReview({
      ...application({ careerHistory, rateExpectation: "月80万円以上", workloadExpectation: "週5日" }),
      jobPost: { requiredSkills: "React, TypeScript", rate: "月80万円", workload: "週5日" },
    });

    assert.equal(review.interviewReadinessPercent, 100, `${name} should complete the career-history signal`);
    assert.equal(review.isInterviewReady, true, `${name} should be interview-ready`);
    assert.deepEqual(review.nextChecks, []);
  }
});

test("company review still requires career-history text when PDFs exist", () => {
  const review = buildApplicationReview({
    ...application({
      documents: [{ id: "resume-pdf" }, { id: "career-pdf" }],
      careerHistory: { summary: "  ", workExperiences: "\n\t" },
      rateExpectation: "月80万円以上",
      workloadExpectation: "週5日",
    }),
    jobPost: { requiredSkills: "React, TypeScript", rate: "月80万円", workload: "週5日" },
  });

  assert.equal(review.interviewReadinessPercent, 86);
  assert.equal(review.isInterviewReady, false);
  assert.deepEqual(review.nextChecks, ["職務経歴"]);
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

test("company review marks compatible hourly application rate as interview-ready", () => {
  const review = buildApplicationReview({
    ...application({
      rateExpectation: "時給7000円から",
      workloadExpectation: "週5日",
    }),
    jobPost: { requiredSkills: "React, TypeScript", rate: "時給8000円", workload: "週5日" },
  });
  const fit = applicationConditionFit({
    ...application({
      rateExpectation: "時給7000円から",
      workloadExpectation: "週5日",
    }),
    jobPost: { rate: "時給8000円", workload: "週5日" },
  });

  assert.equal(fit.rate.readiness, "ready");
  assert.equal(fit.rate.label, "適合");
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

test("company review flags applicant hourly rate above the posted hourly range", () => {
  const fit = applicationConditionFit({
    ...application({
      rateExpectation: "時給7000円から",
      workloadExpectation: "週5日",
    }),
    jobPost: { rate: "(5,000〜6,000 円/1h)", workload: "週5日" },
  });

  assert.equal(fit.rate.readiness, "mismatch");
  assert.equal(fit.rate.label, "要すり合わせ");
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
    rateExpectationSource: field(overrides, "rateExpectationSource", "candidate"),
    workloadExpectation: field(overrides, "workloadExpectation", "週4日"),
    workloadExpectationSource: field(overrides, "workloadExpectationSource", "candidate"),
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
      careerHistory: field(overrides, "careerHistory", { summary: "Frontend apps" }),
      workPreference: overrides.workPreference,
    },
  };
}

function field(overrides, key, fallback) {
  return Object.hasOwn(overrides, key) ? overrides[key] : fallback;
}
