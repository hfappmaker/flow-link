import Link from "next/link";
import { auth } from "@/lib/auth";
import { logoutUser } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { getFreelancerReadiness } from "@/lib/readiness";
import { Shell, TopNav, PageHeader, StatCard, Card, icons } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FreelancerDashboard() {
  const session = await auth();
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: session!.user.id },
    include: { applications: true, documents: true, careerHistory: true },
  });
  const unread = await prisma.notification.count({ where: { userId: session!.user.id, readAt: null } });
  const readiness = getFreelancerReadiness(profile);

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-7xl px-5 py-8">
        <PageHeader
          title="フリーランス ダッシュボード"
          description="プロフィール、書類、応募状況、選考結果を管理します。"
          action={<form action={logoutUser}><button className="btn btn-secondary">ログアウト</button></form>}
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <StatCard label="応募数" value={profile?.applications.length ?? 0} icon={icons.jobs} />
          <StatCard label="登録書類" value={profile?.documents.length ?? 0} icon={icons.files} />
          <StatCard label="未読通知" value={unread} icon={icons.ok} />
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
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ActionCard href="/freelancer/profile" title="プロフィール編集" body="希望職種、スキル、稼働条件を更新します。" />
          <ActionCard href="/freelancer/career" title="職務経歴フォーム" body="検索や選考時に確認される職務経歴を整えます。" />
          <ActionCard href="/freelancer/documents" title="PDF書類" body="履歴書PDFと職務経歴書PDFをアップロードします。" />
          <ActionCard href="/freelancer/applications" title="応募済み案件" body="応募履歴と選考状況を確認します。" />
          <ActionCard href="/freelancer/notifications" title="通知" body="書類選考OK/NGの通知を確認します。" />
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
