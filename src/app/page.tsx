import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicDbReadResult } from "@/lib/public-db";
import { Shell, TopNav, StatusBadge, icons } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = process.env.AUTH_SECRET ? await auth().catch(() => null) : null;
  const [jobsResult, companiesResult, applicationsResult] = await Promise.all([
    publicDbReadResult(() => prisma.jobPost.count({ where: { status: "published" } }), 0),
    publicDbReadResult(() => prisma.companyProfile.count(), 0),
    publicDbReadResult(() => prisma.jobApplication.count(), 0),
  ]);
  const marketplaceCountsUnavailable = [jobsResult, companiesResult, applicationsResult].some(
    (result) => result.status === "unavailable",
  );

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1.03fr)_minmax(420px,0.97fr)] lg:items-start lg:gap-12 lg:py-12">
        <div>
          <StatusBadge tone="good">条件確認から面談まで管理</StatusBadge>
          <h1 className="mt-5 max-w-3xl text-[2rem] font-semibold leading-[1.28] tracking-normal text-stone-950 sm:text-[2.75rem] sm:leading-[1.18] xl:text-5xl xl:leading-tight">
            <span className="block">企業とフリーランスが、</span>
            <span className="block sm:whitespace-nowrap">
              <span className="whitespace-nowrap">条件確認</span>から面談まで
            </span>
            <span className="block">
              <span className="whitespace-nowrap">迷わず</span>進める。
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-stone-600">
            Flow Link は案件条件、応募提案、書類選考、面談チャットを同じ場所に集約します。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/jobs">
              応募できる案件を見る {icons.arrow}
            </Link>
            {!session && (
              <>
                <Link className="btn btn-secondary" href="/register">
                  フリーランスとして始める
                </Link>
                <Link className="btn btn-secondary" href="/register?callbackUrl=%2Fcompany">
                  企業として募集を始める
                </Link>
              </>
            )}
          </div>
          {marketplaceCountsUnavailable ? (
            <MarketplaceStatsUnavailable />
          ) : (
            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              <Metric label="公開中案件" value={jobsResult.data} />
              <Metric label="登録企業" value={companiesResult.data} />
              <Metric label="応募数" value={applicationsResult.data} />
            </div>
          )}
        </div>

        <div className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-stone-200 pb-4">
            <div>
              <p className="text-sm font-semibold text-stone-950">応募から面談までの進行</p>
              <p className="mt-1 text-xs text-stone-500">応募後の判断材料と次の接点</p>
            </div>
            <StatusBadge tone="good">面談準備中</StatusBadge>
          </div>

          <div className="mt-4 grid gap-3">
            <PreviewRow
              accent="emerald"
              label="条件公開"
              title="単価・稼働率・支払い条件"
              description="応募前に確認したい条件を案件上で提示"
              value="5/5"
            />
            <PreviewRow
              accent="sky"
              label="応募提案"
              title="スキル一致と開始時期"
              description="フリーランスの提案文を企業が確認"
              value="86%"
            />
            <PreviewRow
              accent="amber"
              label="面談接続"
              title="チャットと日程調整"
              description="書類選考OK後に面談へ進行"
              value="Ready"
            />
          </div>

          <div className="mt-5 grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-stone-950">次のアクション</p>
              <span className="text-xs font-semibold text-emerald-700">面談調整中</span>
            </div>
            <p className="text-sm leading-6 text-stone-600">
              面談日時、会議URL、契約前の確認事項まで、応募者と企業のチャットに集約されます。
            </p>
          </div>
        </div>
      </section>
    </Shell>
  );
}

function MarketplaceStatsUnavailable() {
  return (
    <div className="mt-8 max-w-2xl rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
      <p className="font-semibold">マーケットプレイスの最新状況を読み込めません。</p>
      <p className="mt-1 text-amber-900">
        公開案件数、登録企業数、応募数は現在確認できません。時間をおいて再読み込みしてください。
      </p>
      <Link className="btn btn-secondary mt-3" href="/">
        再読み込み
      </Link>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function PreviewRow({
  accent,
  label,
  title,
  description,
  value,
}: {
  accent: "emerald" | "sky" | "amber";
  label: string;
  title: string;
  description: string;
  value: string;
}) {
  const accentClasses = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  };

  return (
    <div className="grid gap-3 rounded-md border border-stone-200 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <span className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${accentClasses[accent]}`}>{label}</span>
        <p className="mt-2 text-sm font-semibold text-stone-950">{title}</p>
        <p className="mt-1 text-xs leading-5 text-stone-500">{description}</p>
      </div>
      <span className="text-right text-sm font-semibold text-stone-700">{value}</span>
    </div>
  );
}
