import Link from "next/link";
import { auth } from "@/lib/auth";
import { logoutUser } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { Shell, TopNav, PageHeader, StatCard, Card, icons } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CompanyDashboard() {
  const session = await auth();
  const companyUser = await prisma.companyUser.findUnique({ where: { userId: session!.user.id } });
  const [jobs, applications] = await Promise.all([
    prisma.jobPost.count({ where: { companyProfileId: companyUser!.companyProfileId } }),
    prisma.jobApplication.count({ where: { jobPost: { companyProfileId: companyUser!.companyProfileId } } }),
  ]);
  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-7xl px-5 py-8">
        <PageHeader
          title="企業 ダッシュボード"
          description="案件、応募者、書類選考、面談調整を管理します。"
          action={<form action={logoutUser}><button className="btn btn-secondary">ログアウト</button></form>}
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <StatCard label="案件数" value={jobs} icon={icons.jobs} />
          <StatCard label="応募者数" value={applications} icon={icons.users} />
          <StatCard label="選考管理" value="OK/NG" icon={icons.ok} />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ActionCard href="/company/profile" title="企業プロフィール" body="企業名、概要、Webサイトを更新します。" />
          <ActionCard href="/company/jobs" title="案件一覧" body="案件の作成、編集、公開状態、受付状態を管理します。" />
        </div>
      </div>
    </Shell>
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
