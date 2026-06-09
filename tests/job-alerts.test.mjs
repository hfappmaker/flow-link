import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JobAlertCadence, JobAlertMatchStatus, RecommendationFeedbackSentiment } from "@prisma/client";

const {
  evaluateSavedFeedJobAlerts,
  normalizeAlertCadence,
  sendDueJobAlertDigests,
} = await import("../src/lib/job-alerts.ts");

const migrationSql = await readFile("prisma/migrations/20260609154000_add_saved_feed_job_alerts/migration.sql", "utf8");
const schema = await readFile("prisma/schema.prisma", "utf8");

test("saved feed alert migration adds delivery state and notification links", () => {
  assert.match(migrationSql, /CREATE TYPE "JobAlertCadence"/);
  assert.match(migrationSql, /CREATE TABLE "job_alert_matches"/);
  assert.match(migrationSql, /UNIQUE INDEX "job_alert_matches_saved_job_search_id_job_post_id_key"/);
  assert.match(migrationSql, /ADD COLUMN "action_url" TEXT/);
  assert.match(schema, /enum JobAlertCadence/);
  assert.match(schema, /model JobAlertMatch/);
  assert.match(schema, /actionUrl\s+String\?\s+@map\("action_url"\)/);
});

test("alert cadence parser maps explicit and legacy text values", () => {
  assert.equal(normalizeAlertCadence("daily"), JobAlertCadence.daily);
  assert.equal(normalizeAlertCadence("週1回"), JobAlertCadence.weekly);
  assert.equal(normalizeAlertCadence("通知なし"), JobAlertCadence.paused);
  assert.equal(normalizeAlertCadence("conditions only"), JobAlertCadence.immediate);
});

test("new published matching jobs create one immediate notification per feed", async () => {
  const db = alertDb();
  const result = await evaluateSavedFeedJobAlerts(db, { job: job(), now: new Date("2026-06-09T00:00:00Z") });

  assert.equal(result.notified, 1);
  assert.equal(db.notifications.length, 1);
  assert.equal(db.notifications[0].type, "job_alert");
  assert.equal(db.notifications[0].actionUrl, "/jobs/job-1");
  assert.match(db.notifications[0].body, /一致したフィード: React即時/);
  assert.equal(db.matches.length, 1);
  assert.equal(db.matches[0].status, JobAlertMatchStatus.notified);

  const duplicate = await evaluateSavedFeedJobAlerts(db, { job: job(), now: new Date("2026-06-09T01:00:00Z") });
  assert.equal(duplicate.notified, 0);
  assert.equal(db.notifications.length, 1);
});

test("alerts suppress jobs already saved, applied, or marked negative", async () => {
  const savedDb = alertDb({ savedJobIds: ["job-1"] });
  await evaluateSavedFeedJobAlerts(savedDb, { job: job() });
  assert.equal(savedDb.notifications.length, 0);
  assert.equal(savedDb.matches[0].status, JobAlertMatchStatus.suppressed);
  assert.match(savedDb.matches[0].suppressionReason, /保存済み/);

  const feedbackDb = alertDb({
    feedback: [{ jobPostId: "job-1", reason: "not_relevant", sentiment: RecommendationFeedbackSentiment.negative, hideSimilar: false, visibleReasons: null }],
  });
  await evaluateSavedFeedJobAlerts(feedbackDb, { job: job() });
  assert.equal(feedbackDb.notifications.length, 0);
  assert.equal(feedbackDb.matches[0].status, JobAlertMatchStatus.suppressed);
});

test("daily digest matches wait until the digest window is due", async () => {
  const db = alertDb({ cadence: JobAlertCadence.daily });
  await evaluateSavedFeedJobAlerts(db, { job: job(), now: new Date("2026-06-09T00:00:00Z") });
  assert.equal(db.notifications.length, 0);
  assert.equal(db.matches[0].status, JobAlertMatchStatus.pending_digest);

  const early = await sendDueJobAlertDigests(db, { cadence: JobAlertCadence.daily, now: new Date("2026-06-09T12:00:00Z") });
  assert.equal(early.notified, 0);

  const due = await sendDueJobAlertDigests(db, { cadence: JobAlertCadence.daily, now: new Date("2026-06-10T00:00:00Z") });
  assert.equal(due.notified, 1);
  assert.equal(db.notifications[0].type, "job_alert_digest");
  assert.equal(db.matches[0].status, JobAlertMatchStatus.notified);
});

function job(overrides = {}) {
  return {
    id: overrides.id ?? "job-1",
    title: overrides.title ?? "React platform engineer",
    description: overrides.description ?? "React and TypeScript product work.",
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

function alertDb({ cadence = JobAlertCadence.immediate, savedJobIds = [], appliedJobIds = [], feedback = [] } = {}) {
  const state = {
    matches: [],
    notifications: [],
  };
  const freelancer = {
    id: "freelancer-1",
    userId: "user-1",
    skills: "React, TypeScript",
    workPreference: {
      status: "active",
      targetRole: "React",
      preferredSkills: "React, TypeScript",
      targetRate: "80万円",
      workload: "週3日",
      locationMode: "remote",
      lastConfirmedAt: new Date("2026-06-01T00:00:00Z"),
    },
    savedJobSearches: [
      {
        id: "feed-1",
        name: cadence === JobAlertCadence.immediate ? "React即時" : "React日次",
        query: "React",
        remote: true,
        acceptingOnly: true,
        directReadyOnly: false,
        fit: "skill",
        workload: "",
        rate: "",
        sort: "direct",
        notificationCadence: cadence,
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
      findUnique: async () => job(),
    },
    jobApplication: {
      findMany: async () => appliedJobIds.map((jobPostId) => ({ jobPostId })),
    },
    savedJob: {
      findMany: async () => savedJobIds.map((jobPostId) => ({ jobPostId })),
    },
    recommendationFeedback: {
      findMany: async () => feedback,
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
          jobPost: { id: create.jobPostId, title: "React platform engineer", companyProfile: { name: "Acme" } },
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
      findMany: async ({ where }) =>
        state.matches
          .filter((match) => match.cadence === where.cadence && match.status === where.status)
          .map((match) => ({
            ...match,
            freelancerProfile: { userId: freelancer.userId },
            savedJobSearch: { id: freelancer.savedJobSearches[0].id, name: freelancer.savedJobSearches[0].name },
            jobPost: { id: match.jobPostId, title: "React platform engineer", companyProfile: { name: "Acme" } },
          })),
    },
  };
}
