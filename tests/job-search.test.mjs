import assert from "node:assert/strict";
import test from "node:test";
import { JobAlertCadence } from "@prisma/client";

const {
  evaluateSavedFeedJobAlerts,
} = await import("../src/lib/job-alerts.ts");
const {
  filterJobsBySearchQuery,
  jobKeywordCandidateWhere,
  jobKeywordCandidateTerms,
  jobMatchesSearchQuery,
} = await import("../src/lib/job-search.ts");
const {
  SEMANTIC_SEARCH_CANDIDATE_PAGE_SIZE,
  SEMANTIC_SEARCH_MAX_CANDIDATES,
  SEMANTIC_SEARCH_MATCH_LIMIT,
  collectSemanticCandidateMatches,
} = await import("../src/lib/semantic-candidate-search.ts");

test("jobs keyword filtering and saved-feed alerts agree on canonical skill aliases", async () => {
  const cases = [
    { query: "TS", requiredSkills: "TypeScript", preferredSkills: "Next.js" },
    { query: "Next JS", requiredSkills: "Next.js", preferredSkills: "TypeScript" },
    { query: "NodeJS", requiredSkills: "Node.js", preferredSkills: "GraphQL" },
  ];

  for (const { query, requiredSkills, preferredSkills } of cases) {
    const matchingJob = job({ id: `match-${query}`, requiredSkills, preferredSkills });
    const nonMatchingJob = job({ id: `miss-${query}`, requiredSkills: "Go", preferredSkills: "GraphQL" });

    assert.deepEqual(
      filterJobsBySearchQuery([matchingJob, nonMatchingJob], query).map((item) => item.id),
      [matchingJob.id],
      `${query} should match the same canonical skill in /jobs filtering`,
    );

    const db = alertDb({ query, job: matchingJob });
    await evaluateSavedFeedJobAlerts(db, { job: matchingJob });
    assert.equal(db.notifications.length, 1, `${query} should match saved-feed alerts`);
  }
});

test("jobs keyword filtering and saved-feed alerts reject raw short skill fragments", async () => {
  const reactJob = job({ title: "React platform engineer", requiredSkills: "React", preferredSkills: "TypeScript" });

  assert.equal(jobMatchesSearchQuery("act", reactJob), false);
  assert.deepEqual(filterJobsBySearchQuery([reactJob], "act"), []);

  const db = alertDb({ query: "act", job: reactJob });
  await evaluateSavedFeedJobAlerts(db, { job: reactJob });
  assert.equal(db.notifications.length, 0);
});

test("jobs keyword filtering and saved-feed alerts match visible condition-only terms", async () => {
  const cases = [
    { field: "rate", query: "月80万円", value: "月80万円" },
    { field: "workload", query: "週3日", value: "週3日" },
    { field: "remotePolicy", query: "フルリモート", value: "フルリモート" },
    { field: "contractPeriod", query: "6ヶ月", value: "6ヶ月" },
    { field: "selectionFlow", query: "面談1回", value: "面談1回" },
    { field: "contractTerms", query: "翌月末払い", value: "翌月末払い" },
  ];

  for (const { field, query, value } of cases) {
    const matchingJob = conditionOnlyJob({ id: `match-${field}`, [field]: value });
    const nonMatchingJob = conditionOnlyJob({ id: `miss-${field}` });

    assert.deepEqual(
      filterJobsBySearchQuery([matchingJob, nonMatchingJob], query).map((item) => item.id),
      [matchingJob.id],
      `${query} should match /jobs filtering from ${field} only`,
    );

    const db = alertDb({ query, job: matchingJob });
    await evaluateSavedFeedJobAlerts(db, { job: matchingJob });
    assert.equal(db.notifications.length, 1, `${query} should match saved-feed alerts from ${field} only`);
  }
});

test("keyword candidate terms include canonical aliases without dropping broad text", () => {
  assert.deepEqual(jobKeywordCandidateTerms("TS"), ["TS", "TypeScript"]);
  assert.deepEqual(jobKeywordCandidateTerms("Next JS"), ["Next JS", "Next", "JS", "Next.js", "NextJS"]);
  assert.deepEqual(jobKeywordCandidateTerms("NodeJS"), ["NodeJS", "Node.js"]);
  assert.deepEqual(jobKeywordCandidateTerms("frontend engineer"), ["frontend engineer", "frontend", "engineer"]);
});

test("keyword candidate query covers visible public condition fields", () => {
  const fields = new Set(
    jobKeywordCandidateWhere("月80万円")?.OR?.flatMap((clause) => Object.keys(clause)) ?? [],
  );

  for (const field of [
    "title",
    "description",
    "requiredSkills",
    "preferredSkills",
    "rate",
    "workload",
    "contractPeriod",
    "selectionFlow",
    "contractTerms",
    "location",
    "remotePolicy",
    "companyProfile",
  ]) {
    assert.equal(fields.has(field), true, `${field} should be in the keyword candidate boundary`);
  }

  assert.deepEqual(
    jobKeywordCandidateWhere("2名")?.OR?.filter((clause) => "openings" in clause),
    [{ openings: 2 }],
  );
});

test("jobs semantic search pages beyond the first capped candidate batch", async () => {
  const nonMatches = Array.from({ length: SEMANTIC_SEARCH_CANDIDATE_PAGE_SIZE + 25 }, (_, index) =>
    job({
      id: `miss-${index}`,
      description: "Product operations and tests.",
      requiredSkills: "Go",
      preferredSkills: "GraphQL",
    }),
  );
  const matchingJob = job({ id: "match-beyond-first-page", requiredSkills: "TypeScript", preferredSkills: "Next.js" });
  const candidates = [...nonMatches, matchingJob];

  const result = await collectSemanticCandidateMatches({
    fetchCandidates: async ({ skip, take }) => candidates.slice(skip, skip + take),
    matchesCandidate: (candidate) => jobMatchesSearchQuery("TS", candidate),
  });

  assert.equal(result.inspectedCandidateCount, candidates.length);
  assert.equal(result.maxCandidateCount, SEMANTIC_SEARCH_MAX_CANDIDATES);
  assert.equal(result.matchLimit, SEMANTIC_SEARCH_MATCH_LIMIT);
  assert.equal(result.hasMoreCandidateMatches, false);
  assert.deepEqual(result.matches.map((item) => item.id), [matchingJob.id]);
});

test("jobs semantic search reports truncation at the bounded candidate ceiling", async () => {
  const candidates = Array.from({ length: SEMANTIC_SEARCH_MAX_CANDIDATES }, (_, index) =>
    job({
      id: `miss-${index}`,
      description: "Product operations and tests.",
      requiredSkills: "Go",
      preferredSkills: "GraphQL",
    }),
  );

  const result = await collectSemanticCandidateMatches({
    fetchCandidates: async ({ skip, take }) => candidates.slice(skip, skip + take),
    matchesCandidate: (candidate) => jobMatchesSearchQuery("TS", candidate),
  });

  assert.equal(result.inspectedCandidateCount, SEMANTIC_SEARCH_MAX_CANDIDATES);
  assert.equal(result.pagesFetched, SEMANTIC_SEARCH_MAX_CANDIDATES / SEMANTIC_SEARCH_CANDIDATE_PAGE_SIZE);
  assert.equal(result.hasMoreCandidateMatches, true);
  assert.deepEqual(result.matches, []);
});

function job(overrides = {}) {
  return {
    id: overrideValue(overrides, "id", "job-1"),
    title: overrideValue(overrides, "title", "Backend platform engineer"),
    description: overrideValue(overrides, "description", "Product platform work."),
    requiredSkills: overrideValue(overrides, "requiredSkills", "React, TypeScript"),
    preferredSkills: overrideValue(overrides, "preferredSkills", null),
    rate: overrideValue(overrides, "rate", "80万円"),
    workload: overrideValue(overrides, "workload", "週3日"),
    contractPeriod: overrideValue(overrides, "contractPeriod", "3ヶ月"),
    selectionFlow: overrideValue(overrides, "selectionFlow", "面談1回"),
    contractTerms: overrideValue(overrides, "contractTerms", "月末締め翌月末払い"),
    location: overrideValue(overrides, "location", null),
    remotePolicy: overrideValue(overrides, "remotePolicy", "リモート可"),
    openings: overrideValue(overrides, "openings", null),
    status: overrideValue(overrides, "status", "published"),
    applicationStatus: overrideValue(overrides, "applicationStatus", "open"),
    createdAt: overrideValue(overrides, "createdAt", new Date("2026-06-09T00:00:00Z")),
    updatedAt: overrideValue(overrides, "updatedAt", new Date("2026-06-09T00:00:00Z")),
    companyProfile: overrideValue(overrides, "companyProfile", {
      name: "Acme",
      verificationRequests: [],
    }),
  };
}

function overrideValue(overrides, key, defaultValue) {
  return Object.hasOwn(overrides, key) ? overrides[key] : defaultValue;
}

function conditionOnlyJob(overrides = {}) {
  return job({
    title: "Platform engineer",
    description: "Product platform work.",
    requiredSkills: "React, TypeScript",
    preferredSkills: null,
    rate: null,
    workload: null,
    contractPeriod: null,
    selectionFlow: null,
    contractTerms: null,
    location: null,
    remotePolicy: "リモート可",
    openings: null,
    companyProfile: {
      name: "Acme",
      verificationRequests: [],
    },
    ...overrides,
  });
}

function alertDb({ query = "React", job: matchingJob = job() } = {}) {
  const state = {
    matches: [],
    notifications: [],
  };
  const freelancer = {
    id: "freelancer-1",
    userId: "user-1",
    skills: "React, TypeScript, NextJS, NodeJS",
    workPreference: {
      status: "active",
      preferredSkills: "React, TypeScript, NextJS, NodeJS",
      targetRate: "80万円",
      workload: "週3日",
      locationMode: "remote",
      lastConfirmedAt: new Date("2026-06-01T00:00:00Z"),
    },
    savedJobSearches: [
      {
        id: "feed-1",
        name: "共有キーワード",
        query,
        remote: true,
        acceptingOnly: true,
        directReadyOnly: false,
        fit: "",
        workload: "",
        rate: "",
        sort: "direct",
        notificationCadence: JobAlertCadence.immediate,
      },
    ],
  };

  return {
    get matches() {
      return state.matches;
    },
    get notifications() {
      return state.notifications;
    },
    freelancerProfile: {
      findMany: async () => [freelancer],
    },
    jobPost: {
      findUnique: async () => matchingJob,
    },
    jobApplication: {
      findMany: async () => [],
    },
    savedJob: {
      findMany: async () => [],
    },
    recommendationFeedback: {
      findMany: async () => [],
    },
    notification: {
      create: async ({ data }) => {
        const notification = { id: `notification-${state.notifications.length + 1}`, createdAt: new Date(), ...data };
        state.notifications.push(notification);
        return notification;
      },
    },
    jobAlertMatch: {
      upsert: async ({ where, create, update }) => {
        const existing = state.matches.find(
          (match) =>
            match.savedJobSearchId === where.savedJobSearchId_jobPostId.savedJobSearchId &&
            match.jobPostId === where.savedJobSearchId_jobPostId.jobPostId,
        );
        if (existing) {
          Object.assign(existing, Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)), {
            updatedAt: new Date("2026-06-09T01:00:00Z"),
          });
          return existing;
        }
        const match = {
          id: `match-${state.matches.length + 1}`,
          createdAt: create.matchedAt,
          updatedAt: create.matchedAt,
          freelancerProfile: { userId: freelancer.userId },
          savedJobSearch: { id: freelancer.savedJobSearches[0].id, name: freelancer.savedJobSearches[0].name },
          jobPost: { id: create.jobPostId, title: matchingJob.title, companyProfile: { name: "Acme" } },
          notification: null,
          ...create,
        };
        state.matches.push(match);
        return match;
      },
      update: async ({ where, data }) => {
        const match = state.matches.find((item) => item.id === where.id);
        Object.assign(match, data, { updatedAt: new Date() });
        return match;
      },
      findMany: async () => [],
    },
  };
}
