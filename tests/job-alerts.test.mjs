import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JobAlertCadence, JobAlertDispatchStatus, JobAlertMatchStatus, RecommendationFeedbackSentiment } from "@prisma/client";

const {
  dispatchPendingSavedFeedJobAlerts,
  enqueueSavedFeedJobAlertDispatch,
  evaluateSavedFeedJobAlerts,
  normalizeAlertCadence,
  sendDueJobAlertDigests,
} = await import("../src/lib/job-alerts.ts");

const migrationSql = await readFile("prisma/migrations/20260609154000_add_saved_feed_job_alerts/migration.sql", "utf8");
const dispatchMigrationSql = await readFile("prisma/migrations/20260611160000_add_job_alert_dispatches/migration.sql", "utf8");
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

test("saved feed alert dispatch migration adds a per-job outbox", () => {
  assert.match(dispatchMigrationSql, /CREATE TYPE "JobAlertDispatchStatus"/);
  assert.match(dispatchMigrationSql, /CREATE TABLE "job_alert_dispatches"/);
  assert.match(dispatchMigrationSql, /UNIQUE INDEX "job_alert_dispatches_job_post_id_key"/);
  assert.match(schema, /model JobAlertDispatch/);
  assert.match(schema, /jobPostId\s+String\s+@unique @map\("job_post_id"\)/);
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

test("alerts suppress jobs already saved, applied, dismissed, or handled", async () => {
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
  assert.match(feedbackDb.matches[0].suppressionReason, /フィードバック済み/);

  const handledDb = alertDb({
    feedback: [{ jobPostId: "job-1", reason: "already_handled", sentiment: RecommendationFeedbackSentiment.neutral, hideSimilar: false, visibleReasons: null }],
  });
  await evaluateSavedFeedJobAlerts(handledDb, { job: job() });
  assert.equal(handledDb.notifications.length, 0);
  assert.equal(handledDb.matches[0].status, JobAlertMatchStatus.suppressed);
  assert.match(handledDb.matches[0].suppressionReason, /対応済み/);
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

test("dispatch boundary evaluates one queued job without sending unrelated digests", async () => {
  const db = alertDb({ cadence: JobAlertCadence.daily });
  await enqueueSavedFeedJobAlertDispatch(db, { jobPostId: "job-1" });

  const result = await dispatchPendingSavedFeedJobAlerts(db, { now: new Date("2026-06-10T00:00:00Z") });

  assert.deepEqual(result, { processed: 1, completed: 1, failed: 0 });
  assert.equal(db.dispatches[0].status, JobAlertDispatchStatus.completed);
  assert.equal(db.notifications.length, 0);
  assert.equal(db.matches[0].status, JobAlertMatchStatus.pending_digest);
});

test("dispatch boundary records failures and retries idempotently", async () => {
  const db = alertDb({ failNotifications: true });
  await enqueueSavedFeedJobAlertDispatch(db, { jobPostId: "job-1" });

  const failed = await dispatchPendingSavedFeedJobAlerts(db, { now: new Date("2026-06-09T00:00:00Z") });
  assert.deepEqual(failed, { processed: 1, completed: 0, failed: 1 });
  assert.equal(db.dispatches[0].status, JobAlertDispatchStatus.failed);
  assert.equal(db.dispatches[0].attempts, 1);
  assert.match(db.dispatches[0].lastError, /notification outage/);
  assert.equal(db.notifications.length, 0);

  db.failNotifications = false;
  const retried = await dispatchPendingSavedFeedJobAlerts(db, { now: new Date("2026-06-09T01:00:00Z") });
  assert.deepEqual(retried, { processed: 1, completed: 1, failed: 0 });
  assert.equal(db.dispatches[0].status, JobAlertDispatchStatus.completed);
  assert.equal(db.dispatches[0].attempts, 2);
  assert.equal(db.notifications.length, 1);

  await enqueueSavedFeedJobAlertDispatch(db, { jobPostId: "job-1" });
  assert.equal(db.dispatches.length, 1);
  assert.equal(db.dispatches[0].status, JobAlertDispatchStatus.pending);

  await dispatchPendingSavedFeedJobAlerts(db, { now: new Date("2026-06-09T02:00:00Z") });
  assert.equal(db.notifications.length, 1);
});

test("saved feed alerts use selected monthly rate bands with normalized lower bounds", async () => {
  const cases = [
    { rate: "60", included: "月60万円", excluded: "55〜75万円" },
    { rate: "80", included: "月額120万円", excluded: "75〜95万円" },
    { rate: "100", included: "100〜130万円", excluded: "90〜120万円" },
    { rate: "120", included: "月120万円", excluded: "100〜130万円" },
  ];

  for (const { rate, included, excluded } of cases) {
    const includedDb = alertDb({ rate });
    await evaluateSavedFeedJobAlerts(includedDb, { job: job({ rate: included }) });
    assert.equal(includedDb.notifications.length, 1, `${included} should match saved feed rate ${rate}`);

    const excludedDb = alertDb({ rate });
    await evaluateSavedFeedJobAlerts(excludedDb, { job: job({ rate: excluded }) });
    assert.equal(excludedDb.notifications.length, 0, `${excluded} should not match saved feed rate ${rate}`);
  }

  const hourlyDb = alertDb({ rate: "60" });
  await evaluateSavedFeedJobAlerts(hourlyDb, { job: job({ rate: "時給8,000円" }) });
  assert.equal(hourlyDb.notifications.length, 0);
});

test("legacy high-rate saved feed alerts continue to mean monthly 80万円以上", async () => {
  const highDb = alertDb({ rate: "high" });
  await evaluateSavedFeedJobAlerts(highDb, { job: job({ rate: "月額120万円" }) });
  assert.equal(highDb.notifications.length, 1);

  const rangeDb = alertDb({ rate: "high" });
  await evaluateSavedFeedJobAlerts(rangeDb, { job: job({ rate: "75〜95万円" }) });
  assert.equal(rangeDb.notifications.length, 0);
});

test("remote saved feed alerts use shared work-location semantics", async () => {
  const aliasDb = alertDb();
  await evaluateSavedFeedJobAlerts(aliasDb, { job: job({ remotePolicy: "在宅可" }) });
  assert.equal(aliasDb.notifications.length, 1);

  const hybridDb = alertDb();
  await evaluateSavedFeedJobAlerts(hybridDb, { job: job({ remotePolicy: "週1出社" }) });
  assert.equal(hybridDb.notifications.length, 1);

  const negativeDb = alertDb();
  await evaluateSavedFeedJobAlerts(negativeDb, { job: job({ remotePolicy: "リモート不可" }) });
  assert.equal(negativeDb.notifications.length, 0);
  assert.equal(negativeDb.matches.length, 0);

  const onsiteDb = alertDb();
  await evaluateSavedFeedJobAlerts(onsiteDb, { job: job({ remotePolicy: "常駐必須" }) });
  assert.equal(onsiteDb.notifications.length, 0);
  assert.equal(onsiteDb.matches.length, 0);
});

test("saved feed alerts use the same normalized light workload semantics as public filtering", async () => {
  const { filterLightWorkloadJobs } = await import("../src/lib/workload.ts");
  const accepted = [
    "週2",
    "週2〜3日",
    "週1〜3日",
    "3人日",
    "週24時間",
    "月96時間",
    "0.4人月",
    "0.5人月",
    "0.6人月",
    "40%",
    "50%",
    "60%稼働",
    "副業可",
    "複業可",
  ];
  const rejected = ["副業不可", "週3日以上の常駐相談", "週30時間以上", "週4日", "80%", "0.8人月"];

  assert.deepEqual(
    filterLightWorkloadJobs([...accepted, ...rejected].map((workload) => ({ workload }))).map((job) => job.workload),
    accepted,
  );

  for (const workload of accepted) {
    const db = alertDb({ workload: "light" });
    await evaluateSavedFeedJobAlerts(db, { job: job({ workload }) });
    assert.equal(db.notifications.length, 1, `${workload} should match light workload alerts`);
  }

  for (const workload of rejected) {
    const db = alertDb({ workload: "light" });
    await evaluateSavedFeedJobAlerts(db, { job: job({ workload }) });
    assert.equal(db.notifications.length, 0, `${workload} should not match light workload alerts`);
    assert.equal(db.matches.length, 0, `${workload} should not create an alert match`);
  }
});

test("saved feed alerts match canonical skill aliases without raw substring fragments", async () => {
  const aliasDb = alertDb({ query: "TS", skills: "TS" });
  await evaluateSavedFeedJobAlerts(aliasDb, {
    job: job({
      title: "Frontend platform engineer",
      description: "Product work.",
      requiredSkills: "TypeScript",
      preferredSkills: "Next.js",
    }),
  });
  assert.equal(aliasDb.notifications.length, 1);
  assert.match(aliasDb.matches[0].fitReasons, /希望スキル一致|スキル一致/);

  const spacedAliasDb = alertDb({ query: "Next JS", skills: "NextJS" });
  await evaluateSavedFeedJobAlerts(spacedAliasDb, {
    job: job({
      title: "Frontend platform engineer",
      description: "Product work.",
      requiredSkills: "Next.js",
      preferredSkills: null,
    }),
  });
  assert.equal(spacedAliasDb.notifications.length, 1);

  const fragmentDb = alertDb({ query: "act", skills: "React, TypeScript" });
  await evaluateSavedFeedJobAlerts(fragmentDb, { job: job({ title: "React platform engineer" }) });
  assert.equal(fragmentDb.notifications.length, 0);

  const mixedQueryDb = alertDb({ query: "React backend", skills: "React, TypeScript" });
  await evaluateSavedFeedJobAlerts(mixedQueryDb, { job: job({ title: "React platform engineer" }) });
  assert.equal(mixedQueryDb.notifications.length, 0);

  const nextWordDb = alertDb({ query: "Next JS", skills: "NextJS" });
  await evaluateSavedFeedJobAlerts(nextWordDb, {
    job: job({
      title: "Next steps for frontend engineers",
      description: "JavaScript product work.",
      requiredSkills: "JavaScript",
      preferredSkills: null,
    }),
  });
  assert.equal(nextWordDb.notifications.length, 0);
});

test("direct-ready saved feed alerts require publish-ready company, title, and trimmed scope", async () => {
  const readyDb = alertDb({ directReadyOnly: true });
  await evaluateSavedFeedJobAlerts(readyDb, { job: job() });
  assert.equal(readyDb.notifications.length, 1);

  const placeholderCompanyDb = alertDb({ directReadyOnly: true });
  await evaluateSavedFeedJobAlerts(placeholderCompanyDb, { job: job({ companyProfile: { name: "未設定の企業", verificationRequests: [] } }) });
  assert.equal(placeholderCompanyDb.notifications.length, 0);
  assert.equal(placeholderCompanyDb.matches.length, 0);

  const missingTitleDb = alertDb({ directReadyOnly: true });
  await evaluateSavedFeedJobAlerts(missingTitleDb, { job: job({ title: "" }) });
  assert.equal(missingTitleDb.notifications.length, 0);
  assert.equal(missingTitleDb.matches.length, 0);

  const blankDescriptionDb = alertDb({ directReadyOnly: true });
  await evaluateSavedFeedJobAlerts(blankDescriptionDb, { job: job({ description: "   " }) });
  assert.equal(blankDescriptionDb.notifications.length, 0);
  assert.equal(blankDescriptionDb.matches.length, 0);
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

function alertDb({ cadence = JobAlertCadence.immediate, savedJobIds = [], appliedJobIds = [], feedback = [], rate = "", workload = "", query = "React", skills = "React, TypeScript", directReadyOnly = false, failNotifications = false } = {}) {
  const state = {
    dispatches: [],
    matches: [],
    notifications: [],
    failNotifications,
  };
  const freelancer = {
    id: "freelancer-1",
    userId: "user-1",
    skills,
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
        query,
        remote: true,
        acceptingOnly: true,
        directReadyOnly,
        fit: "skill",
        workload,
        rate,
        sort: "direct",
        notificationCadence: cadence,
      },
    ],
  };

  return {
    get dispatches() {
      return state.dispatches;
    },
    get failNotifications() {
      return state.failNotifications;
    },
    set failNotifications(value) {
      state.failNotifications = value;
    },
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
        if (state.failNotifications) throw new Error("notification outage");
        const notification = { id: `notification-${state.notifications.length + 1}`, createdAt: new Date(), ...data };
        state.notifications.push(notification);
        return notification;
      },
    },
    jobAlertDispatch: {
      upsert: async ({ where, create, update }) => {
        const existing = state.dispatches.find((dispatch) => dispatch.jobPostId === where.jobPostId);
        if (existing) {
          Object.assign(existing, Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)), {
            updatedAt: new Date(),
          });
          return existing;
        }
        const dispatch = {
          id: `dispatch-${state.dispatches.length + 1}`,
          jobPostId: create.jobPostId,
          status: create.status ?? JobAlertDispatchStatus.pending,
          attempts: create.attempts ?? 0,
          lastError: create.lastError ?? null,
          lockedAt: create.lockedAt ?? null,
          processedAt: create.processedAt ?? null,
          createdAt: new Date("2026-06-09T00:00:00Z"),
          updatedAt: new Date("2026-06-09T00:00:00Z"),
        };
        state.dispatches.push(dispatch);
        return dispatch;
      },
      findMany: async ({ where, orderBy, take }) => {
        void orderBy;
        return state.dispatches
          .filter((dispatch) => where.status.in.includes(dispatch.status))
          .slice(0, take);
      },
      update: async ({ where, data }) => {
        const dispatch = state.dispatches.find((item) => item.id === where.id);
        Object.assign(dispatch, {
          ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && typeof value !== "object")),
          attempts: data.attempts?.increment ? dispatch.attempts + data.attempts.increment : data.attempts ?? dispatch.attempts,
          lockedAt: data.lockedAt ?? null,
          processedAt: data.processedAt ?? dispatch.processedAt,
          lastError: data.lastError ?? null,
          updatedAt: new Date(),
        });
        return dispatch;
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
