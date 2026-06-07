import Link from "next/link";
import type { LinkProps } from "next/link";
import type { JobApplicationStatus, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applicationStatusLabel, formatDateTime } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, EmptyState, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const statusTabs: Array<{ label: string; value: JobApplicationStatus | "all" }> = [
  { label: "すべて", value: "all" },
  { label: "未選考", value: "applied" },
  { label: "OK", value: "screening_passed" },
  { label: "NG", value: "screening_rejected" },
];

export default async function JobApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { id } = await params;
  const filters = await searchParams;
  const selectedStatus = statusTabs.some((tab) => tab.value === filters.status) ? filters.status! : "all";
  const keyword = filters.q?.trim() ?? "";
  const session = await auth();
  const companyUser = await prisma.companyUser.findUnique({ where: { userId: session!.user.id } });
  const applicationWhere: Prisma.JobApplicationWhereInput = {
    ...(selectedStatus !== "all" ? { status: selectedStatus as JobApplicationStatus } : {}),
    ...(keyword
      ? {
          OR: [
            { freelancerProfile: { fullName: { contains: keyword, mode: "insensitive" } } },
            { freelancerProfile: { desiredOccupation: { contains: keyword, mode: "insensitive" } } },
            { freelancerProfile: { skills: { contains: keyword, mode: "insensitive" } } },
            { freelancerProfile: { preferredLocation: { contains: keyword, mode: "insensitive" } } },
            { proposalMessage: { contains: keyword, mode: "insensitive" } },
            { proposedStart: { contains: keyword, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const job = await prisma.jobPost.findFirst({
    where: { id, companyProfileId: companyUser!.companyProfileId },
    include: {
      applications: {
        where: applicationWhere,
        include: {
          freelancerProfile: {
            include: {
              careerHistory: true,
              documents: true,
            },
          },
        },
        orderBy: { appliedAt: "desc" },
      },
      _count: { select: { applications: true } },
    },
  });
  const counts = job
    ? await prisma.jobApplication.groupBy({
        by: ["status"],
        where: { jobPostId: job.id },
        _count: { status: true },
      })
    : [];
  const countByStatus = new Map(counts.map((item) => [item.status, item._count.status]));
  const total = job?._count.applications ?? 0;

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-6xl px-5 py-8">
        <PageHeader title="応募者一覧" description={job?.title} />
        {job && (
          <Card className="mt-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <form className="grid gap-3 md:grid-cols-[1fr_auto_auto]" action={`/company/jobs/${job.id}/applications`}>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  候補者検索
                  <input
                    className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
                    name="q"
                    defaultValue={keyword}
                    placeholder="氏名、職種、スキル、勤務地"
                  />
                </label>
                <input type="hidden" name="status" value={selectedStatus === "all" ? "" : selectedStatus} />
                <button className="btn btn-primary self-end" type="submit">検索</button>
                <Link className="btn btn-secondary self-end" href={`/company/jobs/${job.id}/applications`}>クリア</Link>
              </form>
              <div className="flex items-end text-sm text-stone-600">全応募 {total} 件</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {statusTabs.map((tab) => {
                const href = applicationsHref(job.id, tab.value, keyword);
                const count = tab.value === "all" ? total : countByStatus.get(tab.value) ?? 0;
                return (
                  <Link
                    className={`rounded border px-3 py-2 text-sm font-semibold ${
                      selectedStatus === tab.value ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-600"
                    }`}
                    href={href}
                    key={tab.value}
                  >
                    {tab.label} {count}
                  </Link>
                );
              })}
            </div>
          </Card>
        )}
        <div className="mt-6 grid gap-4">
          {job?.applications.map((application) => (
            <Card key={application.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <StatusBadge tone={application.status === "screening_passed" ? "good" : application.status === "screening_rejected" ? "bad" : "neutral"}>
                    {applicationStatusLabel(application.status)}
                  </StatusBadge>
                  <h2 className="mt-2 font-semibold">{application.freelancerProfile.fullName}</h2>
                  <p className="text-sm text-stone-500">{application.freelancerProfile.desiredOccupation ?? "希望職種未設定"}</p>
                  {application.proposalMessage && (
                    <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-stone-700">{application.proposalMessage}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge tone={application.freelancerProfile.documents.length >= 2 ? "good" : "warn"}>
                      PDF {application.freelancerProfile.documents.length}/2
                    </StatusBadge>
                    <StatusBadge tone={application.freelancerProfile.careerHistory ? "good" : "warn"}>
                      職務経歴{application.freelancerProfile.careerHistory ? "あり" : "未登録"}
                    </StatusBadge>
                    <StatusBadge tone={application.proposalMessage ? "good" : "warn"}>
                      直接提案{application.proposalMessage ? "あり" : "未登録"}
                    </StatusBadge>
                    <StatusBadge>応募 {formatDateTime(application.appliedAt)}</StatusBadge>
                  </div>
                </div>
                <Link className="btn btn-primary" href={`/company/applications/${application.id}`}>詳細</Link>
              </div>
            </Card>
          ))}
          {job?.applications.length === 0 && (
            <EmptyState
              title="条件に合う応募者はいません。"
              description="ステータスや検索キーワードを変えて確認してください。"
              action={<Link className="btn btn-secondary" href={`/company/jobs/${job.id}/applications`}>条件をクリア</Link>}
            />
          )}
          {!job && <EmptyState title="案件が見つかりません。" description="案件が削除されたか、閲覧権限がない可能性があります。" />}
        </div>
      </div>
    </Shell>
  );
}

function applicationsHref(jobId: string, status: JobApplicationStatus | "all", keyword: string): LinkProps["href"] {
  return {
    pathname: `/company/jobs/${jobId}/applications`,
    query: {
      ...(status !== "all" ? { status } : {}),
      ...(keyword ? { q: keyword } : {}),
    },
  };
}
