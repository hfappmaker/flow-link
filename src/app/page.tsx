import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Shell, TopNav, StatusBadge, icons } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = process.env.AUTH_SECRET ? await auth().catch(() => null) : null;
  const [jobs, companies, applications] = await Promise.all([
    process.env.DATABASE_URL ? prisma.jobPost.count({ where: { status: "published" } }) : 0,
    process.env.DATABASE_URL ? prisma.companyProfile.count() : 0,
    process.env.DATABASE_URL ? prisma.jobApplication.count() : 0,
  ]);

  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <section className="mx-auto grid min-h-[calc(100vh-65px)] max-w-7xl gap-10 px-5 py-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
        <div>
          <StatusBadge tone="good">Direct matching workspace</StatusBadge>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-tight tracking-normal text-stone-950">
            企業とフリーランスが、仲介なしで条件確認から面談まで進める。
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-stone-600">
            Flow Link は営業担当やエージェントを挟まず、案件条件、応募提案、書類選考、面談チャットを同じ場所に集約します。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/jobs">
              直接応募できる案件を見る {icons.arrow}
            </Link>
            {!session && <Link className="btn btn-secondary" href="/register">プロフィールを作る</Link>}
          </div>
          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            <Metric label="公開中案件" value={jobs} />
            <Metric label="登録企業" value={companies} />
            <Metric label="直接応募" value={applications} />
          </div>
        </div>

        <div className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-stone-200 pb-4">
            <div>
              <p className="text-sm font-semibold text-stone-950">Direct match room</p>
              <p className="mt-1 text-xs text-stone-500">応募後の判断材料と次の接点</p>
            </div>
            <StatusBadge tone="good">仲介なし</StatusBadge>
          </div>

          <div className="mt-4 grid gap-3">
            <PreviewRow
              accent="emerald"
              label="条件公開"
              title="単価・稼働率・契約条件"
              description="企業が直接契約の前提を案件上で提示"
              value="5/5"
            />
            <PreviewRow
              accent="sky"
              label="応募提案"
              title="スキル一致と開始時期"
              description="フリーランスの提案文が企業へ直接届く"
              value="86%"
            />
            <PreviewRow
              accent="amber"
              label="面談接続"
              title="チャットと日程調整"
              description="書類選考OK後に双方だけで面談へ進行"
              value="Ready"
            />
          </div>

          <div className="mt-5 grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-stone-950">次のアクション</p>
              <span className="text-xs font-semibold text-emerald-700">会社と直接調整中</span>
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
