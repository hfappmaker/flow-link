import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { removeSavedJob, saveCurrentJobSearch, saveJobForReview } from "@/lib/actions";
import { alertCadenceLabel } from "@/lib/job-alerts";
import { prisma } from "@/lib/prisma";
import { publicDbRead, publicDbReadResult } from "@/lib/public-db";
import { isHighMonthlyRateText } from "@/lib/rates";
import { getFreelancerReadiness } from "@/lib/readiness";
import { filterRemoteCompatibleJobs } from "@/lib/work-location";
import {
  buildDiscoveryIntentCounts,
  rankJobRecommendations,
  sortJobRecommendations,
  type DiscoveryIntentCounts,
  type JobRecommendation,
} from "@/lib/job-recommendations";
import {
  buildTrustConfidence,
  directContractReadyJobWhere,
  formatOpenings,
  matchedSkills,
  parseSkills,
  skillMatchPercent,
  skillPreview,
  unmatchedSkills,
  visiblePreferenceReasons,
  workPreferenceCompleteness,
  type TrustConfidenceStatus,
} from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, EmptyState, StatusBadge, SubmitButton, icons } from "@/components/ui";
import { RecommendationFeedbackForm } from "@/components/recommendation-feedback";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    remote?: string;
    accepting?: string;
    directReady?: string;
    fit?: string;
    sort?: string;
    candidate?: string;
    workload?: string;
    rate?: string;
  }>;
}) {
  const filters = await searchParams;
  const keyword = filters.q?.trim() ?? "";
  const remote = filters.remote === "remote";
  const accepting = filters.accepting === "open";
  const directReady = filters.directReady === "ready";
  const workload = filters.workload === "light" ? "light" : "";
  const rate = filters.rate === "high" ? "high" : "";
  const candidate = filters.candidate === "fresh" ? "fresh" : "";
  const activeSearchFilterLabels = [
    keyword && `キーワード: ${keyword}`,
    remote && "リモート可",
    accepting && "受付中のみ",
    directReady && "条件が揃った案件",
    workload === "light" && "週2-3日目安",
    rate === "high" && "80万円以上目安",
    candidate === "fresh" && "未対応の候補",
  ].filter(Boolean);
  const session = process.env.AUTH_SECRET ? await auth().catch(() => null) : null;
  const andFilters: Prisma.JobPostWhereInput[] = [];
  if (directReady) {
    andFilters.push(directContractReadyJobWhere());
  }
  if (keyword) {
    andFilters.push({
      OR: [
        { title: { contains: keyword, mode: "insensitive" } },
        { description: { contains: keyword, mode: "insensitive" } },
        { requiredSkills: { contains: keyword, mode: "insensitive" } },
        { preferredSkills: { contains: keyword, mode: "insensitive" } },
        { location: { contains: keyword, mode: "insensitive" } },
        { companyProfile: { name: { contains: keyword, mode: "insensitive" } } },
      ],
    });
  }
  if (workload === "light") {
    andFilters.push({
      OR: [
        { workload: { contains: "週2", mode: "insensitive" } },
        { workload: { contains: "週3", mode: "insensitive" } },
        { workload: { contains: "副業", mode: "insensitive" } },
        { workload: { contains: "0.4", mode: "insensitive" } },
        { workload: { contains: "0.5", mode: "insensitive" } },
        { workload: { contains: "40%", mode: "insensitive" } },
        { workload: { contains: "50%", mode: "insensitive" } },
      ],
    });
  }
  const where: Prisma.JobPostWhereInput = {
    status: "published",
    ...(accepting ? { applicationStatus: "open" } : {}),
    ...(andFilters.length > 0 ? { AND: andFilters } : {}),
  };
  const jobsResult = await publicDbReadResult(
    () =>
      prisma.jobPost.findMany({
        where,
        orderBy: { createdAt: "desc" },
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
      }),
    [],
  );
  const remoteFilteredJobs = remote ? filterRemoteCompatibleJobs(jobsResult.data) : jobsResult.data;
  const jobs = rate === "high" ? remoteFilteredJobs.filter((job) => isHighMonthlyRateText(job.rate)) : remoteFilteredJobs;
  const jobsUnavailable = jobsResult.status === "unavailable";
  const freelancerProfile =
    !jobsUnavailable && session?.user?.role === "freelancer"
      ? await publicDbRead(
          () =>
            prisma.freelancerProfile.findUnique({
              where: { userId: session.user.id },
              include: {
                documents: true,
                careerHistory: true,
                workPreference: true,
                savedJobSearches: { orderBy: { createdAt: "desc" }, take: 4 },
                recommendationFeedback: {
                  include: {
                    jobPost: {
                      select: {
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
                      },
                    },
                  },
                  orderBy: { updatedAt: "desc" },
                  take: 50,
                },
              },
            }),
          null,
        )
      : null;
  const readiness = getFreelancerReadiness(freelancerProfile);
  const preferenceCompleteness = workPreferenceCompleteness(freelancerProfile?.workPreference);
  const sort = filters.sort === "new" ? "new" : freelancerProfile ? "direct" : "new";
  const fit = freelancerProfile && (filters.fit === "skill" || filters.fit === "ready") ? filters.fit : "";
  const activeFilterLabels = [
    ...activeSearchFilterLabels,
    fit === "skill" && "スキル一致あり",
    fit === "ready" && "応募へ進みやすい",
  ].filter(Boolean);
  const hasActiveFilters = activeFilterLabels.length > 0;
  const showMarketplaceUnavailableState = jobsUnavailable;
  const showMarketplaceEmptyState = !showMarketplaceUnavailableState && jobs.length === 0 && !hasActiveFilters;
  const showDiscoveryControls = !showMarketplaceUnavailableState && !showMarketplaceEmptyState;
  const appliedJobIds =
    freelancerProfile && jobs.length > 0
      ? new Set(
          (
            await publicDbRead(
              () =>
                prisma.jobApplication.findMany({
                  where: {
                    freelancerProfileId: freelancerProfile.id,
                    jobPostId: { in: jobs.map((job) => job.id) },
                  },
                  select: { jobPostId: true },
                }),
              [],
            )
          ).map((application) => application.jobPostId),
        )
      : new Set<string>();
  const savedJobIds =
    freelancerProfile && jobs.length > 0
      ? new Set(
          (
            await publicDbRead(
              () =>
                prisma.savedJob.findMany({
                  where: {
                    freelancerProfileId: freelancerProfile.id,
                    jobPostId: { in: jobs.map((job) => job.id) },
                  },
                  select: { jobPostId: true },
                }),
              [],
            )
          ).map((savedJob) => savedJob.jobPostId),
        )
      : new Set<string>();
  const feedbackByJobId = new Map((freelancerProfile?.recommendationFeedback ?? []).map((feedback) => [feedback.jobPostId, feedback]));
  const currentJobsPath = jobsPath({
    q: keyword,
    remote,
    accepting,
    directReady,
    fit,
    sort,
    candidate,
    workload,
    rate,
  });
  const allRecommendedJobs = rankJobRecommendations(jobs, {
    appliedJobIds,
    freelancerReadinessPercent: freelancerProfile ? readiness.percent : null,
    freelancerSkills: freelancerProfile?.skills,
    recommendationFeedback: freelancerProfile?.recommendationFeedback,
    savedJobIds,
    workPreference: freelancerProfile?.workPreference,
  }, {
    sort,
  });
  const rankedJobs = rankJobRecommendations(jobs, {
    appliedJobIds,
    freelancerReadinessPercent: freelancerProfile ? readiness.percent : null,
    freelancerSkills: freelancerProfile?.skills,
    recommendationFeedback: freelancerProfile?.recommendationFeedback,
    savedJobIds,
    workPreference: freelancerProfile?.workPreference,
  }, {
    candidate,
    fit,
    sort,
  });
  const resultSummary =
    jobs.length === 0 && !hasActiveFilters
      ? "公開案件はまだありません。"
      : `${rankedJobs.length}件の案件を表示中${activeFilterLabels.length > 0 ? ` / ${activeFilterLabels.join(" / ")}` : ""} / ${
          sort === "direct" ? "応募しやすい順" : "新着順"
        }`;
  const priorityJobs = sortJobRecommendations(rankedJobs, "direct").slice(0, 3);
  const freshCandidateCount = freelancerProfile
    ? allRecommendedJobs.filter((recommendation) => recommendation.isFreshCandidate).length
    : 0;
  const discoveryIntentCounts = freelancerProfile
    ? buildDiscoveryIntentCounts({ jobs: allRecommendedJobs, readinessComplete: readiness.isReady })
    : null;

  return (
    <Shell>
      <TopNav activeSection="jobs" sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-7xl px-5 py-8">
        <PageHeader title="公開案件" description="応募前に条件を確認しやすい案件を探せます。" />
        {showMarketplaceUnavailableState && (
          <div className="mt-6">
            <EmptyState
              title="公開案件を読み込めません。"
              description="マーケットプレイスのデータに一時的に接続できません。公開案件の有無は現在確認できないため、時間をおいて再読み込みしてください。"
              action={
                <Link className="btn btn-primary" href={currentJobsPath}>
                  再読み込み {icons.arrow}
                </Link>
              }
            />
          </div>
        )}
        {showMarketplaceEmptyState && (
          <div className="mt-6">
            <EmptyState
              title="公開案件はまだありません。"
              description="企業が案件を公開すると、このページで条件や応募受付状況を確認できます。新しい案件を見逃さないよう、プロフィールを用意してお待ちください。"
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  {session?.user?.role === "company_user" ? (
                    <Link className="btn btn-primary" href="/company/jobs/create">
                      最初の案件を作成 {icons.arrow}
                    </Link>
                  ) : session?.user?.role === "freelancer" ? (
                    <Link className="btn btn-primary" href="/freelancer">
                      応募準備を確認 {icons.arrow}
                    </Link>
                  ) : (
                    <Link className="btn btn-primary" href="/register">
                      プロフィールを作る {icons.arrow}
                    </Link>
                  )}
                  {!session && <Link className="btn btn-secondary" href="/login">ログイン</Link>}
                </div>
              }
            />
          </div>
        )}
        {showDiscoveryControls && (
          <Card className="mt-6">
            <form
              className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"
              action="/jobs"
            >
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                キーワード
                <input
                  className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                  name="q"
                  defaultValue={keyword}
                  placeholder="職種、スキル、会社名、勤務地"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                勤務形態
                <select
                  className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                  name="remote"
                  defaultValue={remote ? "remote" : ""}
                >
                  <option value="">すべて</option>
                  <option value="remote">リモート可</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                応募受付
                <select
                  className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                  name="accepting"
                  defaultValue={accepting ? "open" : ""}
                >
                  <option value="">すべて</option>
                  <option value="open">受付中のみ</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                条件確認
                <select
                  className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                  name="directReady"
                  defaultValue={directReady ? "ready" : ""}
                >
                  <option value="">すべて</option>
                  <option value="ready">条件が揃った案件</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                稼働量
                <select
                  className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                  name="workload"
                  defaultValue={workload}
                >
                  <option value="">すべて</option>
                  <option value="light">週2-3日目安</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                単価
                <select
                  className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                  name="rate"
                  defaultValue={rate}
                >
                  <option value="">すべて</option>
                  <option value="high">月80万円以上目安</option>
                </select>
                <span className="text-xs font-normal text-stone-500">時給・日給は月額換算せず除外</span>
              </label>
              {freelancerProfile && (
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  対応状況
                  <select
                    className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                    name="candidate"
                    defaultValue={candidate}
                  >
                    <option value="">すべて</option>
                    <option value="fresh">未対応の候補</option>
                  </select>
                </label>
              )}
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                並び順
                <select
                  className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                  name="sort"
                  defaultValue={sort}
                >
                  <option value="direct">応募しやすい順</option>
                  <option value="new">新着順</option>
                </select>
              </label>
              {fit && <input type="hidden" name="fit" value={fit} />}
              <div className="grid gap-3 md:col-span-2 md:grid-cols-2 lg:col-span-4 lg:flex lg:justify-end">
                <SubmitButton className="btn btn-primary w-full lg:w-32" pendingLabel="検索中">検索</SubmitButton>
                <Link className="btn btn-secondary w-full lg:w-32" href="/jobs">クリア</Link>
              </div>
            </form>
            <p className="mt-3 text-sm text-stone-500">
              {resultSummary}
            </p>
            {rankedJobs.length > 0 && (
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <DiscoverySignal
                  label="条件フィルター"
                  value={directReady || fit === "ready" || workload || rate ? "有効" : "任意"}
                  tone={directReady || fit === "ready" || workload || rate ? "good" : "neutral"}
                />
                <DiscoverySignal
                  label="高スコア案件"
                  value={`${rankedJobs.filter(({ directScore }) => directScore >= 70).length}件`}
                  tone={rankedJobs.some(({ directScore }) => directScore >= 70) ? "good" : "neutral"}
                />
                <DiscoverySignal
                  label={freelancerProfile ? "未対応の候補" : "条件確認100%"}
                  value={
                    freelancerProfile
                      ? `${freshCandidateCount}件`
                      : `${rankedJobs.filter(({ contractReadinessPercent }) => contractReadinessPercent === 100).length}件`
                  }
                  tone={
                    freelancerProfile
                      ? freshCandidateCount > 0 ? "good" : "warn"
                      : rankedJobs.some(({ contractReadinessPercent }) => contractReadinessPercent === 100) ? "good" : "warn"
                  }
                />
              </div>
            )}
          </Card>
        )}
        {showDiscoveryControls && freelancerProfile && jobs.length > 0 && (
          <SavedSearchPanel
            currentJobsPath={currentJobsPath}
            filters={{ accepting, candidate, directReady, fit, keyword, rate, remote, sort: sort ?? "direct", workload }}
            savedSearches={freelancerProfile.savedJobSearches}
          />
        )}
        {showDiscoveryControls && freelancerProfile && (!preferenceCompleteness.usable || preferenceCompleteness.stale) && (
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            希望条件が{preferenceCompleteness.stale ? "古い、または未確認です" : "まだ少ない状態です"}。検索結果は表示しますが、単価・稼働量・働き方の一致理由は低信頼として扱います。
            <Link className="ml-2 font-semibold text-amber-950 underline" href="/freelancer/preferences">希望条件を更新</Link>
          </div>
        )}
        {showDiscoveryControls && freelancerProfile && jobs.length > 0 && (
          <ProfileDiscoveryShortcuts
            activeFit={fit}
            activeRate={rate}
            activeCandidate={candidate}
            activeWorkload={workload}
            keyword={keyword}
            remote={remote}
            desiredOccupation={freelancerProfile.desiredOccupation}
            skills={parseSkills(freelancerProfile.skills).slice(0, 6)}
          />
        )}
        {showDiscoveryControls && freelancerProfile && discoveryIntentCounts && jobs.length > 0 && (
          <DiscoveryIntentPanel
            counts={discoveryIntentCounts}
            keyword={keyword}
            remote={remote}
            readinessComplete={readiness.isReady}
          />
        )}
        {priorityJobs.length > 0 && (
          <DirectPriorityStrip
            freelancerProfile={freelancerProfile}
            jobs={priorityJobs}
            readinessPercent={readiness.percent}
          />
        )}
        <div className="mt-6 grid gap-4">
          {rankedJobs.map(({ job, directScore, contractReadinessPercent, preferenceReasons, trustConfidence }) => (
            <JobCard
              applied={appliedJobIds.has(job.id)}
              contractReadinessPercent={contractReadinessPercent}
              directScore={directScore}
              freelancerProfile={freelancerProfile}
              job={job}
              key={job.id}
              preferenceReasons={preferenceReasons}
              readiness={readiness}
              recommendationFeedbackReason={feedbackByJobId.get(job.id)?.reason}
              saved={savedJobIds.has(job.id)}
              trustConfidence={trustConfidence ?? buildTrustConfidence({ company: job.companyProfile, job })}
              returnTo={currentJobsPath}
            />
          ))}
          {jobs.length === 0 && hasActiveFilters && (
            <EmptyState
              title="条件に合う公開案件はありません。"
              description="キーワードを短くするか、勤務形態・条件確認の指定を外して再検索してください。"
              action={<Link className="btn btn-secondary" href="/jobs">条件をクリア</Link>}
            />
          )}
          {jobs.length > 0 && rankedJobs.length === 0 && (
            <EmptyState
              title="この条件で表示できる案件はありません。"
              description="スキル一致や応募準備の条件を外すと、候補を広げて確認できます。"
              action={<Link className="btn btn-secondary" href="/jobs">条件をクリア</Link>}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}

type JobWithCompany = Prisma.JobPostGetPayload<{
  include: { companyProfile: { include: { verificationRequests: true } } };
}>;
type FreelancerForMatch = Prisma.FreelancerProfileGetPayload<{ include: { documents: true; careerHistory: true } }>;
type RankedJob = JobRecommendation<JobWithCompany>;

function SavedSearchPanel({
  currentJobsPath,
  filters,
  savedSearches,
}: {
  currentJobsPath: string;
  filters: {
    accepting: boolean;
    candidate: string;
    directReady: boolean;
    fit: string;
    keyword: string;
    rate: string;
    remote: boolean;
    sort: string;
    workload: string;
  };
  savedSearches: Array<{
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
  }>;
}) {
  const defaultName =
    filters.keyword ||
    [
      filters.remote && "リモート",
      filters.accepting && "受付中",
      filters.directReady && "条件確認済み",
      filters.workload === "light" && "週2-3日",
      filters.rate === "high" && "高単価",
    ].filter(Boolean).join(" ") ||
    "希望条件フィード";

  return (
    <section className="mt-5 rounded-md border border-stone-200 bg-white p-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        <div>
          <h2 className="font-semibold">この検索を仕事フィードに保存</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            キーワード、受付状況、リモート、条件確認などの検索条件を保存し、同じ条件で新しい候補を確認できます。
          </p>
          {savedSearches.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {savedSearches.map((search) => (
                <Link className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 hover:border-emerald-300" href={savedSearchHref(search)} key={search.id}>
                  {search.name}
                </Link>
              ))}
            </div>
          )}
        </div>
        <form action={saveCurrentJobSearch} className="grid gap-3">
          <input type="hidden" name="returnTo" value={currentJobsPath} />
          <input type="hidden" name="q" value={filters.keyword} />
          <input type="hidden" name="remote" value={filters.remote ? "remote" : ""} />
          <input type="hidden" name="accepting" value={filters.accepting ? "open" : ""} />
          <input type="hidden" name="directReady" value={filters.directReady ? "ready" : ""} />
          <input type="hidden" name="fit" value={filters.fit} />
          <input type="hidden" name="workload" value={filters.workload} />
          <input type="hidden" name="rate" value={filters.rate} />
          <input type="hidden" name="sort" value={filters.sort} />
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            フィード名
            <input
              className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
              name="name"
              defaultValue={defaultName}
              maxLength={80}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            アラート頻度
            <select
              className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
              name="notificationCadence"
              defaultValue="immediate"
            >
              <option value="immediate">{alertCadenceLabel("immediate")}</option>
              <option value="daily">{alertCadenceLabel("daily")}</option>
              <option value="weekly">{alertCadenceLabel("weekly")}</option>
              <option value="paused">{alertCadenceLabel("paused")}</option>
            </select>
          </label>
          <SubmitButton className="btn btn-primary" pendingLabel="保存中">仕事フィードに保存</SubmitButton>
        </form>
      </div>
    </section>
  );
}

function DiscoveryIntentPanel({
  counts,
  keyword,
  readinessComplete,
  remote,
}: {
  counts: DiscoveryIntentCounts;
  keyword: string;
  readinessComplete: boolean;
  remote: boolean;
}) {
  const intents = [
    readinessComplete
      ? {
          title: "応募へ進みやすい案件を確認",
          description: "応募受付中で、条件と登録内容の確認材料が揃った候補を先に見ます。",
          count: counts.readyToApply,
          href: jobsHref({ q: keyword, remote, accepting: true, fit: "ready", sort: "direct", candidate: "fresh" }),
          label: "候補を見る",
          tone: "good" as const,
        }
      : {
          title: "応募準備を終わらせる",
          description: "応募前に不足しているプロフィール、職務経歴、PDF書類を先に整えます。",
          count: counts.preparation,
          href: "/freelancer",
          label: "応募準備へ",
          tone: "warn" as const,
        },
    {
      title: "登録スキルに近い案件を探す",
      description: "必須スキルとの一致がある未対応の候補に絞ります。",
      count: counts.skillMatched,
      href: jobsHref({ q: keyword, remote, accepting: true, fit: "skill", sort: "direct", candidate: "fresh" }),
      label: "スキル一致を見る",
      tone: counts.skillMatched > 0 ? "good" as const : "neutral" as const,
    },
    {
      title: "条件確認しやすい案件を選ぶ",
      description: "単価、稼働量、選考フロー、契約・支払い条件が揃った案件を確認します。",
      count: counts.conditionReady,
      href: jobsHref({ q: keyword, remote, accepting: true, directReady: true, sort: "direct" }),
      label: "条件が揃った案件",
      tone: counts.conditionReady > 0 ? "good" as const : "neutral" as const,
    },
    {
      title: "未対応の候補を整理",
      description: "保存・応募していない候補だけを見て、検討リストへ入れるか判断します。",
      count: counts.fresh,
      href: jobsHref({ q: keyword, remote, accepting: true, sort: "direct", candidate: "fresh" }),
      label: "未対応を見る",
      tone: counts.fresh > 0 ? "neutral" as const : "warn" as const,
    },
  ];

  return (
    <section className="mt-5 rounded-md border border-stone-200 bg-white p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-semibold">案件探しの進め方</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
            今の応募準備と検索条件に合わせて、次に見るべき候補を選べます。
          </p>
        </div>
        <Link className="btn btn-secondary" href="/freelancer/saved-jobs">検討リストを見る</Link>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        {intents.map((intent) => (
          <Link
            className={`rounded-md border p-4 transition hover:border-emerald-400 ${
              intent.tone === "good"
                ? "border-emerald-200 bg-emerald-50/70"
                : intent.tone === "warn"
                  ? "border-amber-200 bg-amber-50/70"
                  : "border-stone-200 bg-stone-50"
            }`}
            href={intent.href}
            key={intent.title}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold leading-6 text-stone-950">{intent.title}</h3>
              <span className="shrink-0 rounded border border-white bg-white px-2 py-1 text-xs font-semibold text-stone-800">
                {intent.count}件
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">{intent.description}</p>
            <span className="mt-3 inline-flex text-sm font-semibold text-emerald-700">
              {intent.label} {icons.arrow}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ProfileDiscoveryShortcuts({
  activeFit,
  activeRate,
  activeCandidate,
  activeWorkload,
  desiredOccupation,
  keyword,
  remote,
  skills,
}: {
  activeFit?: string;
  activeRate?: string;
  activeCandidate?: string;
  activeWorkload?: string;
  desiredOccupation?: string | null;
  keyword: string;
  remote: boolean;
  skills: string[];
}) {
  const shortcuts = [
    {
      label: "スキル一致を優先",
      href: jobsHref({ q: keyword, remote, accepting: true, fit: "skill", sort: "direct", candidate: activeCandidate }),
      active: activeFit === "skill",
    },
    {
      label: "応募へ進みやすい案件",
      href: jobsHref({ q: keyword, remote, accepting: true, fit: "ready", sort: "direct", candidate: activeCandidate }),
      active: activeFit === "ready",
    },
    {
      label: "未対応の候補",
      href: jobsHref({ q: keyword, remote, accepting: true, sort: "direct", candidate: "fresh", workload: activeWorkload, rate: activeRate }),
      active: activeCandidate === "fresh",
    },
    {
      label: "週2-3日目安",
      href: jobsHref({ q: keyword, remote, accepting: true, workload: "light", sort: "direct", candidate: activeCandidate }),
      active: activeWorkload === "light",
    },
    {
      label: "月80万円以上目安",
      href: jobsHref({ q: keyword, remote, accepting: true, rate: "high", sort: "direct", candidate: activeCandidate }),
      active: activeRate === "high",
    },
    {
      label: "リモート受付中",
      href: jobsHref({ q: keyword, remote: true, accepting: true, sort: "direct", candidate: activeCandidate, workload: activeWorkload, rate: activeRate }),
      active: remote && !activeFit && !activeCandidate && !activeWorkload && !activeRate,
    },
    ...(desiredOccupation
      ? [
          {
            label: "希望職種で探す",
            href: jobsHref({ q: desiredOccupation, remote, accepting: true, sort: "direct", candidate: activeCandidate, workload: activeWorkload, rate: activeRate }),
            active: keyword === desiredOccupation,
          },
        ]
      : []),
  ];

  return (
    <section className="mt-5 rounded-md border border-stone-200 bg-white p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-semibold">登録内容から探す</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
            プロフィールのスキル、希望職種、稼働条件を使って、応募前に確認しやすい案件へ絞り込めます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {shortcuts.map((shortcut) => (
            <Link
              className={`rounded border px-3 py-2 text-sm font-semibold ${
                shortcut.active ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-stone-50 text-stone-700"
              }`}
              href={shortcut.href}
              key={shortcut.label}
            >
              {shortcut.label}
            </Link>
          ))}
        </div>
      </div>
      {skills.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-stone-500">登録スキルで検索</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {skills.map((skill) => (
              <Link
                className="rounded border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-medium text-stone-700 hover:border-emerald-300 hover:text-emerald-800"
                href={jobsHref({ q: skill, remote, accepting: true, fit: "skill", sort: "direct", candidate: activeCandidate, workload: activeWorkload, rate: activeRate })}
                key={skill}
              >
                {skill}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function DirectPriorityStrip({
  freelancerProfile,
  jobs,
  readinessPercent,
}: {
  freelancerProfile: FreelancerForMatch | null;
  jobs: RankedJob[];
  readinessPercent: number;
}) {
  return (
    <section className="mt-5 rounded-md border border-emerald-200 bg-emerald-50/70 p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-stone-950">応募しやすい候補</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
            条件公開、応募受付、プロフィール準備を合わせて、次の会話へ進みやすい案件を先に表示します。
          </p>
        </div>
        {freelancerProfile && (
          <StatusBadge tone={readinessPercent === 100 ? "good" : "warn"}>応募準備 {readinessPercent}%</StatusBadge>
        )}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {jobs.map(({ job, directScore, contractReadinessPercent }) => {
          const matchPercent = freelancerProfile ? skillMatchPercent(job.requiredSkills, freelancerProfile.skills) : null;
          const reasons = buildPriorityReasons({
            contractReadinessPercent,
            isOpen: job.applicationStatus === "open",
            matchPercent,
            hasTerms: Boolean(job.selectionFlow || job.contractTerms),
          });

          return (
            <Link
              className="rounded-md border border-emerald-200 bg-white p-4 shadow-sm transition hover:border-emerald-400"
              href={`/jobs/${job.id}`}
              key={job.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="line-clamp-2 text-sm font-semibold text-stone-950">{job.title}</p>
                  <p className="mt-1 text-xs text-stone-500">{job.companyProfile.name}</p>
                </div>
                <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                  {directScore}%
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {reasons.map((reason) => (
                  <span className="rounded border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-medium text-stone-700" key={reason}>
                    {reason}
                  </span>
                ))}
              </div>
              <div className="mt-3 grid gap-2 text-xs text-stone-700 sm:grid-cols-2">
                <ScoreMeta label="条件確認" value={`${contractReadinessPercent}%`} />
                <ScoreMeta label="必須一致" value={matchPercent === null ? "未設定" : `${matchPercent}%`} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function buildPriorityReasons({
  contractReadinessPercent,
  hasTerms,
  isOpen,
  matchPercent,
}: {
  contractReadinessPercent: number;
  hasTerms: boolean;
  isOpen: boolean;
  matchPercent: number | null;
}) {
  const reasons = [];
  if (isOpen) reasons.push("受付中");
  if (contractReadinessPercent === 100) reasons.push("条件確認100%");
  else if (contractReadinessPercent >= 60) reasons.push("条件整理済み");
  if (hasTerms) reasons.push("選考・契約条件あり");
  if (matchPercent === null) reasons.push("必須スキル未設定");
  else if (matchPercent >= 60) reasons.push("スキル高一致");
  else if (matchPercent > 0) reasons.push("一致スキルあり");
  return reasons.slice(0, 4);
}

function DiscoverySignal({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "good" | "warn";
}) {
  const toneClasses = {
    neutral: "border-stone-200 bg-stone-50 text-stone-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
  };

  return (
    <div className={`rounded border px-3 py-2 ${toneClasses[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function JobCard({
  applied,
  contractReadinessPercent,
  directScore,
  freelancerProfile,
  job,
  preferenceReasons,
  readiness,
  recommendationFeedbackReason,
  returnTo,
  saved,
  trustConfidence,
}: {
  applied: boolean;
  contractReadinessPercent: number;
  directScore: number;
  freelancerProfile: FreelancerForMatch | null;
  job: JobWithCompany;
  preferenceReasons: ReturnType<typeof visiblePreferenceReasons>;
  readiness: ReturnType<typeof getFreelancerReadiness>;
  recommendationFeedbackReason?: string | null;
  returnTo: string;
  saved: boolean;
  trustConfidence: ReturnType<typeof buildTrustConfidence>;
}) {
  const requiredSkills = skillPreview(job.requiredSkills);
  const requiredSkillCount = parseSkills(job.requiredSkills).length;
  const requiredSkillMatches = freelancerProfile ? matchedSkills(job.requiredSkills, freelancerProfile.skills) : [];
  const matchPercent = freelancerProfile ? skillMatchPercent(job.requiredSkills, freelancerProfile.skills) : null;
  const requiredSkillGaps = freelancerProfile ? unmatchedSkills(job.requiredSkills, freelancerProfile.skills) : parseSkills(job.requiredSkills);
  const nextStep = freelancerProfile
    ? buildJobCardNextStep({
        applied,
        applicationOpen: job.applicationStatus === "open",
        contractReadinessPercent,
        jobId: job.id,
        matchPercent,
        missingReadinessItem: readiness.items.find(hasMissingReadinessHref),
        requiredSkillGaps,
        trustStatus: trustConfidence.paymentStatus === "confirmed" ? trustConfidence.companyStatus : trustConfidence.paymentStatus,
      })
    : null;

  return (
    <Card>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={job.applicationStatus === "open" ? "good" : "warn"}>
              {job.applicationStatus === "open" ? "受付中" : "受付停止"}
            </StatusBadge>
            <StatusBadge>{job.remotePolicy ?? "勤務形態未設定"}</StatusBadge>
            {(job.selectionFlow || job.contractTerms) && <StatusBadge tone="good">条件あり</StatusBadge>}
            <StatusBadge tone={directScore >= 70 ? "good" : directScore >= 45 ? "neutral" : "warn"}>
              応募しやすさ {directScore}%
            </StatusBadge>
            <StatusBadge tone={trustConfidence.tone}>{trustConfidence.label}</StatusBadge>
          </div>
          <h2 className="mt-3 text-xl font-semibold">{job.title}</h2>
          <p className="mt-1 text-sm text-stone-500">{job.companyProfile.name}</p>
          <div className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-2 lg:grid-cols-5">
            <JobMeta label="単価" value={job.rate} />
            <JobMeta label="稼働率" value={job.workload} />
            <JobMeta label="契約期間" value={job.contractPeriod} />
            <JobMeta label="勤務地" value={job.location} />
            <JobMeta label="募集人数" value={formatOpenings(job.openings)} />
          </div>
          {requiredSkills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {requiredSkills.map((skill, index) => (
                <span className="rounded border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-medium text-stone-700" key={`${skill}-${index}`}>
                  {skill}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-600">{job.description}</p>
          {freelancerProfile && (
            <div className="mt-4 rounded border border-emerald-100 bg-emerald-50/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={applied ? "good" : job.applicationStatus === "open" ? "neutral" : "warn"}>
                  {applied ? "応募済み" : job.applicationStatus === "open" ? "応募可" : "受付停止"}
                </StatusBadge>
                <StatusBadge tone={readiness.isReady ? "good" : "warn"}>
                  応募準備 {readiness.percent}%
                </StatusBadge>
                {matchPercent !== null && (
                  <StatusBadge tone={matchPercent >= 50 ? "good" : matchPercent > 0 ? "neutral" : "warn"}>
                    必須一致 {matchPercent}%
                  </StatusBadge>
                )}
              </div>
              <div className="mt-3 grid gap-2 text-xs text-stone-700 sm:grid-cols-3">
                <ScoreMeta label="スキル一致" value={matchPercent === null ? "未設定" : `${matchPercent}%`} />
                <ScoreMeta label="条件確認" value={`${contractReadinessPercent}%`} />
                <ScoreMeta label="信頼確認" value={`${trustConfidence.score}%`} />
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {preferenceReasons.map((reason) => (
                  <PreferenceReason reason={reason} key={`${job.id}-${reason.label}`} />
                ))}
                <TrustReason
                  status={trustConfidence.paymentStatus}
                  title="支払い確認"
                />
                <TrustReason
                  status={trustConfidence.companyStatus}
                  title="会社確認"
                />
              </div>
              <p className="mt-2 text-sm leading-6 text-stone-700">
                {requiredSkillCount === 0
                  ? "必須スキル未設定のため、詳細画面で条件を確認して企業へ提案できます。"
                  : requiredSkillMatches.length > 0
                    ? `一致: ${requiredSkillMatches.slice(0, 4).join("、")}`
                    : "プロフィールのスキルと必須スキルの一致はまだ見つかっていません。"}
              </p>
              {nextStep && (
                <div className="mt-3 rounded border border-white bg-white/80 p-3">
                  <p className="text-xs font-medium text-stone-500">応募前の次のアクション</p>
                  <p className="mt-1 text-sm font-semibold text-stone-900">{nextStep.title}</p>
                  <p className="mt-1 text-sm leading-6 text-stone-600">{nextStep.description}</p>
                  <Link className="mt-3 inline-flex text-sm font-semibold text-emerald-700" href={nextStep.href}>
                    {nextStep.label} {icons.arrow}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="grid shrink-0 gap-2 sm:grid-cols-2 md:grid-cols-1">
          {freelancerProfile && !applied && (
            <>
              <form action={saved ? removeSavedJob : saveJobForReview}>
                <input type="hidden" name="jobPostId" value={job.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <SubmitButton className="btn btn-secondary w-full" pendingLabel="更新中">
                  {saved ? "検討リストから外す" : "検討リストに保存"}
                </SubmitButton>
              </form>
              <RecommendationFeedbackForm
                currentReason={recommendationFeedbackReason}
                jobPostId={job.id}
                returnTo={returnTo}
                source="jobs"
                sourceContext={returnTo}
                visibleReasons={preferenceReasons}
              />
            </>
          )}
          <Link className="btn btn-secondary" href={`/jobs/${job.id}`}>
            詳細 {icons.arrow}
          </Link>
        </div>
      </div>
    </Card>
  );
}

function PreferenceReason({ reason }: { reason: ReturnType<typeof visiblePreferenceReasons>[number] }) {
  const toneClasses = {
    neutral: "border-stone-200 bg-white/80 text-stone-700",
    good: "border-emerald-200 bg-white/80 text-emerald-900",
    warn: "border-amber-200 bg-white/80 text-amber-900",
  };

  return (
    <div className={`rounded border px-3 py-2 ${toneClasses[reason.tone]}`}>
      <p className="text-xs font-semibold">{reason.label}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{reason.detail}</p>
    </div>
  );
}

function TrustReason({ status, title }: { status: TrustConfidenceStatus; title: string }) {
  const detail: Record<TrustConfidenceStatus, string> = {
    confirmed: "Flow Link確認済み",
    pending: "確認リクエスト中。面談で最新条件を確認",
    selfReported: "企業の自己申告。根拠を確認",
    missing: "未記載。応募前に確認",
    stale: "期限切れ。更新確認が必要",
    rejected: "再提出が必要。追加説明を確認",
  };
  const toneClasses = {
    confirmed: "border-emerald-200 bg-white/80 text-emerald-900",
    pending: "border-stone-200 bg-white/80 text-stone-700",
    selfReported: "border-stone-200 bg-white/80 text-stone-700",
    missing: "border-amber-200 bg-white/80 text-amber-900",
    stale: "border-amber-200 bg-white/80 text-amber-900",
    rejected: "border-red-200 bg-white/80 text-red-900",
  };

  return (
    <div className={`rounded border px-3 py-2 ${toneClasses[status]}`}>
      <p className="text-xs font-semibold">{title}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{detail[status]}</p>
    </div>
  );
}

function hasMissingReadinessHref(
  item: ReturnType<typeof getFreelancerReadiness>["items"][number],
): item is ReturnType<typeof getFreelancerReadiness>["items"][number] & { href: string } {
  return !item.done && Boolean(item.href);
}

function buildJobCardNextStep({
  applied,
  applicationOpen,
  contractReadinessPercent,
  jobId,
  matchPercent,
  missingReadinessItem,
  requiredSkillGaps,
  trustStatus,
}: {
  applied: boolean;
  applicationOpen: boolean;
  contractReadinessPercent: number;
  jobId: string;
  matchPercent: number | null;
  missingReadinessItem?: { label: string; href: string };
  requiredSkillGaps: string[];
  trustStatus: TrustConfidenceStatus;
}) {
  if (applied) {
    return {
      title: "応募後の状況を確認",
      description: "応募内容、条件確認、面談調整の状態を応募一覧で確認できます。",
      href: "/freelancer/applications",
      label: "応募済み案件を見る",
    };
  }

  if (!applicationOpen) {
    return {
      title: "受付再開を待つ",
      description: "現在は応募受付が停止しています。条件だけ確認して、他の受付中案件も見てください。",
      href: `/jobs/${jobId}`,
      label: "案件条件を見る",
    };
  }

  if (missingReadinessItem) {
    return {
      title: `${missingReadinessItem.label}を整える`,
      description: "応募前に不足している情報を埋めると、企業が面談判断をしやすくなります。",
      href: missingReadinessItem.href,
      label: "応募準備を進める",
    };
  }

  if (matchPercent === 0 && requiredSkillGaps.length > 0) {
    return {
      title: "スキルの伝え方を確認",
      description: `${requiredSkillGaps.slice(0, 3).join("、")}に近い経験があれば、プロフィールと提案文で補足してください。`,
      href: "/freelancer/profile",
      label: "プロフィールを見直す",
    };
  }

  if (["missing", "stale", "rejected", "selfReported", "pending"].includes(trustStatus)) {
    return {
      title: "会社・支払い条件を確認",
      description: "応募は可能です。検討リストに保存し、契約主体、締め日、支払い時期、外部支払い依頼の有無を提案文や面談で確認してください。",
      href: `/jobs/${jobId}`,
      label: "信頼状態を見る",
    };
  }

  if (contractReadinessPercent < 100) {
    return {
      title: "条件確認をしてから応募",
      description: "単価、稼働率、選考フロー、契約・支払い条件の未設定項目を詳細で確認してください。",
      href: `/jobs/${jobId}`,
      label: "条件を確認する",
    };
  }

  return {
    title: "提案文を作成",
    description: "一致スキル、近い実績、開始可能時期、面談で確認したい条件を整理して応募できます。",
    href: `/jobs/${jobId}`,
    label: "応募へ進む",
  };
}

function ScoreMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-emerald-200 bg-white/70 px-2 py-1.5">
      <p className="text-stone-500">{label}</p>
      <p className="mt-0.5 font-semibold text-stone-800">{value}</p>
    </div>
  );
}

function JobMeta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 truncate font-semibold">{value || "未設定"}</p>
    </div>
  );
}

function jobsHref({
  q,
  remote,
  accepting,
  directReady,
  fit,
  sort,
  candidate,
  workload,
  rate,
}: {
  q?: string;
  remote?: boolean;
  accepting?: boolean;
  directReady?: boolean;
  fit?: string;
  sort?: string;
  candidate?: string;
  workload?: string;
  rate?: string;
}) {
  return {
    pathname: "/jobs",
    query: {
      ...(q ? { q } : {}),
      ...(remote ? { remote: "remote" } : {}),
      ...(accepting ? { accepting: "open" } : {}),
      ...(directReady ? { directReady: "ready" } : {}),
      ...(fit ? { fit } : {}),
      ...(sort ? { sort } : {}),
      ...(candidate ? { candidate } : {}),
      ...(workload ? { workload } : {}),
      ...(rate ? { rate } : {}),
    },
  };
}

function savedSearchHref(search: {
  query?: string | null;
  remote: boolean;
  acceptingOnly: boolean;
  directReadyOnly: boolean;
  fit?: string | null;
  workload?: string | null;
  rate?: string | null;
  sort: string;
}) {
  return jobsHref({
    q: search.query ?? "",
    remote: search.remote,
    accepting: search.acceptingOnly,
    directReady: search.directReadyOnly,
    fit: search.fit ?? "",
    workload: search.workload ?? "",
    rate: search.rate ?? "",
    sort: search.sort,
  });
}

function jobsPath(input: Parameters<typeof jobsHref>[0]) {
  const href = jobsHref(input);
  const params = new URLSearchParams();
  Object.entries(href.query).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `${href.pathname}?${query}` : href.pathname;
}
