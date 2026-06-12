import {
  JobAlertDispatchStatus,
  JobAlertCadence,
  JobAlertMatchStatus,
  RecommendationFeedbackReason,
  RecommendationFeedbackSentiment,
  type Prisma,
} from "@prisma/client";
import { buildJobRecommendation, type JobRecommendationJob } from "./job-recommendations.ts";
import { jobMatchesSearchQuery } from "./job-search.ts";
import { isMonthlyRateAtLeastText, monthlyRateBandFromFilter, monthlyRateBandLabel } from "./rates.ts";
import { getFreelancerReadiness, type FreelancerReadinessProfile } from "./readiness.ts";
import { isRemoteCompatibleWorkLocation } from "./work-location.ts";
import { isLightWorkloadText, LIGHT_WORKLOAD_FILTER_LABEL } from "./workload.ts";
import type { WorkPreferenceInput } from "./utils.ts";

export const JOB_ALERT_REASON_LIMIT = 3;
export const JOB_ALERT_FEEDBACK_CONTEXT_LIMIT = 50;
// Dispatch workers reclaim processing rows after this lease to recover from crashes.
export const SAVED_FEED_ALERT_DISPATCH_LEASE_MS = 15 * 60 * 1000;

export const jobAlertFeedbackJobPostSelect = {
  id: true,
  title: true,
  description: true,
  requiredSkills: true,
  preferredSkills: true,
  rate: true,
  workload: true,
  location: true,
  remotePolicy: true,
  companyProfileId: true,
} satisfies Prisma.JobPostSelect;

export const jobAlertFeedbackSelect = {
  jobPostId: true,
  reason: true,
  sentiment: true,
  hideSimilar: true,
  visibleReasons: true,
  jobPost: { select: jobAlertFeedbackJobPostSelect },
} satisfies Prisma.RecommendationFeedbackSelect;

type AlertDb = Pick<
  Prisma.TransactionClient,
  "freelancerProfile" | "jobAlertMatch" | "jobApplication" | "jobPost" | "notification" | "recommendationFeedback" | "savedJob"
>;

type AlertDispatchDb = AlertDb & Pick<Prisma.TransactionClient, "jobAlertDispatch">;

type SavedFeed = {
  id: string;
  name: string;
  query?: string | null;
  remote: boolean;
  acceptingOnly: boolean;
  freshOnly?: boolean | null;
  directReadyOnly: boolean;
  fit?: string | null;
  workload?: string | null;
  rate?: string | null;
  sort: string;
  notificationCadence: JobAlertCadence | string;
};

type AlertFreelancer = FreelancerReadinessProfile & {
  id: string;
  userId: string;
  skills?: string | null;
  savedJobSearches: SavedFeed[];
  workPreference?: WorkPreferenceInput;
};

type AlertJob = JobRecommendationJob & {
  title: string;
  description?: string | null;
  status?: string | null;
  companyProfile?: { name?: string | null } | null;
};

export async function evaluateSavedFeedJobAlerts(
  db: AlertDb,
  input: ({ jobPostId: string; now?: Date } | { job: AlertJob; now?: Date }) & { sendDueDigests?: boolean },
) {
  const now = input.now ?? new Date();
  const job =
    "job" in input
      ? input.job
      : await db.jobPost.findUnique({
          where: { id: input.jobPostId },
          include: {
            companyProfile: {
              include: {
                verificationRequests: {
                  orderBy: { createdAt: "desc" },
                  take: 4,
                },
              },
            },
          },
        });
  if (!job || job.status !== "published" || job.applicationStatus !== "open") return { created: 0, notified: 0, suppressed: 0 };

  const freelancers: AlertFreelancer[] = await db.freelancerProfile.findMany({
    where: {
      savedJobSearches: { some: { notificationCadence: { not: JobAlertCadence.paused } } },
      workPreference: { is: { status: { not: "inactive" } } },
    },
    include: {
      careerHistory: true,
      documents: true,
      savedJobSearches: true,
      workPreference: true,
    },
  });

  let created = 0;
  let notified = 0;
  let suppressed = 0;

  for (const freelancer of freelancers) {
    const activeFeeds = freelancer.savedJobSearches.filter((feed) => feed.notificationCadence !== JobAlertCadence.paused);
    if (activeFeeds.length === 0) continue;

    const [applications, savedJobs, feedback] = await Promise.all([
      db.jobApplication.findMany({
        where: { freelancerProfileId: freelancer.id, jobPostId: job.id },
        select: { jobPostId: true },
      }),
      db.savedJob.findMany({
        where: { freelancerProfileId: freelancer.id, jobPostId: job.id },
        select: { jobPostId: true },
      }),
      loadSavedFeedAlertRecommendationFeedback(db, { freelancerProfileId: freelancer.id, jobPostId: job.id }),
    ]);

    const appliedJobIds = new Set(applications.map((application) => application.jobPostId));
    const savedJobIds = new Set(savedJobs.map((savedJob) => savedJob.jobPostId));
    const exactHandledFeedback = feedback.find(
      (signal) =>
        signal.jobPostId === job.id &&
        (signal.sentiment === RecommendationFeedbackSentiment.negative || signal.reason === "already_handled"),
    );
    const readiness = getFreelancerReadiness(freelancer);
    const suppressionReason = appliedJobIds.has(job.id)
      ? "応募済み"
      : savedJobIds.has(job.id)
        ? "検討リストに保存済み"
        : exactHandledFeedback
          ? exactHandledFeedback.reason === "already_handled"
            ? "別経路で対応済み"
            : "関連なし、非表示、条件不一致などのフィードバック済み"
          : null;

    const recommendation = buildJobRecommendation(job, {
      appliedJobIds,
      freelancerReadinessPercent: readiness.percent,
      freelancerSkills: freelancer.skills,
      recommendationFeedback: feedback,
      savedJobIds,
      workPreference: freelancer.workPreference,
    });

    for (const feed of activeFeeds) {
      if (!savedFeedMatchesRecommendation(feed, recommendation, { freelancerReady: readiness.isReady })) continue;
      const trustWarning = alertTrustWarning(recommendation);
      const fitReasons = alertFitReasons(feed, recommendation, { feedback, freelancerReady: readiness.isReady, trustWarning });
      const similarFeedbackReason = alertSimilarFeedbackSuppressionReason(recommendation);
      const avoidedConditionReason = recommendation.isAvoidedConditionMatched ? "避けたい条件に一致" : null;
      const lowConfidenceReason = fitReasons ? null : "具体的な一致理由不足";
      const effectiveSuppressionReason = suppressionReason ?? similarFeedbackReason ?? avoidedConditionReason ?? lowConfidenceReason;
      const cadence = normalizeAlertCadence(feed.notificationCadence);
      const match = await db.jobAlertMatch.upsert({
        where: {
          savedJobSearchId_jobPostId: {
            savedJobSearchId: feed.id,
            jobPostId: job.id,
          },
        },
        create: {
          freelancerProfileId: freelancer.id,
          savedJobSearchId: feed.id,
          jobPostId: job.id,
          cadence,
          status: effectiveSuppressionReason ? JobAlertMatchStatus.suppressed : cadence === JobAlertCadence.immediate ? JobAlertMatchStatus.notified : JobAlertMatchStatus.pending_digest,
          fitReasons: fitReasons ?? "具体的な一致理由不足",
          trustWarning,
          suppressionReason: effectiveSuppressionReason,
          matchedAt: now,
          notifiedAt: effectiveSuppressionReason || cadence !== JobAlertCadence.immediate ? null : now,
        },
        update: {
          cadence,
          fitReasons: fitReasons ?? "具体的な一致理由不足",
          trustWarning,
          suppressionReason: effectiveSuppressionReason,
          status: effectiveSuppressionReason ? JobAlertMatchStatus.suppressed : undefined,
        },
      });

      if (match.createdAt?.getTime?.() === match.updatedAt?.getTime?.()) created += 1;
      if (effectiveSuppressionReason) {
        suppressed += 1;
        continue;
      }
      if (!fitReasons) continue;
      if (cadence === JobAlertCadence.immediate && !match.notificationId) {
        const notification = await db.notification.create({
          data: {
            userId: freelancer.userId,
            type: "job_alert",
            title: `${job.title} が「${feed.name}」に一致しました`,
            body: alertNotificationBody({ companyName: job.companyProfile?.name, feedName: feed.name, fitReasons, trustWarning }),
            actionUrl: `/jobs/${job.id}`,
          },
        });
        await db.jobAlertMatch.update({
          where: { id: match.id },
          data: { notificationId: notification.id, status: JobAlertMatchStatus.notified, notifiedAt: now },
        });
        notified += 1;
      }
    }
  }

  if (input.sendDueDigests === false) return { created, notified, suppressed };

  const daily = await sendDueJobAlertDigests(db, { cadence: JobAlertCadence.daily, now });
  const weekly = await sendDueJobAlertDigests(db, { cadence: JobAlertCadence.weekly, now });
  return { created, notified: notified + daily.notified + weekly.notified, suppressed };
}

export async function loadSavedFeedAlertRecommendationFeedback(
  db: Pick<Prisma.TransactionClient, "recommendationFeedback">,
  {
    contextLimit = JOB_ALERT_FEEDBACK_CONTEXT_LIMIT,
    freelancerProfileId,
    jobPostId,
  }: {
    contextLimit?: number;
    freelancerProfileId: string;
    jobPostId: string;
  },
) {
  const [exactFeedback, contextualFeedback] = await Promise.all([
    db.recommendationFeedback.findMany({
      where: { freelancerProfileId, jobPostId },
      select: jobAlertFeedbackSelect,
    }),
    db.recommendationFeedback.findMany({
      where: {
        freelancerProfileId,
        jobPostId: { not: jobPostId },
        OR: [
          { hideSimilar: true },
          { sentiment: RecommendationFeedbackSentiment.positive },
          {
            sentiment: RecommendationFeedbackSentiment.negative,
            reason: {
              in: [
                RecommendationFeedbackReason.rate_mismatch,
                RecommendationFeedbackReason.workload_mismatch,
                RecommendationFeedbackReason.location_mismatch,
                RecommendationFeedbackReason.company_trust_concern,
                RecommendationFeedbackReason.wrong_role_skill,
                RecommendationFeedbackReason.not_relevant,
              ],
            },
          },
        ],
      },
      select: jobAlertFeedbackSelect,
      orderBy: { updatedAt: "desc" },
      take: contextLimit,
    }),
  ]);

  return [...exactFeedback, ...contextualFeedback];
}

export function shouldDispatchSavedFeedJobAlerts(job: { status?: string | null; applicationStatus?: string | null }) {
  return job.status === "published" && job.applicationStatus === "open";
}

export async function enqueueSavedFeedJobAlertDispatch(
  db: Pick<Prisma.TransactionClient, "jobAlertDispatch">,
  { jobPostId }: { jobPostId: string },
) {
  return db.jobAlertDispatch.upsert({
    where: { jobPostId },
    create: { jobPostId },
    update: {
      status: JobAlertDispatchStatus.pending,
      lockedAt: null,
      processedAt: null,
      lastError: null,
    },
  });
}

export async function dispatchPendingSavedFeedJobAlerts(
  db: AlertDispatchDb,
  {
    limit = 10,
    now = new Date(),
    leaseMs = SAVED_FEED_ALERT_DISPATCH_LEASE_MS,
  }: { limit?: number; now?: Date; leaseMs?: number } = {},
) {
  const staleLockedBefore = new Date(now.getTime() - leaseMs);
  const tasks = await db.jobAlertDispatch.findMany({
    where: dispatchRetryableWhere(staleLockedBefore),
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let completed = 0;
  let failed = 0;
  let processed = 0;
  for (const task of tasks) {
    const claim = await db.jobAlertDispatch.updateMany({
      where: {
        id: task.id,
        ...dispatchRetryableWhere(staleLockedBefore),
      },
      data: {
        status: JobAlertDispatchStatus.processing,
        lockedAt: now,
        attempts: { increment: 1 },
      },
    });
    if (claim.count === 0) continue;
    processed += 1;

    try {
      await evaluateSavedFeedJobAlerts(db, {
        jobPostId: task.jobPostId,
        now,
        sendDueDigests: false,
      });
      await db.jobAlertDispatch.update({
        where: { id: task.id },
        data: {
          status: JobAlertDispatchStatus.completed,
          processedAt: now,
          lockedAt: null,
          lastError: null,
        },
      });
      completed += 1;
    } catch (error) {
      await db.jobAlertDispatch.update({
        where: { id: task.id },
        data: {
          status: JobAlertDispatchStatus.failed,
          lockedAt: null,
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
      failed += 1;
    }
  }

  return { processed, completed, failed };
}

function dispatchRetryableWhere(staleLockedBefore: Date): Prisma.JobAlertDispatchWhereInput {
  return {
    OR: [
      { status: { in: [JobAlertDispatchStatus.pending, JobAlertDispatchStatus.failed] } },
      {
        status: JobAlertDispatchStatus.processing,
        lockedAt: { lte: staleLockedBefore },
      },
    ],
  };
}

export async function sendDueJobAlertDigests(
  db: AlertDb,
  { cadence, now = new Date() }: { cadence: typeof JobAlertCadence.daily | typeof JobAlertCadence.weekly; now?: Date },
) {
  const pending = await db.jobAlertMatch.findMany({
    where: { cadence, status: JobAlertMatchStatus.pending_digest },
    orderBy: { matchedAt: "asc" },
    include: {
      freelancerProfile: { select: { userId: true } },
      jobPost: { select: { id: true, title: true, companyProfile: { select: { name: true } } } },
      savedJobSearch: { select: { id: true, name: true } },
    },
  });
  const byFeed = new Map<string, typeof pending>();
  for (const match of pending) {
    const key = match.savedJobSearchId;
    byFeed.set(key, [...(byFeed.get(key) ?? []), match]);
  }

  let notified = 0;
  for (const matches of byFeed.values()) {
    const first = matches[0];
    if (!first || !digestWindowElapsed(first.matchedAt, now, cadence)) continue;
    const topJobs = matches.slice(0, 3);
    const notification = await db.notification.create({
      data: {
        userId: first.freelancerProfile.userId,
        type: "job_alert_digest",
        title: `「${first.savedJobSearch.name}」の新着候補 ${matches.length}件`,
        body: [
          ...topJobs.map((match) =>
            [
              `${match.jobPost.title}${match.jobPost.companyProfile?.name ? ` / ${match.jobPost.companyProfile.name}` : ""}`,
              match.trustWarning ? `確認事項: ${match.trustWarning}` : null,
              match.fitReasons ? `一致した理由: ${match.fitReasons}` : null,
            ].filter(Boolean).join("\n"),
          ),
        ].filter(Boolean).join("\n"),
        actionUrl: `/jobs/${first.jobPostId}`,
      },
    });
    await Promise.all(
      matches.map((match) =>
        db.jobAlertMatch.update({
          where: { id: match.id },
          data: { notificationId: notification.id, status: JobAlertMatchStatus.notified, notifiedAt: now },
        }),
      ),
    );
    notified += 1;
  }

  return { notified };
}

export function normalizeAlertCadence(value?: FormDataEntryValue | string | null) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (text === JobAlertCadence.daily || text === "daily_digest" || text === "毎日" || text === "日次") return JobAlertCadence.daily;
  if (text === JobAlertCadence.weekly || text === "weekly_digest" || text === "週1回" || text === "週次") return JobAlertCadence.weekly;
  if (text === JobAlertCadence.paused || text === "none" || text === "off" || text === "通知なし" || text === "停止") return JobAlertCadence.paused;
  return JobAlertCadence.immediate;
}

export function alertCadenceLabel(cadence?: JobAlertCadence | string | null) {
  const labels: Record<string, string> = {
    immediate: "即時通知",
    daily: "日次ダイジェスト",
    weekly: "週次ダイジェスト",
    paused: "停止中",
  };
  return cadence ? labels[cadence] ?? String(cadence) : labels.immediate;
}

function savedFeedMatchesRecommendation(
  feed: SavedFeed,
  recommendation: ReturnType<typeof buildJobRecommendation<AlertJob>>,
  { freelancerReady }: { freelancerReady: boolean },
) {
  const job = recommendation.job;
  if (feed.acceptingOnly && !recommendation.isOpen) return false;
  if (feed.freshOnly && !recommendation.isFreshCandidate) return false;
  if (feed.remote && !isRemoteCompatibleWorkLocation(job)) return false;
  if (feed.query && !jobMatchesSearchQuery(feed.query, job)) return false;
  if (feed.directReadyOnly && recommendation.contractReadinessPercent < 100) return false;
  if (feed.fit === "skill" && !recommendation.isSkillMatched) return false;
  if (
    feed.fit === "ready" &&
    (!freelancerReady || (!recommendation.isReadyToApply && !(recommendation.isAvoidedConditionMatched && recommendation.wouldBeReadyToApplyWithoutAvoidance)))
  ) return false;
  if (feed.workload === "light" && !isLightWorkloadText(job.workload)) return false;
  const rateThreshold = monthlyRateBandFromFilter(feed.rate);
  if (rateThreshold !== null && !isMonthlyRateAtLeastText(job.rate, rateThreshold)) return false;
  return recommendation.directScore >= 45 ||
    recommendation.isSkillMatched ||
    recommendation.isReadyToApply ||
    (recommendation.isAvoidedConditionMatched && recommendation.wouldBeReadyToApplyWithoutAvoidance);
}

function alertFitReasons(
  feed: SavedFeed,
  recommendation: ReturnType<typeof buildJobRecommendation<AlertJob>>,
  {
    feedback,
    freelancerReady,
    trustWarning,
  }: {
    feedback: Array<{ jobPostId: string; reason: string; sentiment: RecommendationFeedbackSentiment }>;
    freelancerReady: boolean;
    trustWarning?: string | null;
  },
) {
  const reasons: string[] = [];
  const job = recommendation.job;
  const query = feed.query?.trim();
  const rateThreshold = monthlyRateBandFromFilter(feed.rate);
  const exactPositiveFeedback = feedback.find(
    (signal) => signal.jobPostId === job.id && signal.sentiment === RecommendationFeedbackSentiment.positive,
  );

  if (query && jobMatchesSearchQuery(query, job)) reasons.push(`保存キーワード一致: ${query}`);
  if (recommendation.matched.length > 0) reasons.push(`スキル一致: ${recommendation.matched.slice(0, JOB_ALERT_REASON_LIMIT).join("、")}`);
  if (rateThreshold !== null) reasons.push(`保存単価条件: ${monthlyRateBandLabel(rateThreshold)}`);
  if (feed.workload === "light") reasons.push(`保存稼働量条件: ${LIGHT_WORKLOAD_FILTER_LABEL}`);
  if (feed.directReadyOnly && recommendation.contractReadinessPercent >= 100) {
    reasons.push("応募前条件がそろっています: 単価・稼働量・契約条件");
  }
  if (feed.fit === "ready" && freelancerReady && recommendation.isReadyToApply) {
    reasons.push("応募準備と案件条件がそろっています");
  }
  if (feed.remote) {
    const location = [job.remotePolicy, job.location].filter(Boolean).join(" / ");
    if (location) reasons.push(`保存リモート条件: ${location}`);
  }
  if (exactPositiveFeedback) reasons.push("保存フィードバック: 良さそう");
  if (trustWarning) reasons.push(`確認事項あり: ${trustWarning}`);

  return uniqueReasons(reasons).slice(0, JOB_ALERT_REASON_LIMIT).join("、") || null;
}

function alertTrustWarning(recommendation: ReturnType<typeof buildJobRecommendation<AlertJob>>) {
  if (!recommendation.trustConfidence || recommendation.trustConfidence.tone === "good") return null;
  const warning = recommendation.trustConfidence.items.find((item) => item.status === "missing" || item.status === "stale" || item.status === "rejected");
  return warning ? `${warning.label}: ${warning.detail}` : recommendation.trustConfidence.label;
}

function alertSimilarFeedbackSuppressionReason(recommendation: ReturnType<typeof buildJobRecommendation<AlertJob>>) {
  const similarFeedback = recommendation.preferenceReasons.find((reason) => reason.label === "似た案件を控えめに表示");
  return similarFeedback ? "以前の「似た案件を控えめにする」フィードバックと近い条件のため通知を控えました" : null;
}

function alertNotificationBody({
  companyName,
  feedName,
  fitReasons,
  trustWarning,
}: {
  companyName?: string | null;
  feedName: string;
  fitReasons: string;
  trustWarning?: string | null;
}) {
  return [
    companyName ? `企業: ${companyName}` : null,
    `一致したフィード: ${feedName}`,
    trustWarning ? `確認事項: ${trustWarning}` : null,
    `一致した理由: ${fitReasons}`,
  ].filter(Boolean).join("\n");
}

function uniqueReasons(reasons: string[]) {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    if (!reason || seen.has(reason)) return false;
    seen.add(reason);
    return true;
  });
}

function digestWindowElapsed(matchedAt: Date, now: Date, cadence: typeof JobAlertCadence.daily | typeof JobAlertCadence.weekly) {
  const hours = (now.getTime() - new Date(matchedAt).getTime()) / (1000 * 60 * 60);
  return hours >= (cadence === JobAlertCadence.daily ? 24 : 24 * 7);
}
