import { submitRecommendationFeedback } from "@/lib/actions";
import { recommendationFeedbackLabel, recommendationFeedbackOptions } from "@/lib/recommendation-feedback";

type RecommendationFeedbackFormProps = {
  currentReason?: string | null;
  jobPostId: string;
  returnTo: string;
  source: string;
  sourceContext?: string | null;
  visibleReasons?: Array<{ label: string; detail: string; tone: string }>;
};

export function RecommendationFeedbackForm({
  currentReason,
  jobPostId,
  returnTo,
  source,
  sourceContext,
  visibleReasons = [],
}: RecommendationFeedbackFormProps) {
  const serializedReasons = visibleReasons
    .map((reason) => `${reason.label}: ${reason.detail}`)
    .join("\n")
    .slice(0, 1200);

  return (
    <form action={submitRecommendationFeedback} className="rounded border border-stone-200 bg-stone-50 p-3">
      <input type="hidden" name="jobPostId" value={jobPostId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="sourceContext" value={sourceContext ?? ""} />
      <input type="hidden" name="visibleReasons" value={serializedReasons} />
      <label className="grid gap-1.5 text-sm font-medium text-stone-700">
        推薦の印象
        <select
          className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
          name="reason"
          defaultValue={currentReason ?? ""}
          required
        >
          <option value="">理由を選択</option>
          {recommendationFeedbackOptions().map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {currentReason && (
        <p className="mt-2 text-xs leading-5 text-stone-600">
          前回の入力: {recommendationFeedbackLabel(currentReason as Parameters<typeof recommendationFeedbackLabel>[0])}
        </p>
      )}
      <label className="mt-3 grid gap-1.5 text-sm font-medium text-stone-700">
        非公開メモ
        <textarea
          className="min-h-20 rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
          name="note"
          maxLength={400}
          placeholder="例: 稼働量だけ合わない、会社情報がもう少し欲しい"
        />
      </label>
      <button className="btn btn-secondary mt-3 w-full" type="submit">
        推薦に反映
      </button>
    </form>
  );
}
