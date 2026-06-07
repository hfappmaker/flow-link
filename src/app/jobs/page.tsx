import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import { directContractChecklist, directMatchScore, formatOpenings, matchedSkills, parseSkills, skillMatchPercent, skillPreview } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, EmptyState, StatusBadge, icons } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; remote?: string; accepting?: string; directReady?: string; sort?: string }>;
}) {
  const filters = await searchParams;
  const keyword = filters.q?.trim() ?? "";
  const remote = filters.remote === "remote";
  const accepting = filters.accepting === "open";
  const directReady = filters.directReady === "ready";
  const session = process.env.AUTH_SECRET ? await auth().catch(() => null) : null;
  const andFilters: Prisma.JobPostWhereInput[] = [];
  if (directReady) {
    andFilters.push({
      requiredSkills: { not: null },
      rate: { not: null },
      workload: { not: null },
      contractPeriod: { not: null },
      selectionFlow: { not: null },
      contractTerms: { not: null },
      OR: [{ location: { not: null } }, { remotePolicy: { not: null } }],
    });
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
  const where: Prisma.JobPostWhereInput = {
    status: "published",
    ...(accepting ? { applicationStatus: "open" } : {}),
    ...(remote
      ? {
          remotePolicy: {
            contains: "リモート",
            mode: "insensitive",
          },
        }
      : {}),
    ...(andFilters.length > 0 ? { AND: andFilters } : {}),
  };
  const jobs = process.env.DATABASE_URL
    ? await prisma.jobPost.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { companyProfile: true },
      })
    : [];
  const freelancerProfile =
    process.env.DATABASE_URL && session?.user?.role === "freelancer"
      ? await prisma.freelancerProfile.findUnique({
          where: { userId: session.user.id },
          include: { documents: true, careerHistory: true },
        })
      : null;
  const readiness = getFreelancerReadiness(freelancerProfile);
  const sort = filters.sort === "new" ? "new" : freelancerProfile ? "direct" : "new";
  const rankedJobs = jobs
    .map((job) => ({
      job,
      directScore: directMatchScore({
        ...job,
        applicationStatus: job.applicationStatus,
        freelancerReadinessPercent: freelancerProfile ? readiness.percent : null,
        freelancerSkills: freelancerProfile?.skills,
      }),
      contractReadinessPercent: directContractChecklist(job).percent,
    }))
    .sort((a, b) => {
      if (sort === "direct") {
        return b.directScore - a.directScore || b.job.createdAt.getTime() - a.job.createdAt.getTime();
      }
      return b.job.createdAt.getTime() - a.job.createdAt.getTime();
    });
  const appliedJobIds =
    freelancerProfile && jobs.length > 0
      ? new Set(
          (
            await prisma.jobApplication.findMany({
              where: {
                freelancerProfileId: freelancerProfile.id,
                jobPostId: { in: jobs.map((job) => job.id) },
              },
              select: { jobPostId: true },
            })
          ).map((application) => application.jobPostId),
        )
      : new Set<string>();

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-7xl px-5 py-8">
        <PageHeader title="公開案件" description="仲介なしで進めやすい条件が揃った案件を探し、企業へ直接応募できます。" />
        <Card className="mt-6">
          <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_150px_150px_170px_180px_auto_auto]" action="/jobs">
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
              直接進行
              <select
                className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                name="directReady"
                defaultValue={directReady ? "ready" : ""}
              >
                <option value="">すべて</option>
                <option value="ready">直接条件が揃った案件</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-stone-700">
              並び順
              <select
                className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                name="sort"
                defaultValue={sort}
              >
                <option value="direct">直接マッチ優先</option>
                <option value="new">新着順</option>
              </select>
            </label>
            <button className="btn btn-primary self-end" type="submit">検索</button>
            <Link className="btn btn-secondary self-end" href="/jobs">クリア</Link>
          </form>
          <p className="mt-3 text-sm text-stone-500">
            {jobs.length}件の案件を表示中{keyword && ` / キーワード: ${keyword}`}{remote && " / リモート可"}{accepting && " / 受付中のみ"}{directReady && " / 直接条件が揃った案件"} / {sort === "direct" ? "直接マッチ優先" : "新着順"}
          </p>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <DiscoverySignal
              label="直接条件フィルター"
              value={directReady ? "有効" : "任意"}
              tone={directReady ? "good" : "neutral"}
            />
            <DiscoverySignal
              label="高スコア案件"
              value={`${rankedJobs.filter(({ directScore }) => directScore >= 70).length}件`}
              tone={rankedJobs.some(({ directScore }) => directScore >= 70) ? "good" : "neutral"}
            />
            <DiscoverySignal
              label="直接契約準備100%"
              value={`${rankedJobs.filter(({ contractReadinessPercent }) => contractReadinessPercent === 100).length}件`}
              tone={rankedJobs.some(({ contractReadinessPercent }) => contractReadinessPercent === 100) ? "good" : "warn"}
            />
          </div>
        </Card>
        <div className="mt-6 grid gap-4">
          {rankedJobs.map(({ job, directScore, contractReadinessPercent }) => (
            <JobCard
              applied={appliedJobIds.has(job.id)}
              contractReadinessPercent={contractReadinessPercent}
              directScore={directScore}
              freelancerProfile={freelancerProfile}
              job={job}
              key={job.id}
              readinessPercent={readiness.percent}
            />
          ))}
          {jobs.length === 0 && (
            <EmptyState
              title="条件に合う公開案件はありません。"
              description="キーワードを短くするか、勤務形態・直接進行の条件を外して再検索してください。"
              action={<Link className="btn btn-secondary" href="/jobs">条件をクリア</Link>}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}

type JobWithCompany = Prisma.JobPostGetPayload<{ include: { companyProfile: true } }>;
type FreelancerForMatch = Prisma.FreelancerProfileGetPayload<{ include: { documents: true; careerHistory: true } }>;

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
  readinessPercent,
}: {
  applied: boolean;
  contractReadinessPercent: number;
  directScore: number;
  freelancerProfile: FreelancerForMatch | null;
  job: JobWithCompany;
  readinessPercent: number;
}) {
  const requiredSkills = skillPreview(job.requiredSkills);
  const requiredSkillCount = parseSkills(job.requiredSkills).length;
  const requiredSkillMatches = freelancerProfile ? matchedSkills(job.requiredSkills, freelancerProfile.skills) : [];
  const matchPercent = freelancerProfile ? skillMatchPercent(job.requiredSkills, freelancerProfile.skills) : null;

  return (
    <Card>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={job.applicationStatus === "open" ? "good" : "warn"}>
              {job.applicationStatus === "open" ? "受付中" : "受付停止"}
            </StatusBadge>
            <StatusBadge>{job.remotePolicy ?? "勤務形態未設定"}</StatusBadge>
            {(job.selectionFlow || job.contractTerms) && <StatusBadge tone="good">直接条件あり</StatusBadge>}
            <StatusBadge tone={directScore >= 70 ? "good" : directScore >= 45 ? "neutral" : "warn"}>
              直接マッチ {directScore}%
            </StatusBadge>
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
                  {applied ? "応募済み" : job.applicationStatus === "open" ? "直接応募可" : "受付停止"}
                </StatusBadge>
                <StatusBadge tone={readinessPercent === 100 ? "good" : "warn"}>
                  応募準備 {readinessPercent}%
                </StatusBadge>
                {matchPercent !== null && (
                  <StatusBadge tone={matchPercent >= 50 ? "good" : matchPercent > 0 ? "neutral" : "warn"}>
                    必須一致 {matchPercent}%
                  </StatusBadge>
                )}
              </div>
              <div className="mt-3 grid gap-2 text-xs text-stone-700 sm:grid-cols-3">
                <ScoreMeta label="スキル一致" value={matchPercent === null ? "未設定" : `${matchPercent}%`} />
                <ScoreMeta label="直接条件" value={`${contractReadinessPercent}%`} />
                <ScoreMeta label="応募準備" value={`${readinessPercent}%`} />
              </div>
              <p className="mt-2 text-sm leading-6 text-stone-700">
                {requiredSkillCount === 0
                  ? "必須スキル未設定のため、詳細画面で条件を確認して企業へ直接提案できます。"
                  : requiredSkillMatches.length > 0
                    ? `一致: ${requiredSkillMatches.slice(0, 4).join("、")}`
                    : "プロフィールのスキルと必須スキルの一致はまだ見つかっていません。"}
              </p>
            </div>
          )}
        </div>
        <Link className="btn btn-secondary shrink-0" href={`/jobs/${job.id}`}>
          詳細 {icons.arrow}
        </Link>
      </div>
    </Card>
  );
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
