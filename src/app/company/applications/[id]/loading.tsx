import { Card, PageHeader, Shell, StatusBadge, TopNav } from "@/components/ui";

export default function ApplicationDetailLoading() {
  return (
    <Shell>
      <TopNav sessionRole="company_user" />
      <div className="mx-auto max-w-6xl px-5 py-8" aria-busy="true">
        <PageHeader title="応募者詳細" description="応募者のプロフィールと選考情報を読み込んでいます。" />
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-5">
            <Card>
              <StatusBadge>読み込み中</StatusBadge>
              <div className="mt-5 grid gap-4 text-sm md:grid-cols-2">
                {["希望職種", "スキル", "経験年数", "希望単価", "稼働条件", "リモート希望"].map((label) => (
                  <div key={label}>
                    <p className="text-stone-500">{label}</p>
                    <div className="mt-2 h-4 w-32 animate-pulse rounded bg-stone-200" />
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold">職務経歴フォーム</h2>
              <div className="mt-3 grid gap-2">
                <div className="h-4 w-full animate-pulse rounded bg-stone-200" />
                <div className="h-4 w-11/12 animate-pulse rounded bg-stone-200" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-stone-200" />
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold">PDF書類</h2>
              <div className="mt-3 grid gap-2">
                <div className="h-4 w-40 animate-pulse rounded bg-stone-200" />
                <div className="h-4 w-48 animate-pulse rounded bg-stone-200" />
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold">企業内メモ</h2>
              <div className="mt-4 h-28 animate-pulse rounded border border-stone-200 bg-stone-50" />
            </Card>
          </div>
          <Card className="h-fit">
            <h2 className="font-semibold">書類選考</h2>
            <div className="mt-4 grid gap-3">
              <div className="h-10 animate-pulse rounded bg-stone-200" />
              <div className="h-10 animate-pulse rounded bg-stone-200" />
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
