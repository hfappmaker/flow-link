import { RecommendationFeedbackReason } from "@prisma/client";
import { saveJobPost } from "@/lib/actions";
import { requireCompanyUser } from "@/lib/page-guards";
import { prisma } from "@/lib/prisma";
import {
  RECOMMENDATION_FEEDBACK_MIN_COMPANY_INSIGHT_COUNT,
  recommendationFeedbackLabel,
} from "@/lib/recommendation-feedback";
import { Shell, TopNav, PageHeader, Card } from "@/components/ui";
import { JobPostForm } from "../parts";

export const dynamic = "force-dynamic";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, companyUser } = await requireCompanyUser();
  const job = await prisma.jobPost.findFirst({ where: { id, companyProfileId: companyUser.companyProfileId } });
  const feedback = job
    ? await prisma.recommendationFeedback.findMany({
        where: { jobPostId: job.id },
        select: { reason: true },
      })
    : [];
  const insights = buildCompanyFeedbackInsights(feedback);
  return (
    <Shell>
      <TopNav sessionRole={user.role} />
      <div className="mx-auto max-w-5xl px-5 py-8">
        <PageHeader title="案件編集" />
        {job && <CompanyFeedbackInsights insights={insights} totalCount={feedback.length} />}
        <Card className="mt-6">{job ? <JobPostForm action={saveJobPost} job={job} /> : "案件が見つかりません。"}</Card>
      </div>
    </Shell>
  );
}

function CompanyFeedbackInsights({
  insights,
  totalCount,
}: {
  insights: Array<{ reason: RecommendationFeedbackReason; count: number; guidance: string }>;
  totalCount: number;
}) {
  if (totalCount < RECOMMENDATION_FEEDBACK_MIN_COMPANY_INSIGHT_COUNT) {
    return (
      <Card className="mt-6 border-stone-200 bg-stone-50">
        <h2 className="font-semibold">推薦フィードバック</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          まだ集計に必要な件数に達していません。個別のフリーランスや非公開メモは表示せず、十分な件数が集まった場合だけ傾向を表示します。
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <h2 className="font-semibold">推薦フィードバックの傾向</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        応募前の推薦フィードバックを理由別に集計しています。個別のフリーランスや非公開メモは表示しません。
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {insights.map((insight) => (
          <div className="rounded border border-stone-200 bg-stone-50 p-3" key={insight.reason}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold">{recommendationFeedbackLabel(insight.reason)}</p>
              <span className="rounded border border-white bg-white px-2 py-1 text-xs font-semibold text-stone-700">
                {insight.count}件
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-stone-600">{insight.guidance}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function buildCompanyFeedbackInsights(feedback: Array<{ reason: RecommendationFeedbackReason }>) {
  const counts = new Map<RecommendationFeedbackReason, number>();
  for (const item of feedback) {
    counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  }

  const insights = Array.from(counts.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      guidance: companyInsightGuidance(reason),
    }))
    .sort((a, b) => b.count - a.count)
  const concernInsights = insights.filter((insight) => insight.reason !== RecommendationFeedbackReason.good_fit);

  return (concernInsights.length > 0 ? concernInsights : insights).slice(0, 3);
}

function companyInsightGuidance(reason: RecommendationFeedbackReason) {
  const guidance: Record<RecommendationFeedbackReason, string> = {
    good_fit: "条件が伝わっている候補です。現在の記載を維持しつつ、応募後の返信を早めに進めてください。",
    not_relevant: "タイトルや業務内容が対象人材に届いていない可能性があります。担当範囲と期待成果を具体化してください。",
    wrong_role_skill: "スキル要件またはロール名が候補者の期待とずれている可能性があります。必須と歓迎を分けて見直してください。",
    rate_mismatch: "単価への懸念が出ています。報酬レンジ、精算幅、支払い条件を追記すると判断しやすくなります。",
    workload_mismatch: "稼働量への懸念が出ています。週あたり日数、時間帯、繁忙期の期待値を明記してください。",
    location_mismatch: "勤務地やリモート条件への懸念が出ています。出社頻度、居住地条件、例外対応を明記してください。",
    company_trust_concern: "会社情報や支払い条件の確認材料が不足している可能性があります。公開URL、窓口、契約条件を補ってください。",
    already_handled: "他経路で対応済みの候補が含まれます。募集状況や重複応募の案内を確認してください。",
    hide_similar: "似た条件を控えたい反応があります。対象ロール、単価、稼働条件のどこが固定条件か明確にしてください。",
  };
  return guidance[reason];
}
