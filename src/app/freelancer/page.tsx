import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { logoutUser } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import { directContractChecklist, directMatchScore, formatDateTime, matchedSkills, skillMatchPercent } from "@/lib/utils";
import { Shell, TopNav, PageHeader, StatCard, Card, EmptyState, StatusBadge, icons } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FreelancerDashboard() {
  const session = await auth();
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: session!.user.id },
    include: {
      applications: true,
      documents: true,
      careerHistory: true,
      savedJobs: {
        include: { jobPost: { include: { companyProfile: true } } },
        orderBy: { createdAt: "desc" },
        take: 3,
      },
      _count: { select: { savedJobs: true } },
    },
  });
  const unread = await prisma.notification.count({ where: { userId: session!.user.id, readAt: null } });
  const readiness = getFreelancerReadiness(profile);
  const appliedJobIds = new Set(profile?.applications.map((application) => application.jobPostId) ?? []);
  const recommendationCandidates = profile
    ? await prisma.jobPost.findMany({
        where: {
          status: "published",
          applicationStatus: "open",
          id: { notIn: Array.from(appliedJobIds) },
        },
        include: { companyProfile: true },
        orderBy: { createdAt: "desc" },
        take: 24,
      })
    : [];
  const recommendedJobs = recommendationCandidates
    .map((job) => {
      const contractReadiness = directContractChecklist(job);
      const matchPercent = skillMatchPercent(job.requiredSkills, profile?.skills);
      const matched = matchedSkills(job.requiredSkills, profile?.skills);
      const score = directMatchScore({
        ...job,
        freelancerReadinessPercent: readiness.percent,
        freelancerSkills: profile?.skills,
      });

      return { job, contractReadiness, matchPercent, matched, score };
    })
    .sort((a, b) => b.score - a.score || b.contractReadiness.percent - a.contractReadiness.percent || b.job.createdAt.getTime() - a.job.createdAt.getTime())
    .slice(0, 3);

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-7xl px-5 py-8">
        <PageHeader
          title="フリーランス ダッシュボード"
          description="プロフィール、書類、応募状況、選考結果を管理します。"
          action={<form action={logoutUser}><button className="btn btn-secondary">ログアウト</button></form>}
        />
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <StatCard label="応募数" value={profile?.applications.length ?? 0} icon={icons.jobs} />
          <StatCard label="登録書類" value={profile?.documents.length ?? 0} icon={icons.files} />
          <StatCard label="未読通知" value={unread} icon={icons.ok} />
          <StatCard label="検討リスト" value={profile?._count.savedJobs ?? 0} icon={icons.ok} />
        </div>
        <Card className="mt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">応募準備チェック</h2>
              <p className="mt-1 text-sm text-stone-600">
                企業が書類選考で確認する情報を揃えると、応募前の不備を減らせます。
              </p>
            </div>
            <div className="text-left md:text-right">
              <p className="text-3xl font-semibold">{readiness.percent}%</p>
              <p className="text-sm text-stone-500">{readiness.completed}/{readiness.total} 完了</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-3">
            {readiness.items.map((item) => (
              <Link
                className={`rounded border px-3 py-2 text-sm font-semibold ${
                  item.done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
                href={item.href}
                key={item.key}
              >
                {item.done ? "完了" : "未完了"}: {item.label}
              </Link>
            ))}
          </div>
        </Card>
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">登録内容に近い受付中案件</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                スキル、応募準備、案件側の条件公開を合わせて、次に確認しやすい案件を表示します。
              </p>
            </div>
            <Link className="btn btn-secondary" href="/jobs?accepting=open&sort=direct">案件をもっと見る</Link>
          </div>
          {recommendedJobs.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {recommendedJobs.map(({ job, contractReadiness, matchPercent, matched, score }) => (
                <RecommendedJobCard
                  contractPercent={contractReadiness.percent}
                  job={job}
                  key={job.id}
                  matched={matched}
                  matchPercent={matchPercent}
                  readinessComplete={readiness.isReady}
                  score={score}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="表示できる受付中案件はありません。"
              description="新しい案件が公開されたら、プロフィールのスキルや希望条件に近いものをここに表示します。"
              action={<Link className="btn btn-primary" href="/jobs">公開案件を見る</Link>}
            />
          )}
        </section>
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">検討リスト</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                応募前に条件確認や提案文の準備をしたい案件を見返せます。
              </p>
            </div>
            <Link className="btn btn-secondary" href="/freelancer/saved-jobs">検討リストを見る</Link>
          </div>
          {profile && profile.savedJobs.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {profile.savedJobs.map((savedJob) => (
                <SavedJobCard
                  job={savedJob.jobPost}
                  key={savedJob.id}
                  savedAt={savedJob.createdAt}
                  savedNote={savedJob.note}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="検討中の案件はまだありません。"
              description="気になる案件を保存すると、応募前の条件確認と提案準備をここから進められます。"
              action={<Link className="btn btn-primary" href="/jobs?accepting=open&sort=direct">案件を探す</Link>}
            />
          )}
        </section>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ActionCard href="/freelancer/profile" title="プロフィール編集" body="希望職種、スキル、稼働条件を更新します。" />
          <ActionCard href="/freelancer/career" title="職務経歴フォーム" body="検索や選考時に確認される職務経歴を整えます。" />
          <ActionCard href="/freelancer/documents" title="PDF書類" body="履歴書PDFと職務経歴書PDFをアップロードします。" />
          <ActionCard href="/freelancer/applications" title="応募済み案件" body="応募履歴と選考状況を確認します。" />
          <ActionCard href="/freelancer/saved-jobs" title="検討リスト" body="応募前に確認したい案件を見返します。" />
          <ActionCard href="/freelancer/notifications" title="通知" body="書類選考OK/NGの通知を確認します。" />
        </div>
      </div>
    </Shell>
  );
}

type SavedDashboardJob = Prisma.JobPostGetPayload<{ include: { companyProfile: true } }>;

function SavedJobCard({
  job,
  savedAt,
  savedNote,
}: {
  job: SavedDashboardJob;
  savedAt: Date;
  savedNote?: string | null;
}) {
  const contractReadiness = directContractChecklist(job);

  return (
    <Card>
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={job.applicationStatus === "open" ? "good" : "warn"}>
          {job.applicationStatus === "open" ? "受付中" : "受付停止"}
        </StatusBadge>
        <StatusBadge tone={contractReadiness.isReady ? "good" : contractReadiness.percent >= 60 ? "neutral" : "warn"}>
          条件確認 {contractReadiness.percent}%
        </StatusBadge>
      </div>
      <h3 className="mt-3 line-clamp-2 font-semibold">{job.title}</h3>
      <p className="mt-1 text-sm text-stone-500">{job.companyProfile.name}</p>
      <p className="mt-3 text-xs text-stone-500">保存 {formatDateTime(savedAt)}</p>
      {savedNote && <p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-600">{savedNote}</p>}
      <Link className="btn btn-primary mt-4 w-full" href={`/jobs/${job.id}`}>条件確認・応募準備</Link>
    </Card>
  );
}

type RecommendedJob = Prisma.JobPostGetPayload<{ include: { companyProfile: true } }>;

function RecommendedJobCard({
  contractPercent,
  job,
  matched,
  matchPercent,
  readinessComplete,
  score,
}: {
  contractPercent: number;
  job: RecommendedJob;
  matched: string[];
  matchPercent: number | null;
  readinessComplete: boolean;
  score: number;
}) {
  const nextAction = !readinessComplete
    ? "応募準備を整えてから条件確認"
    : contractPercent < 100
      ? "条件確認をしてから応募"
      : "提案文を作って応募";

  return (
    <Card>
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={score >= 70 ? "good" : score >= 45 ? "neutral" : "warn"}>応募しやすさ {score}%</StatusBadge>
        <StatusBadge tone={matchPercent === null ? "neutral" : matchPercent >= 50 ? "good" : matchPercent > 0 ? "neutral" : "warn"}>
          必須一致 {matchPercent === null ? "要確認" : `${matchPercent}%`}
        </StatusBadge>
      </div>
      <h3 className="mt-3 line-clamp-2 font-semibold">{job.title}</h3>
      <p className="mt-1 text-sm text-stone-500">{job.companyProfile.name}</p>
      <div className="mt-4 grid gap-2 text-sm">
        <RecommendationSignal label="単価" value={job.rate ?? "未設定"} />
        <RecommendationSignal label="稼働率" value={job.workload ?? "未設定"} />
        <RecommendationSignal label="条件確認" value={`${contractPercent}%`} />
      </div>
      {matched.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {matched.slice(0, 4).map((skill) => (
            <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800" key={skill}>
              {skill}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-sm leading-6 text-stone-600">{nextAction}</p>
      <Link className="btn btn-primary mt-4 w-full" href={`/jobs/${job.id}`}>案件条件を見る</Link>
    </Card>
  );
}

function RecommendationSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-stone-200 bg-stone-50 px-3 py-2">
      <span className="text-xs text-stone-500">{label}</span>
      <span className="truncate text-right text-xs font-semibold text-stone-800">{value}</span>
    </div>
  );
}

function ActionCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Card>
      <Link href={href} className="block">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">{body}</p>
      </Link>
    </Card>
  );
}
