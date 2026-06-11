import assert from "node:assert/strict";
import test from "node:test";
import { JobAlertCadence } from "@prisma/client";

const {
  evaluateSavedFeedJobAlerts,
} = await import("../src/lib/job-alerts.ts");
const {
  filterJobsBySearchQuery,
  jobKeywordCandidateTerms,
  jobMatchesSearchQuery,
} = await import("../src/lib/job-search.ts");

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

test("keyword candidate terms include canonical aliases without dropping broad text", () => {
  assert.deepEqual(jobKeywordCandidateTerms("TS"), ["TS", "TypeScript"]);
  assert.deepEqual(jobKeywordCandidateTerms("Next JS"), ["Next JS", "Next", "JS", "Next.js", "NextJS"]);
  assert.deepEqual(jobKeywordCandidateTerms("NodeJS"), ["NodeJS", "Node.js"]);
  assert.deepEqual(jobKeywordCandidateTerms("frontend engineer"), ["frontend engineer", "frontend", "engineer"]);
});

function job(overrides = {}) {
  return {
    id: overrides.id ?? "job-1",
    title: overrides.title ?? "Backend platform engineer",
    description: overrides.description ?? "Product platform work.",
    requiredSkills: overrides.requiredSkills ?? "React, TypeScript",
    preferredSkills: overrides.preferredSkills ?? null,
    rate: overrides.rate ?? "80万円",
    workload: overrides.workload ?? "週3日",
    contractPeriod: overrides.contractPeriod ?? "3ヶ月",
    selectionFlow: overrides.selectionFlow ?? "面談1回",
    contractTerms: overrides.contractTerms ?? "月末締め翌月末払い",
    location: overrides.location ?? null,
    remotePolicy: overrides.remotePolicy ?? "リモート可",
    status: overrides.status ?? "published",
    applicationStatus: overrides.applicationStatus ?? "open",
    createdAt: overrides.createdAt ?? new Date("2026-06-09T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-06-09T00:00:00Z"),
    companyProfile: overrides.companyProfile ?? {
      name: "Acme",
      verificationRequests: [],
    },
  };
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
