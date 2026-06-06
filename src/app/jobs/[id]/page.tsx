import Link from "next/link";
import { auth } from "@/lib/auth";
import { applyToJob } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import { Shell, TopNav, PageHeader, Card, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = process.env.AUTH_SECRET ? await auth().catch(() => null) : null;
  const job = process.env.DATABASE_URL
    ? await prisma.jobPost.findFirst({
        where: { id, status: "published" },
        include: { companyProfile: true },
      })
    : null;
  const freelancerProfile =
    session?.user?.role === "freelancer"
      ? await prisma.freelancerProfile.findUnique({
          where: { userId: session.user.id },
          include: { documents: true, careerHistory: true },
        })
      : null;
  const readiness = getFreelancerReadiness(freelancerProfile);

  if (!job) {
    return (
      <Shell>
        <TopNav sessionRole={session?.user?.role} />
        <div className="mx-auto max-w-4xl px-5 py-8"><Card>案件が見つかりません。</Card></div>
      </Shell>
    );
  }

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <PageHeader title={job.title} description={job.companyProfile.name} />
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_280px]">
          <Card>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={job.applicationStatus === "open" ? "good" : "warn"}>
                {job.applicationStatus === "open" ? "受付中" : "受付停止"}
              </StatusBadge>
              <StatusBadge>{job.remotePolicy ?? "リモート未設定"}</StatusBadge>
            </div>
            <h2 className="mt-6 text-lg font-semibold">業務内容</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-700">{job.description}</p>
            <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
              <Info label="必須スキル" value={job.requiredSkills} />
              <Info label="歓迎スキル" value={job.preferredSkills} />
              <Info label="単価" value={job.rate} />
              <Info label="稼働率" value={job.workload} />
              <Info label="契約期間" value={job.contractPeriod} />
              <Info label="勤務地" value={job.location} />
            </dl>
          </Card>
          <Card>
            {session?.user?.role === "freelancer" && job.applicationStatus === "open" && readiness.isReady ? (
              <form action={applyToJob} className="grid gap-3">
                <input type="hidden" name="jobPostId" value={job.id} />
                <button className="btn btn-primary" type="submit">この案件に応募</button>
              </form>
            ) : session?.user?.role === "freelancer" && job.applicationStatus === "open" ? (
              <div>
                <p className="font-semibold">応募準備が未完了です</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  応募前にプロフィール、職務経歴、PDF書類を揃えてください。
                </p>
                <div className="mt-4 grid gap-2">
                  {readiness.items
                    .filter((item) => !item.done)
                    .map((item) => (
                      <Link className="btn btn-secondary justify-start" href={item.href} key={item.key}>
                        {item.label}を登録
                      </Link>
                    ))}
                </div>
              </div>
            ) : session ? (
              <p className="text-sm text-stone-600">応募にはフリーランスアカウントが必要です。</p>
            ) : (
              <Link className="btn btn-primary w-full" href={`/login?callbackUrl=/jobs/${job.id}`}>ログインして応募</Link>
            )}
          </Card>
        </div>
      </div>
    </Shell>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className="mt-1 font-medium">{value || "未設定"}</dd>
    </div>
  );
}
