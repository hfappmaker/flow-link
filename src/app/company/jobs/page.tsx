import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jobStatusLabel } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CompanyJobsPage() {
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
        <PageHeader title="案件一覧" action={<Link className="btn btn-primary" href="/company/jobs/new">案件作成</Link>} />
        <div className="mt-6 grid gap-4">
          {jobs.map((job) => (
            <Card key={job.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex gap-2">
                    <StatusBadge tone={job.status === "published" ? "good" : job.status === "closed" ? "bad" : "neutral"}>{jobStatusLabel(job.status)}</StatusBadge>
                    <StatusBadge tone={job.applicationStatus === "open" ? "good" : "warn"}>{job.applicationStatus === "open" ? "受付中" : "受付停止"}</StatusBadge>
                  </div>
                  <h2 className="mt-2 font-semibold">{job.title}</h2>
                  <p className="text-sm text-stone-500">応募 {job.applications.length} 件</p>
                </div>
                <div className="flex gap-2">
                  <Link className="btn btn-secondary" href={`/company/jobs/${job.id}`}>編集</Link>
                  <Link className="btn btn-primary" href={`/company/jobs/${job.id}/applications`}>応募者</Link>
                </div>
              </div>
            </Card>
          ))}
          {jobs.length === 0 && <Card>案件はまだありません。</Card>}
        </div>
      </div>
    </Shell>
  );
}
