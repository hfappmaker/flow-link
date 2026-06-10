import Link from "next/link";
import { requireCompanyUser } from "@/lib/page-guards";
import { prisma } from "@/lib/prisma";
import { getJobPublishingReadiness } from "@/lib/readiness";
import { buildApplicationResponseState, jobStatusLabel } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, EmptyState, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CompanyJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ publish?: string; status?: string; action?: string; sort?: string }>;
}) {
  const filters = await searchParams;
  const selectedStatus = ["published", "draft", "private", "closed"].includes(filters.status ?? "") ? filters.status! : "";
  const selectedAction = ["pending", "overdue", "conditions", "paused", "interviews"].includes(filters.action ?? "") ? filters.action! : "";
  const selectedSort = filters.sort === "new" || filters.sort === "conditions" ? filters.sort : "attention";
  const { user, companyUser } = await requireCompanyUser({ include: { companyProfile: true } });
  const jobs = await prisma.jobPost.findMany({
    where: {
      companyProfileId: companyUser.companyProfileId,
      ...(selectedStatus ? { status: selectedStatus as "published" | "draft" | "private" | "closed" } : {}),
    },
    include: { applications: true },
    orderBy: { createdAt: "desc" },
  });
  const jobRows = jobs
    .map((job) => {
      const pendingApplications = job.applications.filter((application) => application.status === "applied");
      const passedApplications = job.applications.filter((application) => application.status === "screening_passed").length;
      const responseDueCount = pendingApplications.filter((application) => buildApplicationResponseState(application).priorityBoost >= 15).length;
      const conditionReadiness = getJobPublishingReadiness(job, companyUser.companyProfile);
      const missingConditionLabels = conditionReadiness.items.filter((item) => !item.done).map((item) => item.label);
      const attentionScore =
        responseDueCount * 30 +
        pendingApplications.length * 12 +
        passedApplications * 8 +
        (job.applicationStatus === "paused" ? 6 : 0) +
        (100 - conditionReadiness.percent);

      return {
        job,
        pendingApplications: pendingApplications.length,
        passedApplications,
        responseDueCount,
        conditionReadiness,
        missingConditionLabels,
        attentionScore,
      };
    })
    .filter((row) => {
      if (selectedAction === "pending") return row.pendingApplications > 0;
      if (selectedAction === "overdue") return row.responseDueCount > 0;
      if (selectedAction === "conditions") return !row.conditionReadiness.isReady;
      if (selectedAction === "paused") return row.job.applicationStatus === "paused";
      if (selectedAction === "interviews") return row.passedApplications > 0;
      return true;
    })
    .sort((a, b) => {
      if (selectedSort === "new") return b.job.createdAt.getTime() - a.job.createdAt.getTime();
      if (selectedSort === "conditions") {
        return a.conditionReadiness.percent - b.conditionReadiness.percent || b.attentionScore - a.attentionScore;
      }
      return b.attentionScore - a.attentionScore || b.job.createdAt.getTime() - a.job.createdAt.getTime();
    });
  const jobStats = jobs.reduce(
    (stats, job) => {
      const conditionReadiness = getJobPublishingReadiness(job, companyUser.companyProfile);
      const pendingApplications = job.applications.filter((application) => application.status === "applied");
      const responseDueCount = pendingApplications.filter((application) => buildApplicationResponseState(application).priorityBoost >= 15).length;
      stats.pending += pendingApplications.length;
      stats.overdue += responseDueCount;
      stats.conditions += conditionReadiness.isReady ? 0 : 1;
      stats.paused += job.applicationStatus === "paused" ? 1 : 0;
      stats.interviews += job.applications.filter((application) => application.status === "screening_passed").length;
      return stats;
    },
    { pending: 0, overdue: 0, conditions: 0, paused: 0, interviews: 0 },
  );

  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-6xl px-5 py-8">
        <PageHeader title="案件一覧" action={<Link className="btn btn-primary" href="/company/jobs/create">案件作成</Link>} />
        {filters.publish === "needs-conditions" && (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            公開前に必要な条件が不足していたため、案件を下書きとして保存し、応募受付を停止しました。
            案件編集で業務範囲、報酬・支払い、稼働条件、選考フロー、働き方を揃えてから公開してください。
          </div>
        )}
        {jobs.length > 0 && (
          <Card className="mt-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <form className="grid gap-3 md:grid-cols-[150px_180px_170px_auto_auto]" action="/company/jobs">
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  公開状態
                  <select
                    className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                    name="status"
                    defaultValue={selectedStatus}
                  >
                    <option value="">すべて</option>
                    <option value="published">公開中</option>
                    <option value="draft">下書き</option>
                    <option value="private">非公開</option>
                    <option value="closed">クローズ</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  確認すること
                  <select
                    className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                    name="action"
                    defaultValue={selectedAction}
                  >
                    <option value="">すべて</option>
                    <option value="overdue">対応期限の応募</option>
                    <option value="pending">未選考の応募</option>
                    <option value="conditions">条件不足の案件</option>
                    <option value="paused">受付停止中</option>
                    <option value="interviews">面談調整あり</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  並び順
                  <select
                    className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                    name="sort"
                    defaultValue={selectedSort}
                  >
                    <option value="attention">対応が必要な順</option>
                    <option value="conditions">条件不足が多い順</option>
                    <option value="new">新着順</option>
                  </select>
                </label>
                <button className="btn btn-primary self-end" type="submit">絞り込み</button>
                <Link className="btn btn-secondary self-end" href="/company/jobs">クリア</Link>
              </form>
              <div className="flex items-end text-sm text-stone-600">
                表示 {jobRows.length} / 全案件 {jobs.length} 件
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-5">
              <CompanyJobSignal label="対応期限" value={`${jobStats.overdue}件`} tone={jobStats.overdue > 0 ? "warn" : "neutral"} />
              <CompanyJobSignal label="未選考" value={`${jobStats.pending}件`} tone={jobStats.pending > 0 ? "warn" : "neutral"} />
              <CompanyJobSignal label="条件不足" value={`${jobStats.conditions}件`} tone={jobStats.conditions > 0 ? "warn" : "good"} />
              <CompanyJobSignal label="受付停止" value={`${jobStats.paused}件`} tone={jobStats.paused > 0 ? "neutral" : "good"} />
              <CompanyJobSignal label="面談調整" value={`${jobStats.interviews}件`} tone={jobStats.interviews > 0 ? "good" : "neutral"} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { label: "対応期限", value: "overdue", count: jobStats.overdue },
                { label: "未選考", value: "pending", count: jobStats.pending },
                { label: "条件不足", value: "conditions", count: jobStats.conditions },
                { label: "受付停止", value: "paused", count: jobStats.paused },
                { label: "面談調整", value: "interviews", count: jobStats.interviews },
              ].map((item) => (
                <Link
                  className={`rounded border px-3 py-2 text-sm font-semibold ${
                    selectedAction === item.value ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-600"
                  }`}
                  href={companyJobsHref({ status: selectedStatus, action: item.value, sort: selectedSort })}
                  key={item.value}
                >
                  {item.label} {item.count}
                </Link>
              ))}
            </div>
          </Card>
        )}
        <div className="mt-6 grid gap-4">
          {jobRows.map(({ job, pendingApplications, passedApplications, responseDueCount, conditionReadiness, missingConditionLabels }) => {
            return (
              <Card key={job.id}>
                <div className="grid gap-5 lg:grid-cols-[1fr_300px] lg:items-start">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={job.status === "published" ? "good" : job.status === "closed" ? "bad" : "neutral"}>{jobStatusLabel(job.status)}</StatusBadge>
                      <StatusBadge tone={job.applicationStatus === "open" ? "good" : "warn"}>{job.applicationStatus === "open" ? "受付中" : "受付停止"}</StatusBadge>
                      <StatusBadge tone={conditionReadiness.isReady ? "good" : conditionReadiness.percent >= 60 ? "neutral" : "warn"}>条件確認 {conditionReadiness.percent}%</StatusBadge>
                      {responseDueCount > 0 && <StatusBadge tone="warn">対応期限 {responseDueCount} 件</StatusBadge>}
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
                        ? responseDueCount > 0
                          ? "応募から時間が経っている候補者があります。応募時の提案と開始条件を確認し、今日中に面談判断または見送りを更新してください。"
                          : "応募時の提案、開始条件、必須スキルとの一致を見て、面談へ進めるか判断してください。"
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
          {jobs.length > 0 && jobRows.length === 0 && (
            <EmptyState
              title="この条件で表示できる案件はありません。"
              description="公開状態や確認することの条件を外して、案件全体を確認してください。"
              action={<Link className="btn btn-secondary" href="/company/jobs">条件をクリア</Link>}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}

function companyJobsHref({ status, action, sort }: { status: string; action: string; sort: string }) {
  return {
    pathname: "/company/jobs",
    query: {
      ...(status ? { status } : {}),
      ...(action ? { action } : {}),
      ...(sort !== "attention" ? { sort } : {}),
    },
  };
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
