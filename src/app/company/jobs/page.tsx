import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { directContractChecklist, jobStatusLabel } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, EmptyState, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CompanyJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ publish?: string }>;
}) {
  const notice = await searchParams;
  const session = await auth();
  const companyUser = await prisma.companyUser.findUnique({ where: { userId: session!.user.id } });
  const jobs = await prisma.jobPost.findMany({
    where: { companyProfileId: companyUser!.companyProfileId },
    include: { applications: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-6xl px-5 py-8">
        <PageHeader title="案件一覧" action={<Link className="btn btn-primary" href="/company/jobs/create">案件作成</Link>} />
        {notice.publish === "needs-conditions" && (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            公開前に必要な条件が不足していたため、案件を下書きとして保存し、応募受付を停止しました。
            案件編集で業務範囲、報酬・支払い、稼働条件、選考フロー、働き方を揃えてから公開してください。
          </div>
        )}
        <div className="mt-6 grid gap-4">
          {jobs.map((job) => {
            const pendingApplications = job.applications.filter((application) => application.status === "applied").length;
            const passedApplications = job.applications.filter((application) => application.status === "screening_passed").length;
            const conditionReadiness = directContractChecklist(job);
            const missingConditionLabels = conditionReadiness.items.filter((item) => !item.done).map((item) => item.label);

            return (
              <Card key={job.id}>
                <div className="grid gap-5 lg:grid-cols-[1fr_300px] lg:items-start">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={job.status === "published" ? "good" : job.status === "closed" ? "bad" : "neutral"}>{jobStatusLabel(job.status)}</StatusBadge>
                      <StatusBadge tone={job.applicationStatus === "open" ? "good" : "warn"}>{job.applicationStatus === "open" ? "受付中" : "受付停止"}</StatusBadge>
                      <StatusBadge tone={conditionReadiness.isReady ? "good" : conditionReadiness.percent >= 60 ? "neutral" : "warn"}>条件確認 {conditionReadiness.percent}%</StatusBadge>
                      {pendingApplications > 0 && <StatusBadge tone="warn">未選考 {pendingApplications} 件</StatusBadge>}
                      {passedApplications > 0 && <StatusBadge tone="good">面談調整 {passedApplications} 件</StatusBadge>}
                    </div>
                    <h2 className="mt-2 font-semibold">{job.title}</h2>
                    <p className="text-sm text-stone-500">応募 {job.applications.length} 件 / 未選考 {pendingApplications} 件</p>
                    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                      <CompanyJobSignal
                        label="条件確認"
                        value={`${conditionReadiness.completed}/${conditionReadiness.total}`}
                        tone={conditionReadiness.isReady ? "good" : conditionReadiness.percent >= 60 ? "neutral" : "warn"}
                      />
                      <CompanyJobSignal
                        label="未選考"
                        value={`${pendingApplications}件`}
                        tone={pendingApplications > 0 ? "warn" : "neutral"}
                      />
                      <CompanyJobSignal
                        label="面談調整"
                        value={`${passedApplications}件`}
                        tone={passedApplications > 0 ? "good" : "neutral"}
                      />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-stone-600">
                      {conditionReadiness.isReady
                        ? "応募者は業務内容、報酬、稼働条件、選考フロー、働き方を応募前に確認できます。"
                        : `応募前に確認しづらい項目: ${missingConditionLabels.slice(0, 3).join("、")}`}
                    </p>
                  </div>
                  <div className="rounded border border-stone-200 bg-stone-50 p-4">
                    <p className="text-xs font-medium text-stone-500">次のアクション</p>
                    <p className="mt-2 text-sm font-semibold text-stone-900">
                      {pendingApplications > 0
                        ? "未選考の応募者を確認"
                        : conditionReadiness.isReady
                          ? "応募者一覧を確認"
                          : "案件条件を整える"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      {pendingApplications > 0
                        ? "応募時の提案、開始条件、必須スキルとの一致を見て、面談へ進めるか判断してください。"
                        : conditionReadiness.isReady
                          ? "応募が届いたら、判断しやすい順に候補者を確認できます。"
                          : "不足している条件を埋めると、応募者が応募前に判断しやすくなります。"}
                    </p>
                    <div className="mt-4 grid gap-2">
                      {pendingApplications > 0 ? (
                        <Link className="btn btn-primary" href={`/company/jobs/${job.id}/applications?status=applied`}>未選考を確認</Link>
                      ) : (
                        <Link className="btn btn-primary" href={conditionReadiness.isReady ? `/company/jobs/${job.id}/applications` : `/company/jobs/${job.id}`}>
                          {conditionReadiness.isReady ? "応募者を見る" : "案件を編集"}
                        </Link>
                      )}
                      <Link className="btn btn-secondary" href={`/company/jobs/${job.id}/applications`}>応募者一覧</Link>
                      <Link className="btn btn-secondary" href={`/company/jobs/${job.id}`}>案件編集</Link>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {jobs.length === 0 && (
            <EmptyState
              title="案件はまだありません。"
              description="最初の案件を作成すると、公開状態や応募状況をここで確認できます。"
              action={<Link className="btn btn-primary" href="/company/jobs/create">案件作成</Link>}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}

function CompanyJobSignal({
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
