import {
  RecommendationFeedbackReason,
  RecommendationFeedbackSentiment,
  type RecommendationFeedback,
} from "@prisma/client";
import { matchedSkills, normalizedTextMatchesQuery, parseSkills, type WorkPreferenceInput } from "./utils.ts";

export const RECOMMENDATION_FEEDBACK_MIN_COMPANY_INSIGHT_COUNT = 3;

export type RecommendationFeedbackSignal = Pick<
  RecommendationFeedback,
  "jobPostId" | "reason" | "sentiment" | "hideSimilar" | "visibleReasons"
> & {
  jobPost?: FeedbackReferenceJob | null;
};

type FeedbackReferenceJob = {
  id: string;
  title?: string | null;
  description?: string | null;
  requiredSkills?: string | null;
  preferredSkills?: string | null;
  rate?: string | null;
  workload?: string | null;
  location?: string | null;
  remotePolicy?: string | null;
  companyProfileId?: string | null;
};

export type FeedbackScoredJob = FeedbackReferenceJob & {
  requiredSkills?: string | null;
  preferredSkills?: string | null;
};

export function recommendationFeedbackSentiment(reason: RecommendationFeedbackReason) {
  if (reason === RecommendationFeedbackReason.good_fit) return RecommendationFeedbackSentiment.positive;
  if (reason === RecommendationFeedbackReason.already_handled) return RecommendationFeedbackSentiment.neutral;
  return RecommendationFeedbackSentiment.negative;
}

export function recommendationFeedbackLabel(reason: RecommendationFeedbackReason) {
  const labels: Record<RecommendationFeedbackReason, string> = {
    good_fit: "良さそう",
    not_relevant: "関連が薄い",
    wrong_role_skill: "ロール・スキルが違う",
    rate_mismatch: "単価が合わない",
    workload_mismatch: "稼働量が合わない",
    location_mismatch: "勤務地・リモートが合わない",
    company_trust_concern: "会社・信頼情報を確認したい",
    already_handled: "別で対応済み",
    hide_similar: "似た案件を控えめにする",
  };
  return labels[reason];
}

export function recommendationFeedbackOptions() {
  return [
    RecommendationFeedbackReason.good_fit,
    RecommendationFeedbackReason.not_relevant,
    RecommendationFeedbackReason.wrong_role_skill,
    RecommendationFeedbackReason.rate_mismatch,
    RecommendationFeedbackReason.workload_mismatch,
    RecommendationFeedbackReason.location_mismatch,
    RecommendationFeedbackReason.company_trust_concern,
    RecommendationFeedbackReason.already_handled,
    RecommendationFeedbackReason.hide_similar,
  ].map((reason) => ({ value: reason, label: recommendationFeedbackLabel(reason) }));
}

export function recommendationFeedbackAdjustment({
  applied,
  feedback,
  job,
  saved,
  workPreference,
}: {
  applied?: boolean;
  feedback?: RecommendationFeedbackSignal[];
  job: FeedbackScoredJob;
  saved?: boolean;
  workPreference?: WorkPreferenceInput;
}) {
  const signals = feedback ?? [];
  const exact = signals.find((signal) => signal.jobPostId === job.id);
  let adjustment = 0;
  const reasons: Array<{ label: string; detail: string; tone: "good" | "neutral" | "warn" }> = [];

  if (saved) {
    adjustment += 4;
    reasons.push({
      label: "検討リスト入り",
      detail: "保存済みのため、応募前の確認対象として少し優先します。",
      tone: "good",
    });
  }
  if (applied) {
    adjustment += 8;
    reasons.push({
      label: "応募済み",
      detail: "過去に応募した案件は履歴確認の文脈で扱います。",
      tone: "neutral",
    });
  }

  if (exact) {
    if (exact.sentiment === RecommendationFeedbackSentiment.positive) adjustment += 14;
    if (exact.sentiment === RecommendationFeedbackSentiment.negative) adjustment -= exact.hideSimilar ? 32 : 24;
    if (exact.sentiment === RecommendationFeedbackSentiment.neutral) adjustment -= 10;
    reasons.unshift({
      label: recommendationFeedbackLabel(exact.reason),
      detail:
        exact.sentiment === RecommendationFeedbackSentiment.positive
          ? "あなたのフィードバックを受けて、この案件を確認しやすくしています。"
          : exact.hideSimilar
            ? "あなたのフィードバックを受けて、この案件と近い候補は控えめに表示します。手動検索では引き続き確認できます。"
            : "あなたのフィードバックを受けて、この案件の優先度を控えめにしています。手動検索では引き続き確認できます。",
      tone: exact.sentiment === RecommendationFeedbackSentiment.positive ? "good" : "warn",
    });
  }

  const similarSignals = signals.filter((signal) => signal.jobPostId !== job.id && signal.jobPost);
  const negativeSimilarSignals = similarSignals.filter(
    (signal) => signal.sentiment === RecommendationFeedbackSentiment.negative && similarityScore(job, signal.jobPost, signal.reason, workPreference) >= 2,
  );
  const positiveSimilarSignals = similarSignals.filter(
    (signal) => signal.sentiment === RecommendationFeedbackSentiment.positive && similarityScore(job, signal.jobPost, signal.reason, workPreference) >= 2,
  );
  const hideSimilarCount = negativeSimilarSignals.filter((signal) => signal.hideSimilar).length;

  if (!exact && hideSimilarCount > 0) {
    const penalty = Math.min(18, 10 + hideSimilarCount * 4);
    adjustment -= penalty;
    reasons.push({
      label: "似た案件を控えめに表示",
      detail: "以前のフィードバックと近い条件があります。新しい会社や案件は残しつつ、優先度だけ下げています。",
      tone: "warn",
    });
  } else if (!exact && negativeSimilarSignals.length >= 2) {
    adjustment -= 8;
    reasons.push({
      label: "近い懸念あり",
      detail: "複数の過去フィードバックと近い条件があるため、少し控えめに表示します。",
      tone: "warn",
    });
  }

  if (!exact && positiveSimilarSignals.length > 0) {
    adjustment += Math.min(10, 6 + positiveSimilarSignals.length * 2);
    reasons.push({
      label: "良さそうな条件に近い",
      detail: "過去に良い反応をした案件と近い条件があるため、確認候補に残しています。",
      tone: "good",
    });
  }

  return {
    adjustment: Math.max(-40, Math.min(20, adjustment)),
    reasons,
  };
}

function similarityScore(
  job: FeedbackScoredJob,
  reference: FeedbackReferenceJob | null | undefined,
  reason: RecommendationFeedbackReason,
  workPreference: WorkPreferenceInput,
) {
  if (!reference) return 0;
  let score = 0;
  if (reference.companyProfileId && reference.companyProfileId === job.companyProfileId) score += 2;

  const matchedRequired = matchedSkills(job.requiredSkills, reference.requiredSkills).length;
  const matchedPreferred = matchedSkills(job.preferredSkills, reference.preferredSkills).length;
  if (matchedRequired + matchedPreferred > 0) score += 2;

  const roleTokens = parseSkills(workPreference?.targetRole);
  if (roleTokens.length > 0 && includesAny(`${job.title ?? ""} ${job.description ?? ""}`, roleTokens)) score += 1;

  if (reason === RecommendationFeedbackReason.rate_mismatch && hasTokenOverlap(job.rate, reference.rate)) score += 2;
  if (reason === RecommendationFeedbackReason.workload_mismatch && hasTokenOverlap(job.workload, reference.workload)) score += 2;
  if (reason === RecommendationFeedbackReason.location_mismatch && hasTokenOverlap(`${job.location ?? ""} ${job.remotePolicy ?? ""}`, `${reference.location ?? ""} ${reference.remotePolicy ?? ""}`)) score += 2;
  if (reason === RecommendationFeedbackReason.company_trust_concern && reference.companyProfileId === job.companyProfileId) score += 2;

  return score;
}

function hasTokenOverlap(left?: string | null, right?: string | null) {
  const leftTokens = parseSkills(left);
  return leftTokens.length > 0 && leftTokens.some((token) => normalizedTextMatchesQuery(token, right));
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => normalizedTextMatchesQuery(word, text));
}
