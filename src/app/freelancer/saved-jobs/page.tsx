import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { removeSavedJob } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import { directContractChecklist, directMatchScore, formatDateTime, matchedSkills, skillMatchPercent } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, EmptyState, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SavedJobsPage() {
  const session = await auth();
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: session!.user.id },
    include: {
      documents: true,
      careerHistory: true,
      applications: { select: { jobPostId: true, status: true } },
      savedJobs: {
        include: { jobPost: { include: { companyProfile: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  const readiness = getFreelancerReadiness(profile);
  const appliedByJobId = new Map(profile?.applications.map((application) => [application.jobPostId, application.status]) ?? []);
  const savedJobs =
    profile?.savedJobs
      .map((savedJob) => {
        const job = savedJob.jobPost;
        const contractReadiness = directContractChecklist(job);
        const matchPercent = skillMatchPercent(job.requiredSkills, profile.skills);
        const matched = matchedSkills(job.requiredSkills, profile.skills);
        const score = directMatchScore({
          ...job,
          freelancerReadinessPercent: readiness.percent,
          freelancerSkills: profile.skills,
        });

        return {
          savedJob,
          contractReadiness,
          matchPercent,
          matched,
          score,
          appliedStatus: appliedByJobId.get(job.id),
        };
      })
      .sort((a, b) => b.score - a.score || b.savedJob.createdAt.getTime() - a.savedJob.createdAt.getTime()) ?? [];

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-6xl px-5 py-8">
        <PageHeader
          title="検討リスト"
          description="応募前に気になる案件を保存し、条件確認と応募準備をまとめて進めます。"
          action={<Link className="btn btn-secondary" href="/jobs?accepting=open&sort=direct">案件を探す</Link>}
        />
        {savedJobs.length > 0 && (
          <Card className="mt-6">
            <div className="grid gap-4 md:grid-cols-[1fr_220px] md:items-center">
              <div>
                <h2 className="font-semibold">応募前の優先確認</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  応募しやすさ、必須スキル、契約・支払い条件を見て、先に準備する案件を選べます。
                </p>
              </div>
              <div className="rounded border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-medium text-stone-500">応募準備</p>
                <p className="mt-1 text-3xl font-semibold">{readiness.percent}%</p>
                <p className="mt-1 text-sm text-stone-600">{readiness.completed}/{readiness.total}項目完了</p>
              </div>
            </div>
          </Card>
        )}
        <div className="mt-6 grid gap-4">
          {savedJobs.map(({ savedJob, contractReadiness, matchPercent, matched, score, appliedStatus }) => (
            <SavedJobRow
              appliedStatus={appliedStatus}
              contractPercent={contractReadiness.percent}
              job={savedJob.jobPost}
              key={savedJob.id}
              matched={matched}
              matchPercent={matchPercent}
              note={savedJob.note}
              savedAt={savedJob.createdAt}
              score={score}
            />
          ))}
          {savedJobs.length === 0 && (
            <EmptyState
              title="検討中の案件はまだありません。"
              description="公開案件から気になる案件を保存すると、応募前の条件確認と提案準備をここで続けられます。"
              action={<Link className="btn btn-primary" href="/jobs?accepting=open&sort=direct">公開案件を見る</Link>}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}

type SavedJobPost = Prisma.JobPostGetPayload<{ include: { companyProfile: true } }>;

function SavedJobRow({
  appliedStatus,
  contractPercent,
  job,
  matched,
  matchPercent,
  note,
  savedAt,
  score,
}: {
  appliedStatus?: string;
  contractPercent: number;
  job: SavedJobPost;
  matched: string[];
  matchPercent: number | null;
  note?: string | null;
  savedAt: Date;
  score: number;
}) {
  return (
    <Card>
      <div className="grid gap-4 lg:grid-cols-[1fr_220px] lg:items-start">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={appliedStatus ? "good" : job.applicationStatus === "open" ? "neutral" : "warn"}>
              {appliedStatus ? "応募済み" : job.applicationStatus === "open" ? "応募可" : "受付停止"}
            </StatusBadge>
            <StatusBadge tone={score >= 70 ? "good" : score >= 45 ? "neutral" : "warn"}>応募しやすさ {score}%</StatusBadge>
            <StatusBadge tone={contractPercent === 100 ? "good" : contractPercent >= 60 ? "neutral" : "warn"}>条件確認 {contractPercent}%</StatusBadge>
            <StatusBadge tone={matchPercent === null ? "neutral" : matchPercent >= 50 ? "good" : matchPercent > 0 ? "neutral" : "warn"}>
              必須一致 {matchPercent === null ? "要確認" : `${matchPercent}%`}
            </StatusBadge>
          </div>
          <h2 className="mt-3 text-xl font-semibold">{job.title}</h2>
          <p className="mt-1 text-sm text-stone-500">{job.companyProfile.name}</p>
          <p className="mt-2 text-xs text-stone-500">保存 {formatDateTime(savedAt)}</p>
          <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
            <SavedJobMeta label="単価" value={job.rate ?? "未設定"} />
            <SavedJobMeta label="稼働率" value={job.workload ?? "未設定"} />
            <SavedJobMeta label="契約期間" value={job.contractPeriod ?? "未設定"} />
            <SavedJobMeta label="勤務地" value={[job.location, job.remotePolicy].filter(Boolean).join(" / ") || "未設定"} />
          </div>
          {matched.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {matched.slice(0, 6).map((skill) => (
                <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800" key={skill}>
                  {skill}
                </span>
              ))}
            </div>
          )}
          {note && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">{note}</p>}
        </div>
        <div className="grid gap-2">
          <Link className="btn btn-primary" href={`/jobs/${job.id}`}>{appliedStatus ? "応募内容を見る" : "条件確認・応募準備"}</Link>
          {!appliedStatus && (
            <form action={removeSavedJob}>
              <input type="hidden" name="jobPostId" value={job.id} />
              <input type="hidden" name="returnTo" value="/freelancer/saved-jobs" />
              <button className="btn btn-secondary w-full" type="submit">検討リストから外す</button>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}

function SavedJobMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 truncate font-semibold">{value}</p>
    </div>
  );
}
