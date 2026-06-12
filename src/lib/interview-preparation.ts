import type { CareerHistoryEvidence } from "./readiness.ts";
import { hasMeaningfulCareerHistory } from "./readiness.ts";

export function hasMeaningfulInterviewCareerHistoryEvidence(careerHistory: CareerHistoryEvidence) {
  return hasMeaningfulCareerHistory(careerHistory);
}

export function getInterviewCareerHistoryTrustSignal(careerHistory: CareerHistoryEvidence) {
  const done = hasMeaningfulInterviewCareerHistoryEvidence(careerHistory);

  return {
    value: done ? "登録済み" : "未登録",
    done,
  };
}

export function isInterviewApplicantInfoPrepared({
  readinessPercent,
  documentCount,
  hasMeaningfulCareerHistoryEvidence,
}: {
  readinessPercent: number;
  documentCount: number;
  hasMeaningfulCareerHistoryEvidence: boolean;
}) {
  return readinessPercent >= 100 && documentCount >= 2 && hasMeaningfulCareerHistoryEvidence;
}
