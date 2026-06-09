import { reputationMinimumFeedbackCount, type ReputationSummary } from "@/lib/reputation";
import { Card, StatusBadge } from "@/components/ui";

export function ReputationSummaryCard({
  title,
  summary,
  subjectLabel,
}: {
  title: string;
  summary: ReputationSummary;
  subjectLabel: "company" | "freelancer";
}) {
  const subjectText = subjectLabel === "company" ? "企業" : "フリーランス";
  const headline = summary.hasEnoughHistory
    ? "Flow Link上のやりとり履歴"
    : "Flow Link履歴はまだ十分ではありません";

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            {headline}。公開集計には、面談など実際のやりとりがあった参加者の評価だけを使います。
          </p>
        </div>
        <StatusBadge tone={summary.hasEnoughHistory ? "good" : "neutral"}>
          {summary.hasEnoughHistory ? "履歴あり" : "履歴少"}
        </StatusBadge>
      </div>

      <div className="mt-4 grid gap-2">
        <ReputationMetric
          label="完了したやりとり"
          value={`${summary.completedInteractionCount}件`}
          detail="面談実施など、参加者が完了として送信したFlow Link内の相互作用です。"
        />
        <ReputationMetric
          label="返信・フォロー"
          value={summary.averageFollowThrough === null ? "集計待ち" : `${summary.averageFollowThrough}/5`}
          detail={
            summary.averageFollowThrough === null
              ? `${reputationMinimumFeedbackCount}件以上の公開評価が集まるまで平均は表示しません。`
              : "返信、日程調整、約束した次アクションの進み方に関する平均です。"
          }
        />
        <ReputationMetric
          label="協働しやすさ"
          value={summary.averageCollaboration === null ? "集計待ち" : `${summary.averageCollaboration}/5`}
          detail={
            summary.averageCollaboration === null
              ? `新規または低件数の${subjectText}は、リスクではなく履歴不足として扱います。`
              : "面談や参画前後のコミュニケーションのしやすさに関する平均です。"
          }
        />
      </div>

      <p className="mt-4 rounded border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-600">
        この表示はFlow Link内の過去のやりとりから作る参考情報です。支払い、本人確認、将来の成果を保証するものではありません。報告された評価や非公開指定の内容、個別メモは公開集計に含めません。
      </p>
    </Card>
  );
}

function ReputationMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-stone-900">{label}</span>
        <span className="text-right text-xs font-semibold text-stone-700">{value}</span>
      </div>
      <p className="mt-1 leading-6 text-stone-600">{detail}</p>
    </div>
  );
}
