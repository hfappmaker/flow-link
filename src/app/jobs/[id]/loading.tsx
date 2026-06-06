import { Card, PageHeader, Shell, StatusBadge, TopNav } from "@/components/ui";

export default function JobDetailLoading() {
  return (
    <Shell>
      <TopNav />
      <div className="mx-auto max-w-5xl px-5 py-8" aria-busy="true">
        <PageHeader title="案件詳細" description="公開案件の情報を読み込んでいます。" />
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_280px]">
          <Card>
            <div className="flex flex-wrap gap-2">
              <StatusBadge>読み込み中</StatusBadge>
              <StatusBadge>勤務形態</StatusBadge>
            </div>
            <div className="mt-6 h-6 w-28 animate-pulse rounded bg-stone-200" />
            <div className="mt-3 grid gap-2">
              <div className="h-4 w-full animate-pulse rounded bg-stone-200" />
              <div className="h-4 w-11/12 animate-pulse rounded bg-stone-200" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-stone-200" />
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {["必須スキル", "歓迎スキル", "単価", "稼働率", "契約期間", "勤務地"].map((label) => (
                <div key={label}>
                  <p className="text-sm text-stone-500">{label}</p>
                  <div className="mt-2 h-4 w-32 animate-pulse rounded bg-stone-200" />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="h-10 w-full animate-pulse rounded bg-stone-200" />
            <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-stone-200" />
          </Card>
        </div>
      </div>
    </Shell>
  );
}
