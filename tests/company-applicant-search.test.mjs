import assert from "node:assert/strict";
import test from "node:test";

const {
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

function application(overrides = {}) {
  return {
    id: overrides.id ?? "application-1",
    status: overrides.status ?? "applied",
    proposalMessage: overrides.proposalMessage ?? "Platform delivery experience.",
    proposedStart: overrides.proposedStart ?? "2026-07-01",
    rateExpectation: field(overrides, "rateExpectation", "月100万円以上"),
    workloadExpectation: field(overrides, "workloadExpectation", "週4日"),
    freelancerProfile: {
      fullName: overrides.fullName ?? "Aoi Tanaka",
      desiredOccupation: overrides.desiredOccupation ?? "Frontend engineer",
      skills: overrides.skills ?? "React, TypeScript",
      preferredLocation: overrides.preferredLocation ?? "Tokyo remote",
      desiredRate: field(overrides, "desiredRate", "月90万円"),
      availability: field(overrides, "availability", "週3日"),
      documents: overrides.documents ?? [{ id: "doc-1" }, { id: "doc-2" }],
      careerHistory: overrides.careerHistory ?? { summary: "Frontend apps" },
    },
  };
}

function field(overrides, key, fallback) {
  return Object.hasOwn(overrides, key) ? overrides[key] : fallback;
}
