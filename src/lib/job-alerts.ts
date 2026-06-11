import {
  JobAlertCadence,
  JobAlertMatchStatus,
  RecommendationFeedbackSentiment,
  type Prisma,
} from "@prisma/client";
import { buildJobRecommendation, type JobRecommendationJob } from "./job-recommendations.ts";
import { jobMatchesSearchQuery } from "./job-search.ts";
import { isMonthlyRateAtLeastText, monthlyRateBandFromFilter } from "./rates.ts";
import { isRemoteCompatibleWorkLocation } from "./work-location.ts";

export const JOB_ALERT_REASON_LIMIT = 3;

type AlertDb = Pick<
  Prisma.TransactionClient,
  "freelancerProfile" | "jobAlertMatch" | "jobApplication" | "jobPost" | "notification" | "recommendationFeedback" | "savedJob"
>;

type SavedFeed = {
  id: string;
  name: string;
  query?: string | null;
  remote: boolean;
  acceptingOnly: boolean;
  directReadyOnly: boolean;
  fit?: string | null;
  workload?: string | null;
  rate?: string | null;
  sort: string;
  notificationCadence: JobAlertCadence | string;
};

type AlertFreelancer = {
  id: string;
  userId: string;
  skills?: string | null;
  savedJobSearches: SavedFeed[];
  workPreference?: Record<string, unknown> | null;
};

type AlertJob = JobRecommendationJob & {
  title: string;
  description?: string | null;
  status?: string | null;
  companyProfile?: { name?: string | null } | null;
};

export async function evaluateSavedFeedJobAlerts(
  db: AlertDb,
  input: { jobPostId: string; now?: Date } | { job: AlertJob; now?: Date },
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
      db.recommendationFeedback.findMany({
        where: { freelancerProfileId: freelancer.id, jobPostId: job.id },
        select: { jobPostId: true, reason: true, sentiment: true, hideSimilar: true, visibleReasons: true },
      }),
    ]);

    const appliedJobIds = new Set(applications.map((application) => application.jobPostId));
    const savedJobIds = new Set(savedJobs.map((savedJob) => savedJob.jobPostId));
    const exactNegativeFeedback = feedback.find((signal) => signal.sentiment === RecommendationFeedbackSentiment.negative);
    const suppressionReason = appliedJobIds.has(job.id)
      ? "応募済み"
      : savedJobIds.has(job.id)
        ? "検討リストに保存済み"
        : exactNegativeFeedback
          ? "関連なし、非表示、条件不一致などのフィードバック済み"
          : null;

    const recommendation = buildJobRecommendation(job, {
      appliedJobIds,
      freelancerSkills: freelancer.skills,
      recommendationFeedback: feedback,
      savedJobIds,
      workPreference: freelancer.workPreference,
    });

    for (const feed of activeFeeds) {
      if (!savedFeedMatchesRecommendation(feed, recommendation)) continue;
      const fitReasons = alertFitReasons(recommendation);
      const trustWarning = alertTrustWarning(recommendation);
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
          status: suppressionReason ? JobAlertMatchStatus.suppressed : cadence === JobAlertCadence.immediate ? JobAlertMatchStatus.notified : JobAlertMatchStatus.pending_digest,
          fitReasons,
          trustWarning,
          suppressionReason,
          matchedAt: now,
          notifiedAt: suppressionReason || cadence !== JobAlertCadence.immediate ? null : now,
        },
        update: {
          cadence,
          fitReasons,
          trustWarning,
          suppressionReason,
          status: suppressionReason ? JobAlertMatchStatus.suppressed : undefined,
        },
      });

      if (match.createdAt?.getTime?.() === match.updatedAt?.getTime?.()) created += 1;
      if (suppressionReason) {
        suppressed += 1;
        continue;
      }
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

  const daily = await sendDueJobAlertDigests(db, { cadence: JobAlertCadence.daily, now });
  const weekly = await sendDueJobAlertDigests(db, { cadence: JobAlertCadence.weekly, now });
  return { created, notified: notified + daily.notified + weekly.notified, suppressed };
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
          topJobs.map((match) => `${match.jobPost.title}${match.jobPost.companyProfile?.name ? ` / ${match.jobPost.companyProfile.name}` : ""}`).join("、"),
          first.fitReasons ? `主な一致理由: ${first.fitReasons}` : null,
          first.trustWarning ? `確認事項: ${first.trustWarning}` : null,
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

function savedFeedMatchesRecommendation(feed: SavedFeed, recommendation: ReturnType<typeof buildJobRecommendation<AlertJob>>) {
  const job = recommendation.job;
  if (feed.acceptingOnly && !recommendation.isOpen) return false;
  if (feed.remote && !isRemoteCompatibleWorkLocation(job)) return false;
  if (feed.query && !jobMatchesSearchQuery(feed.query, job)) return false;
  if (feed.directReadyOnly && recommendation.contractReadinessPercent < 100) return false;
  if (feed.fit === "skill" && !recommendation.isSkillMatched) return false;
  if (feed.fit === "ready" && !recommendation.isReadyToApply) return false;
  if (feed.workload === "light" && !/(週2|週3|副業|0\.4|0\.5|40%|50%)/i.test(job.workload ?? "")) return false;
  const rateThreshold = monthlyRateBandFromFilter(feed.rate);
  if (rateThreshold !== null && !isMonthlyRateAtLeastText(job.rate, rateThreshold)) return false;
  return recommendation.directScore >= 45 || recommendation.isSkillMatched || recommendation.isReadyToApply;
}

function alertFitReasons(recommendation: ReturnType<typeof buildJobRecommendation<AlertJob>>) {
  const reasons = recommendation.preferenceReasons
    .filter((reason) => reason.tone !== "warn")
    .map((reason) => reason.label)
    .slice(0, JOB_ALERT_REASON_LIMIT);
  if (reasons.length > 0) return reasons.join("、");
  if (recommendation.matched.length > 0) return `スキル一致: ${recommendation.matched.slice(0, JOB_ALERT_REASON_LIMIT).join("、")}`;
  return `マッチスコア ${recommendation.directScore}`;
}

function alertTrustWarning(recommendation: ReturnType<typeof buildJobRecommendation<AlertJob>>) {
  if (!recommendation.trustConfidence || recommendation.trustConfidence.tone === "good") return null;
  const warning = recommendation.trustConfidence.items.find((item) => item.status === "missing" || item.status === "stale" || item.status === "rejected");
  return warning ? `${warning.label}: ${warning.detail}` : recommendation.trustConfidence.label;
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
    `強い一致理由: ${fitReasons}`,
    trustWarning ? `確認事項: ${trustWarning}` : null,
  ].filter(Boolean).join("\n");
}

function digestWindowElapsed(matchedAt: Date, now: Date, cadence: typeof JobAlertCadence.daily | typeof JobAlertCadence.weekly) {
  const hours = (now.getTime() - new Date(matchedAt).getTime()) / (1000 * 60 * 60);
  return hours >= (cadence === JobAlertCadence.daily ? 24 : 24 * 7);
}
