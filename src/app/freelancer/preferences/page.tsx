import Link from "next/link";
import { deleteSavedJobSearch, saveWorkPreference, updateSavedJobSearch } from "@/lib/actions";
import { alertCadenceLabel } from "@/lib/job-alerts";
import { requireFreelancerProfile } from "@/lib/page-guards";
import { formatDateTime, locationModeLabel, workPreferenceCompleteness } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, EmptyState, SelectField, StatusBadge, TextArea, TextField } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function WorkPreferencesPage() {
  const { user, profile } = await requireFreelancerProfile({
    currentPath: "/freelancer/preferences",
    include: {
      workPreference: true,
      savedJobSearches: {
        orderBy: { createdAt: "desc" },
        include: {
          alertMatches: {
            orderBy: { matchedAt: "desc" },
            take: 3,
            include: {
              jobPost: { select: { id: true, title: true } },
              notification: { select: { actionUrl: true } },
            },
          },
        },
      },
    },
  });
  const preference = profile.workPreference;
  const completeness = workPreferenceCompleteness(preference);

  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <PageHeader
          title="仕事探しの希望条件"
          description="今探している仕事の条件を保存し、案件のおすすめ、検討リスト、今後のジョブダイジェストに使います。"
          action={<Link className="btn btn-secondary" href="/jobs?accepting=open&sort=direct">案件を見る</Link>}
        />
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
          <Card>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="font-semibold">現在の希望条件</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  プロフィールの経歴とは別に、今連絡を受けたい仕事の条件を登録します。
                </p>
              </div>
              <StatusBadge tone={completeness.usable ? "good" : completeness.stale ? "warn" : "neutral"}>
                {completeness.stale ? "更新推奨" : `充足 ${completeness.percent}%`}
              </StatusBadge>
            </div>
            <form action={saveWorkPreference} className="mt-5 grid gap-4 md:grid-cols-2">
              <SelectField name="status" label="仕事探しステータス" defaultValue={preference?.status ?? "active"}>
                <option value="active">積極的に探している</option>
                <option value="passive">よい案件だけ連絡可</option>
                <option value="inactive">今は探していない</option>
              </SelectField>
              <TextField name="targetRole" label="希望ロール・カテゴリ" defaultValue={preference?.targetRole ?? profile.desiredOccupation} placeholder="例: React フロントエンド" />
              <TextField name="targetRate" label="希望単価・単価レンジ" defaultValue={preference?.targetRate ?? profile.desiredRate} placeholder="例: 月80万円以上、時給7000円から" />
              <TextField name="workload" label="希望稼働量" defaultValue={preference?.workload ?? profile.availability} placeholder="例: 週3日、0.6人月、平日日中" />
              <SelectField name="locationMode" label="希望する働き方" defaultValue={preference?.locationMode ?? "flexible"}>
                <option value="flexible">柔軟</option>
                <option value="remote">リモート中心</option>
                <option value="hybrid">一部出社可</option>
                <option value="onsite">出社可</option>
              </SelectField>
              <TextField name="preferredLocation" label="希望勤務地・対象地域" defaultValue={preference?.preferredLocation ?? profile.preferredLocation} placeholder="例: 東京、関西、全国リモート" />
              <TextField name="availableFrom" label="開始可能時期" defaultValue={preference?.availableFrom ?? profile.availableFrom} placeholder="例: 2026年7月から、即日相談可" />
              <TextField name="notificationCadence" label="今後の通知・ダイジェスト方針" defaultValue={preference?.notificationCadence} placeholder="例: 週1回、条件一致だけ、通知なし" />
              <div className="md:col-span-2">
                <TextArea name="preferredSkills" label="連絡を受けたいスキル・タグ" defaultValue={preference?.preferredSkills ?? profile.skills} placeholder="例: React, TypeScript, Next.js, BtoB SaaS" />
              </div>
              <div className="md:col-span-2">
                <TextArea name="excludedConditions" label="避けたい条件" defaultValue={preference?.excludedConditions} maxLength={600} placeholder="例: 常駐必須、短納期のみ、夜間中心" />
              </div>
              <div className="md:col-span-2">
                <TextArea name="privateNotes" label="非公開メモ" defaultValue={preference?.privateNotes} maxLength={800} placeholder="企業には表示されない、仕事探しの判断メモ" />
              </div>
              <button className="btn btn-primary md:col-span-2" type="submit">希望条件を保存</button>
            </form>
          </Card>
          <div className="grid h-fit gap-5">
            <Card>
              <h2 className="font-semibold">マッチングに使う項目</h2>
              <div className="mt-4 grid gap-2 text-sm">
                <PreferenceCheck label="仕事探し状態" done={Boolean(preference?.status)} />
                <PreferenceCheck label="希望ロール" done={Boolean(preference?.targetRole)} />
                <PreferenceCheck label="スキル・タグ" done={Boolean(preference?.preferredSkills)} />
                <PreferenceCheck label="単価" done={Boolean(preference?.targetRate)} />
                <PreferenceCheck label="稼働量" done={Boolean(preference?.workload)} />
                <PreferenceCheck label="働き方・地域" done={Boolean(preference?.preferredLocation) || Boolean(preference?.locationMode && preference.locationMode !== "flexible")} />
                <PreferenceCheck label="開始時期" done={Boolean(preference?.availableFrom)} />
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold">通知への接続</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                保存フィードごとのアラート頻度に従って、新しく公開された受付中案件を通知またはダイジェスト候補にします。メール配信は未接続ですが、同じ配信状態から後で拡張できます。
              </p>
              <div className="mt-3 rounded border border-stone-200 bg-stone-50 p-3 text-sm">
                <p className="text-xs text-stone-500">現在の方針</p>
                <p className="mt-1 font-semibold">{preference?.notificationCadence || "未設定"}</p>
              </div>
            </Card>
          </div>
        </div>
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">保存した仕事フィード</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                検索条件を保存すると、同じ条件の候補をワンクリックで再確認できます。
              </p>
            </div>
            <Link className="btn btn-secondary" href="/jobs?accepting=open&sort=direct">フィードを作る</Link>
          </div>
          {profile.savedJobSearches.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {profile.savedJobSearches.map((search) => (
                <SavedSearchCard search={search} key={search.id} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="保存した仕事フィードはまだありません。"
              description="公開案件ページで検索条件を保存すると、同じ条件の候補を継続して確認できます。"
              action={<Link className="btn btn-primary" href="/jobs?accepting=open&sort=direct">公開案件で保存</Link>}
            />
          )}
        </section>
      </div>
    </Shell>
  );
}

function PreferenceCheck({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded border px-3 py-2 ${done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-stone-50 text-stone-700"}`}>
      <span className="font-medium">{label}</span>
      <span className="text-xs font-semibold">{done ? "設定済み" : "未設定"}</span>
    </div>
  );
}

type SavedSearch = {
  id: string;
  name: string;
  query?: string | null;
  remote: boolean;
  acceptingOnly: boolean;
  directReadyOnly: boolean;
  fit?: string | null;
  workload?: string | null;
  rate?: string | null;
  sort: string;
  notificationCadence?: string | null;
  alertMatches?: Array<{
    id: string;
    status: string;
    fitReasons: string;
    trustWarning?: string | null;
    suppressionReason?: string | null;
    matchedAt: Date | string;
    notifiedAt?: Date | string | null;
    jobPost: { id: string; title: string };
    notification?: { actionUrl?: string | null } | null;
  }>;
};

function SavedSearchCard({ search }: { search: SavedSearch }) {
  const recentAlerts = search.alertMatches ?? [];
  return (
    <div className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{search.name}</h3>
          <p className="mt-1 text-sm text-stone-500">{savedSearchSummary(search)}</p>
        </div>
        <StatusBadge>{search.sort === "new" ? "新着順" : "おすすめ順"}</StatusBadge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link className="btn btn-secondary" href={savedSearchHref(search)}>このフィードを見る</Link>
        <StatusBadge tone={search.notificationCadence === "paused" ? "warn" : "good"}>
          {alertCadenceLabel(search.notificationCadence)}
        </StatusBadge>
      </div>
      <form action={updateSavedJobSearch} className="mt-4 grid gap-3 rounded border border-stone-200 bg-stone-50 p-3">
        <input type="hidden" name="savedJobSearchId" value={search.id} />
        <label className="grid gap-1.5 text-sm font-medium text-stone-700">
          フィード名
          <input className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700" name="name" defaultValue={search.name} maxLength={80} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-stone-700">
          アラート頻度
          <select className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700" name="notificationCadence" defaultValue={search.notificationCadence ?? "immediate"}>
            <option value="immediate">{alertCadenceLabel("immediate")}</option>
            <option value="daily">{alertCadenceLabel("daily")}</option>
            <option value="weekly">{alertCadenceLabel("weekly")}</option>
            <option value="paused">{alertCadenceLabel("paused")}</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" type="submit">設定を保存</button>
        </div>
      </form>
      <form action={deleteSavedJobSearch} className="mt-2">
        <input type="hidden" name="savedJobSearchId" value={search.id} />
        <button className="text-sm font-semibold text-stone-500 underline" type="submit">このフィードを削除</button>
      </form>
      <div className="mt-4 border-t border-stone-200 pt-3">
        <h4 className="text-sm font-semibold">最近のアラート履歴</h4>
        {recentAlerts.length > 0 ? (
          <div className="mt-2 grid gap-2">
            {recentAlerts.map((alert) => (
              <div className="rounded border border-stone-200 bg-white px-3 py-2 text-sm" key={alert.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link className="font-semibold text-emerald-700 underline" href={alert.notification?.actionUrl ?? `/jobs/${alert.jobPost.id}`}>
                    {alert.jobPost.title}
                  </Link>
                  <span className="text-xs text-stone-500">{alertStatusLabel(alert.status)} / {formatDateTime(alert.notifiedAt ?? alert.matchedAt)}</span>
                </div>
                <p className="mt-1 text-stone-600">理由: {alert.fitReasons}</p>
                {alert.trustWarning && <p className="mt-1 text-amber-800">確認事項: {alert.trustWarning}</p>}
                {alert.suppressionReason && <p className="mt-1 text-stone-500">通知しない理由: {alert.suppressionReason}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-500">まだ一致履歴はありません。新しい受付中案件が公開されるとここに残ります。</p>
        )}
      </div>
    </div>
  );
}

function savedSearchHref(search: SavedSearch) {
  return {
    pathname: "/jobs",
    query: {
      ...(search.query ? { q: search.query } : {}),
      ...(search.remote ? { remote: "remote" } : {}),
      ...(search.acceptingOnly ? { accepting: "open" } : {}),
      ...(search.directReadyOnly ? { directReady: "ready" } : {}),
      ...(search.fit ? { fit: search.fit } : {}),
      ...(search.workload ? { workload: search.workload } : {}),
      ...(search.rate ? { rate: search.rate } : {}),
      sort: search.sort,
    },
  };
}

function savedSearchSummary(search: SavedSearch) {
  return [
    search.query && `キーワード: ${search.query}`,
    search.remote && "リモート可",
    search.acceptingOnly && "受付中",
    search.directReadyOnly && "条件確認済み",
    search.fit === "skill" && "スキル一致",
    search.fit === "ready" && "応募へ進みやすい",
    search.workload === "light" && "週2-3日",
    search.rate === "high" && "80万円以上",
    search.notificationCadence && `通知: ${alertCadenceLabel(search.notificationCadence)}`,
  ].filter(Boolean).join(" / ") || `働き方: ${locationModeLabel("flexible")}`;
}

function alertStatusLabel(status: string) {
  const labels: Record<string, string> = {
    notified: "通知済み",
    pending_digest: "ダイジェスト待ち",
    suppressed: "抑制",
  };
  return labels[status] ?? status;
}
