import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JobAlertCadence, JobAlertDispatchStatus, JobAlertMatchStatus, RecommendationFeedbackSentiment } from "@prisma/client";

const {
  dispatchPendingSavedFeedJobAlerts,
  enqueueSavedFeedJobAlertDispatch,
  evaluateSavedFeedJobAlerts,
  jobAlertFeedbackJobPostSelect,
  jobAlertFeedbackSelect,
  loadSavedFeedAlertRecommendationFeedback,
  normalizeAlertCadence,
  SAVED_FEED_ALERT_DISPATCH_LEASE_MS,
  sendDueJobAlertDigests,
} = await import("../src/lib/job-alerts.ts");
const { rankJobRecommendations } = await import("../src/lib/job-recommendations.ts");

const migrationSql = await readFile("prisma/migrations/20260609154000_add_saved_feed_job_alerts/migration.sql", "utf8");
const dispatchMigrationSql = await readFile("prisma/migrations/20260611160000_add_job_alert_dispatches/migration.sql", "utf8");
const dispatchLockIndexMigrationSql = await readFile("prisma/migrations/20260611182000_add_job_alert_dispatch_lock_index/migration.sql", "utf8");
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
  assert.match(dispatchLockIndexMigrationSql, /CREATE INDEX "job_alert_dispatches_status_locked_at_idx"/);
  assert.match(schema, /@@index\(\[status, lockedAt\]\)/);
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
  assert.match(db.notifications[0].body, /一致した理由: 保存キーワード一致: React/);
  assert.doesNotMatch(db.notifications[0].body, /強い一致理由|マッチスコア|積極的に探している|働き方に近い/);
  assert.equal(db.matches.length, 1);
  assert.equal(db.matches[0].status, JobAlertMatchStatus.notified);

  const duplicate = await evaluateSavedFeedJobAlerts(db, { job: job(), now: new Date("2026-06-09T01:00:00Z") });
  assert.equal(duplicate.notified, 0);
  assert.equal(db.notifications.length, 1);
});

test("saved feed alerts suppress jobs matching avoided freelancer conditions", async () => {
  const cases = [
    { excludedConditions: "常駐必須", jobOverrides: { remotePolicy: "常駐必須" } },
    { excludedConditions: "夜間中心", jobOverrides: { description: "ReactとTypeScriptの夜間中心運用。" } },
    { excludedConditions: "短納期のみ", jobOverrides: { workload: "短納期のみ・週3日" } },
  ];

  for (const { excludedConditions, jobOverrides } of cases) {
    const db = alertDb({ excludedConditions, remote: false });
    await evaluateSavedFeedJobAlerts(db, { job: job(jobOverrides), now: new Date("2026-06-09T00:00:00Z") });

    assert.equal(db.notifications.length, 0, `${excludedConditions} should not notify`);
    assert.equal(db.matches.length, 1, `${excludedConditions} should record alert history`);
    assert.equal(db.matches[0].status, JobAlertMatchStatus.suppressed);
    assert.equal(db.matches[0].suppressionReason, "避けたい条件に一致");
    assert.match(db.matches[0].fitReasons, /保存キーワード一致: React|スキル一致: React/);
  }

  const normalDb = alertDb({ excludedConditions: "常駐必須" });
  await evaluateSavedFeedJobAlerts(normalDb, { job: job({ remotePolicy: "リモート可" }) });
  assert.equal(normalDb.notifications.length, 1);
  assert.equal(normalDb.matches[0].status, JobAlertMatchStatus.notified);
});

test("ready saved feed alerts record avoided-condition suppression instead of notifying", async () => {
  const db = alertDb({ excludedConditions: "常駐必須", fit: "ready", remote: false });
  await evaluateSavedFeedJobAlerts(db, { job: job({ remotePolicy: "常駐必須" }) });

  assert.equal(db.notifications.length, 0);
  assert.equal(db.matches.length, 1);
  assert.equal(db.matches[0].status, JobAlertMatchStatus.suppressed);
  assert.equal(db.matches[0].suppressionReason, "避けたい条件に一致");
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

test("saved feed alerts load similar feedback and suppress near hide-similar matches", async () => {
  const referenceJob = job({
    id: "reference-job",
    title: "React platform engineer",
    requiredSkills: "React, TypeScript",
    rate: "80万円",
    workload: "週3日",
    remotePolicy: "リモート可",
    companyProfileId: "company-1",
  });
  const newJob = job({
    id: "new-job",
    title: "React platform engineer",
    requiredSkills: "React, TypeScript",
    rate: "80万円",
    workload: "週3日",
    remotePolicy: "リモート可",
    companyProfileId: "company-1",
  });
  const feedback = [
    {
      jobPostId: "reference-job",
      reason: "hide_similar",
      sentiment: RecommendationFeedbackSentiment.negative,
      hideSimilar: true,
      visibleReasons: "単価と稼働量が近い",
      jobPost: referenceJob,
    },
  ];
  const db = alertDb({ feedback });
  const discoveryRecommendation = rankJobRecommendations([newJob], {
    freelancerReadinessPercent: 100,
    freelancerSkills: db.freelancer.skills,
    recommendationFeedback: feedback,
    workPreference: db.freelancer.workPreference,
  })[0];

  await evaluateSavedFeedJobAlerts(db, { job: newJob });

  assert.equal(discoveryRecommendation.preferenceReasons[0].label, "似た案件を控えめに表示");
  assert.equal(db.notifications.length, 0);
  assert.equal(db.matches.length, 1);
  assert.equal(db.matches[0].status, JobAlertMatchStatus.suppressed);
  assert.match(db.matches[0].suppressionReason, /似た案件を控えめにする/);
});

test("saved feed alert feedback context is capped and includes scorer reference job fields", async () => {
  const queries = [];
  const db = {
    recommendationFeedback: {
      findMany: async (query) => {
        queries.push(query);
        return [];
      },
    },
  };

  await loadSavedFeedAlertRecommendationFeedback(db, {
    contextLimit: 7,
    freelancerProfileId: "freelancer-1",
    jobPostId: "job-1",
  });

  assert.deepEqual(queries[0], {
    where: { freelancerProfileId: "freelancer-1", jobPostId: "job-1" },
    select: jobAlertFeedbackSelect,
  });
  assert.equal(queries[1].take, 7);
  assert.deepEqual(queries[1].orderBy, { updatedAt: "desc" });
  assert.equal(queries[1].where.freelancerProfileId, "freelancer-1");
  assert.deepEqual(queries[1].where.jobPostId, { not: "job-1" });
  assert.deepEqual(Object.keys(jobAlertFeedbackJobPostSelect).sort(), [
    "companyProfileId",
    "description",
    "id",
    "location",
    "preferredSkills",
    "rate",
    "remotePolicy",
    "requiredSkills",
    "title",
    "workload",
  ]);
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
  assert.match(db.notifications[0].body, /一致した理由: 保存キーワード一致: React/);
  assert.doesNotMatch(db.notifications[0].body, /主な一致理由|マッチスコア|積極的に探している/);
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

test("dispatch boundary skips non-stale processing locks", async () => {
  const db = alertDb();
  await enqueueSavedFeedJobAlertDispatch(db, { jobPostId: "job-1" });
  db.dispatches[0].status = JobAlertDispatchStatus.processing;
  db.dispatches[0].lockedAt = new Date("2026-06-09T00:10:00Z");

  const result = await dispatchPendingSavedFeedJobAlerts(db, { now: new Date("2026-06-09T00:20:00Z") });

  assert.deepEqual(result, { processed: 0, completed: 0, failed: 0 });
  assert.equal(db.dispatches[0].status, JobAlertDispatchStatus.processing);
  assert.equal(db.dispatches[0].attempts, 0);
  assert.equal(db.notifications.length, 0);
});

test("dispatch boundary retries stale processing locks", async () => {
  const db = alertDb();
  await enqueueSavedFeedJobAlertDispatch(db, { jobPostId: "job-1" });
  db.dispatches[0].status = JobAlertDispatchStatus.processing;
  db.dispatches[0].lockedAt = new Date("2026-06-09T00:00:00Z");
  db.dispatches[0].lastError = "worker exited during notification fanout";

  const now = new Date("2026-06-09T00:16:00Z");
  const result = await dispatchPendingSavedFeedJobAlerts(db, { now });

  assert.deepEqual(result, { processed: 1, completed: 1, failed: 0 });
  assert.equal(db.dispatches[0].status, JobAlertDispatchStatus.completed);
  assert.equal(db.dispatches[0].attempts, 1);
  assert.equal(db.dispatches[0].lockedAt, null);
  assert.equal(db.dispatches[0].lastError, null);
  assert.equal(db.notifications.length, 1);
});

test("dispatch boundary preserves diagnosis until a stale retry succeeds or fails", async () => {
  const db = alertDb({ failNotifications: true });
  await enqueueSavedFeedJobAlertDispatch(db, { jobPostId: "job-1" });
  db.dispatches[0].status = JobAlertDispatchStatus.processing;
  db.dispatches[0].lockedAt = new Date("2026-06-09T00:00:00Z");
  db.dispatches[0].attempts = 2;
  db.dispatches[0].lastError = "previous worker timed out";

  const result = await dispatchPendingSavedFeedJobAlerts(db, {
    now: new Date(new Date("2026-06-09T00:00:00Z").getTime() + SAVED_FEED_ALERT_DISPATCH_LEASE_MS + 1),
  });

  assert.deepEqual(result, { processed: 1, completed: 0, failed: 1 });
  assert.equal(db.dispatches[0].status, JobAlertDispatchStatus.failed);
  assert.equal(db.dispatches[0].attempts, 3);
  assert.match(db.dispatches[0].lastError, /notification outage/);
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
    assert.match(includedDb.matches[0].fitReasons, new RegExp(`保存単価条件: 月${rate === "high" ? "80" : rate}万円以上`));

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
  assert.match(aliasDb.matches[0].fitReasons, /保存リモート条件: 在宅可/);

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
    assert.match(db.matches[0].fitReasons, /保存稼働量条件: 週2-3日目安/);
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
  assert.match(aliasDb.matches[0].fitReasons, /保存キーワード一致: TS|スキル一致: TypeScript/);
  assert.doesNotMatch(aliasDb.notifications[0].body, /マッチスコア|積極的に探している/);

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
  assert.match(readyDb.matches[0].fitReasons, /応募前条件がそろっています/);

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

test("ready saved feed alerts use freelancer readiness for borderline condition-ready jobs", async () => {
  const borderlineJob = job({ requiredSkills: "React, Go", preferredSkills: null });
  const db = alertDb({ fit: "ready", skills: "React" });

  const publicReadyResults = rankJobRecommendations([borderlineJob], {
    freelancerReadinessPercent: 100,
    freelancerSkills: "React",
    workPreference: db.freelancer.workPreference,
  }, {
    fit: "ready",
  });
  await evaluateSavedFeedJobAlerts(db, { job: borderlineJob });

  assert.equal(publicReadyResults.length, 1);
  assert.equal(db.notifications.length, 1);
  assert.equal(db.matches[0].status, JobAlertMatchStatus.notified);
  assert.match(db.matches[0].fitReasons, /応募準備と案件条件がそろっています|スキル一致: React/);
});

test("saved feed alerts suppress direct-score-only matches without concrete notification evidence", async () => {
  const db = alertDb({ fit: "", query: "", skills: "", remote: false });

  await evaluateSavedFeedJobAlerts(db, {
    job: job({
      title: "Platform support",
      description: "幅広い開発支援。",
      requiredSkills: null,
      preferredSkills: null,
      rate: null,
      workload: null,
      contractPeriod: null,
      selectionFlow: null,
      contractTerms: null,
      location: null,
      remotePolicy: null,
      companyProfile: null,
    }),
  });

  assert.equal(db.notifications.length, 0);
  assert.equal(db.matches.length, 1);
  assert.equal(db.matches[0].status, JobAlertMatchStatus.suppressed);
  assert.equal(db.matches[0].suppressionReason, "具体的な一致理由不足");
  assert.doesNotMatch(db.matches[0].fitReasons, /マッチスコア|積極的に探している|働き方に近い/);
});

test("trust warnings stay visible before concrete positive alert reasons", async () => {
  const db = alertDb();

  await evaluateSavedFeedJobAlerts(db, { job: job({ companyProfile: { name: "Acme", verificationRequests: [] } }) });

  assert.equal(db.notifications.length, 1);
  const body = db.notifications[0].body;
  assert.match(body, /確認事項: 会社・Web公開情報:/);
  assert.match(body, /一致した理由: 保存キーワード一致: React/);
  assert.ok(body.indexOf("確認事項:") < body.indexOf("一致した理由:"));
  assert.doesNotMatch(body, /強い一致理由|マッチスコア|積極的に探している/);
});

test("ready saved feed alerts do not imply ready-to-apply when freelancer readiness is incomplete", async () => {
  const db = alertDb({ fit: "ready", readiness: "missing_documents" });

  await evaluateSavedFeedJobAlerts(db, { job: job() });

  assert.equal(db.notifications.length, 0);
  assert.equal(db.matches.length, 0);
});

test("ready saved feed alerts do not let perfect skill match bypass freelancer readiness", async () => {
  const db = alertDb({ fit: "ready", readiness: "missing_career" });

  await evaluateSavedFeedJobAlerts(db, { job: job({ requiredSkills: "React, TypeScript" }) });

  assert.equal(db.notifications.length, 0);
  assert.equal(db.matches.length, 0);
});

test("ready saved feed alerts keep saved, applied, dismissed, and handled suppression ahead of notification", async () => {
  const savedDb = alertDb({ fit: "ready", savedJobIds: ["job-1"] });
  await evaluateSavedFeedJobAlerts(savedDb, { job: job({ requiredSkills: "React, Go" }) });
  assert.equal(savedDb.notifications.length, 0);
  assert.equal(savedDb.matches[0].status, JobAlertMatchStatus.suppressed);
  assert.match(savedDb.matches[0].suppressionReason, /保存済み/);

  const appliedDb = alertDb({ fit: "ready", appliedJobIds: ["job-1"] });
  await evaluateSavedFeedJobAlerts(appliedDb, { job: job({ requiredSkills: "React, Go" }) });
  assert.equal(appliedDb.notifications.length, 0);
  assert.equal(appliedDb.matches[0].status, JobAlertMatchStatus.suppressed);
  assert.match(appliedDb.matches[0].suppressionReason, /応募済み/);

  const dismissedDb = alertDb({
    fit: "ready",
    feedback: [{ jobPostId: "job-1", reason: "not_relevant", sentiment: RecommendationFeedbackSentiment.negative, hideSimilar: false, visibleReasons: null }],
  });
  await evaluateSavedFeedJobAlerts(dismissedDb, { job: job({ companyProfile: null }) });
  assert.equal(dismissedDb.notifications.length, 0);
  assert.equal(dismissedDb.matches[0].status, JobAlertMatchStatus.suppressed);
  assert.match(dismissedDb.matches[0].suppressionReason, /フィードバック済み/);

  const handledDb = alertDb({
    fit: "ready",
    feedback: [{ jobPostId: "job-1", reason: "already_handled", sentiment: RecommendationFeedbackSentiment.neutral, hideSimilar: false, visibleReasons: null }],
  });
  await evaluateSavedFeedJobAlerts(handledDb, { job: job({ companyProfile: null }) });
  assert.equal(handledDb.notifications.length, 0);
  assert.equal(handledDb.matches[0].status, JobAlertMatchStatus.suppressed);
  assert.match(handledDb.matches[0].suppressionReason, /対応済み/);
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
    companyProfile: Object.hasOwn(overrides, "companyProfile")
      ? overrides.companyProfile
      : {
          name: "Acme",
          verificationRequests: [],
        },
  };
}

function alertDb({ cadence = JobAlertCadence.immediate, savedJobIds = [], appliedJobIds = [], feedback = [], rate = "", workload = "", query = "React", skills = "React, TypeScript", directReadyOnly = false, excludedConditions = null, failNotifications = false, fit = "skill", readiness = "complete", remote = true } = {}) {
  const state = {
    dispatches: [],
    matches: [],
    notifications: [],
    failNotifications,
  };
  const freelancer = {
    id: "freelancer-1",
    userId: "user-1",
    ...freelancerReadinessFields(readiness),
    skills,
    workPreference: {
      status: "active",
      targetRole: "React",
      preferredSkills: "React, TypeScript",
      targetRate: "80万円",
      workload: "週3日",
      locationMode: "remote",
      excludedConditions,
      lastConfirmedAt: new Date("2026-06-01T00:00:00Z"),
    },
    savedJobSearches: [
      {
        id: "feed-1",
        name: cadence === JobAlertCadence.immediate ? "React即時" : "React日次",
        query,
        remote,
        acceptingOnly: true,
        directReadyOnly,
        fit,
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
    get freelancer() {
      return freelancer;
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
          .filter((dispatch) => dispatchMatchesWhere(dispatch, where))
          .slice(0, take);
      },
      updateMany: async ({ where, data }) => {
        const dispatches = state.dispatches.filter((dispatch) => dispatchMatchesWhere(dispatch, where));
        for (const dispatch of dispatches) {
          applyDispatchUpdate(dispatch, data);
        }
        return { count: dispatches.length };
      },
      update: async ({ where, data }) => {
        const dispatch = state.dispatches.find((item) => item.id === where.id);
        applyDispatchUpdate(dispatch, data);
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

function freelancerReadinessFields(readiness) {
  const fields = {
    fullName: "山田 太郎",
    desiredOccupation: "フロントエンドエンジニア",
    availability: "週3日",
    availableFrom: "2026-07",
    careerHistory: {
      summary: "ReactとTypeScriptの業務システム開発を担当。",
      workExperiences: "SaaS開発、設計、実装、運用。",
    },
    documents: [
      { documentType: "resume" },
      { documentType: "career_history" },
    ],
  };
  if (readiness === "missing_documents") return { ...fields, documents: [] };
  if (readiness === "missing_career") return { ...fields, careerHistory: null };
  return fields;
}

function dispatchMatchesWhere(dispatch, where) {
  if (where.id && dispatch.id !== where.id) return false;
  if (where.status && !statusMatches(dispatch.status, where.status)) return false;
  if (where.lockedAt && !dateMatches(dispatch.lockedAt, where.lockedAt)) return false;
  if (where.OR && !where.OR.some((condition) => dispatchMatchesWhere(dispatch, condition))) return false;
  return true;
}

function statusMatches(status, condition) {
  if (typeof condition === "string") return status === condition;
  if (condition.in) return condition.in.includes(status);
  return true;
}

function dateMatches(value, condition) {
  if (!value) return false;
  if (condition.lte && value > condition.lte) return false;
  return true;
}

function applyDispatchUpdate(dispatch, data) {
  Object.assign(dispatch, {
    ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && typeof value !== "object")),
    attempts: data.attempts?.increment ? dispatch.attempts + data.attempts.increment : data.attempts ?? dispatch.attempts,
    lockedAt: Object.hasOwn(data, "lockedAt") ? data.lockedAt : dispatch.lockedAt,
    processedAt: Object.hasOwn(data, "processedAt") ? data.processedAt : dispatch.processedAt,
    lastError: Object.hasOwn(data, "lastError") ? data.lastError : dispatch.lastError,
    updatedAt: new Date(),
  });
}
