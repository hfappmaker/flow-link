import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Shell, TopNav, PageHeader, Card, StatusBadge, icons } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; remote?: string }>;
}) {
  const filters = await searchParams;
  const keyword = filters.q?.trim() ?? "";
  const remote = filters.remote === "remote";
  const session = process.env.AUTH_SECRET ? await auth().catch(() => null) : null;
  const where: Prisma.JobPostWhereInput = {
    status: "published",
    ...(remote
      ? {
          remotePolicy: {
            contains: "リモート",
            mode: "insensitive",
          },
        }
      : {}),
    ...(keyword
      ? {
          OR: [
            { title: { contains: keyword, mode: "insensitive" } },
            { description: { contains: keyword, mode: "insensitive" } },
            { requiredSkills: { contains: keyword, mode: "insensitive" } },
            { preferredSkills: { contains: keyword, mode: "insensitive" } },
            { location: { contains: keyword, mode: "insensitive" } },
            { companyProfile: { name: { contains: keyword, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const jobs = process.env.DATABASE_URL
    ? await prisma.jobPost
        .findMany({
          where,
          orderBy: { createdAt: "desc" },
          include: { companyProfile: true },
        })
        .catch(() => [])
    : [];

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-7xl px-5 py-8">
        <PageHeader title="公開案件" description="公開中のフリーランス案件を確認できます。応募にはログインが必要です。" />
        <Card className="mt-6">
          <form className="grid gap-3 md:grid-cols-[1fr_180px_auto_auto]" action="/jobs">
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
            <button className="btn btn-primary self-end" type="submit">検索</button>
            <Link className="btn btn-secondary self-end" href="/jobs">クリア</Link>
          </form>
          <p className="mt-3 text-sm text-stone-500">
            {jobs.length}件の案件を表示中{keyword && ` / キーワード: ${keyword}`}{remote && " / リモート可"}
          </p>
        </Card>
        <div className="mt-6 grid gap-4">
          {jobs.map((job) => (
            <Card key={job.id}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={job.applicationStatus === "open" ? "good" : "warn"}>
                      {job.applicationStatus === "open" ? "受付中" : "受付停止"}
                    </StatusBadge>
                    <StatusBadge>{job.remotePolicy ?? "勤務形態未設定"}</StatusBadge>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold">{job.title}</h2>
                  <p className="mt-1 text-sm text-stone-500">{job.companyProfile.name}</p>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-600">{job.description}</p>
                </div>
                <Link className="btn btn-secondary shrink-0" href={`/jobs/${job.id}`}>
                  詳細 {icons.arrow}
                </Link>
              </div>
            </Card>
          ))}
          {jobs.length === 0 && (
            <Card>
              <p className="font-semibold">条件に合う公開案件はありません。</p>
              <p className="mt-2 text-sm text-stone-600">キーワードを短くするか、勤務形態の条件を外して再検索してください。</p>
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}
