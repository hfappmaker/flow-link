import { CompanySafetyReportStatus, CompanySafetyReportType, type CompanySafetyReport } from "@prisma/client";

export const companySafetyReportTypeLabels: Record<CompanySafetyReportType, string> = {
  off_platform_payment_request: "外部・個人口座での支払い依頼",
  suspicious_evidence: "会社情報や提出根拠が不自然",
  unsafe_company: "面談・やりとりで不安な行動があった",
  mismatched_job_company_details: "案件内容と会社情報が食い違っている",
  other_trust_concern: "その他の信頼・安全面の懸念",
};

export const companySafetyReportStatusLabels: Record<CompanySafetyReportStatus, string> = {
  submitted: "受付済み",
  reviewing: "確認中",
  resolved: "確認完了",
};

export const safetyReportReasonOptions = [
  CompanySafetyReportType.off_platform_payment_request,
  CompanySafetyReportType.suspicious_evidence,
  CompanySafetyReportType.unsafe_company,
  CompanySafetyReportType.mismatched_job_company_details,
  CompanySafetyReportType.other_trust_concern,
] as const satisfies readonly CompanySafetyReportType[];

export function safetyReportStatusTone(status: CompanySafetyReportStatus) {
  if (status === CompanySafetyReportStatus.resolved) return "good";
  if (status === CompanySafetyReportStatus.reviewing) return "warn";
  return "neutral";
}

export function needsImmediateSafetyGuidance(reportType: CompanySafetyReportType) {
  return (
    reportType === CompanySafetyReportType.off_platform_payment_request ||
    reportType === CompanySafetyReportType.unsafe_company ||
    reportType === CompanySafetyReportType.suspicious_evidence
  );
}

export function activeSafetyReviewSummary(
  reports: Array<Pick<CompanySafetyReport, "status" | "reportType">>,
) {
  const activeSeriousReports = reports.filter(
    (report) =>
      report.status !== CompanySafetyReportStatus.resolved &&
      needsImmediateSafetyGuidance(report.reportType),
  );
  if (activeSeriousReports.length === 0) return null;
  return {
    count: activeSeriousReports.length,
    label: activeSeriousReports.length === 1 ? "安全確認中" : "複数の安全確認中",
  };
}
