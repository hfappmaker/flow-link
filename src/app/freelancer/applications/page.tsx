import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applicationStatusLabel } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, EmptyState, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FreelancerApplicationsPage() {
  const session = await auth();
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: session!.user.id },
    include: { applications: { include: { jobPost: { include: { companyProfile: true } }, interviewThread: true }, orderBy: { appliedAt: "desc" } } },
  });
  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <PageHeader title="応募済み案件" />
        <div className="mt-6 grid gap-4">
          {profile?.applications.map((application) => (
            <Card key={application.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <StatusBadge tone={application.status === "screening_passed" ? "good" : application.status === "screening_rejected" ? "bad" : "neutral"}>
                    {applicationStatusLabel(application.status)}
                  </StatusBadge>
                  <h2 className="mt-2 font-semibold">{application.jobPost.title}</h2>
                  <p className="text-sm text-stone-500">{application.jobPost.companyProfile.name}</p>
                </div>
                {application.interviewThread && <Link className="btn btn-primary" href={`/interviews/${application.interviewThread.id}`}>面談チャット</Link>}
              </div>
            </Card>
          ))}
          {profile?.applications.length === 0 && (
            <EmptyState
              title="応募はまだありません。"
              description="気になる案件を見つけたら、詳細ページから応募できます。"
              action={<Link className="btn btn-primary" href="/jobs">案件を見る</Link>}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}
