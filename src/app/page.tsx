import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Shell, TopNav, Card, StatusBadge, icons } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = process.env.AUTH_SECRET ? await auth().catch(() => null) : null;
  const [jobs, companies] = await Promise.all([
    process.env.DATABASE_URL ? prisma.jobPost.count({ where: { status: "published" } }).catch(() => 0) : 0,
    process.env.DATABASE_URL ? prisma.companyProfile.count().catch(() => 0) : 0,
  ]);

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <section className="mx-auto grid min-h-[calc(100vh-65px)] max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <StatusBadge tone="good">MVP workspace</StatusBadge>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-tight tracking-normal">
            案件公開から書類選考、面談調整までを一本化する。
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-stone-600">
            Flow Link は、企業が案件を公開し、フリーランスが応募し、書類選考OK後に面談日程を調整できるMVPです。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/jobs">
              案件を見る {icons.arrow}
            </Link>
            {!session && <Link className="btn btn-secondary" href="/register">アカウント登録</Link>}
          </div>
        </div>
        <div className="grid gap-4">
          <Card>
            <p className="text-sm text-stone-500">公開中案件</p>
            <p className="mt-2 text-4xl font-semibold">{jobs}</p>
          </Card>
          <Card>
            <p className="text-sm text-stone-500">登録企業</p>
            <p className="mt-2 text-4xl font-semibold">{companies}</p>
          </Card>
          <Card>
            <p className="text-sm font-semibold">MVP対象</p>
            <div className="mt-4 grid gap-3 text-sm text-stone-600">
              <p>案件公開、応募、書類選考OK/NG、結果通知、面談日程調整チャット。</p>
              <p>契約、請求、決済、AIマッチング、スカウトは対象外です。</p>
            </div>
          </Card>
        </div>
      </section>
    </Shell>
  );
}
