import {
  ApplicationStatus,
  CompanyVerificationKind,
  InterviewMessageType,
  JobApplicationStatus,
  JobPostStatus,
  RecommendationFeedbackReason,
  ResumeDocumentType,
  UserRole,
  WorkLocationMode,
  WorkPreferenceStatus,
} from "@prisma/client";

type EnumObject<T extends string> = Record<string, T>;

function enumValues<T extends string>(values: EnumObject<T>) {
  return Object.values(values) as T[];
}

function toFormText(value: FormDataEntryValue | string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseEnumValue<T extends string>(
  value: FormDataEntryValue | string | null | undefined,
  allowedValues: readonly T[],
) {
  const text = toFormText(value);
  return allowedValues.includes(text as T) ? (text as T) : null;
}

export function parseRequiredEnum<T extends string>(
  value: FormDataEntryValue | string | null | undefined,
  allowedValues: readonly T[],
  errorMessage: string,
) {
  const parsed = parseEnumValue(value, allowedValues);
  if (!parsed) throw new Error(errorMessage);
  return parsed;
}

export const userRoleValues = enumValues(UserRole);
export const resumeDocumentTypeValues = enumValues(ResumeDocumentType);
export const jobPostStatusValues = enumValues(JobPostStatus);
export const applicationStatusValues = enumValues(ApplicationStatus);
export const companyVerificationKindValues = enumValues(CompanyVerificationKind);
export const jobApplicationStatusValues = enumValues(JobApplicationStatus);
export const interviewMessageTypeValues = enumValues(InterviewMessageType);
export const workPreferenceStatusValues = enumValues(WorkPreferenceStatus);
export const workLocationModeValues = enumValues(WorkLocationMode);
export const recommendationFeedbackReasonValues = enumValues(RecommendationFeedbackReason);

// Screening actions intentionally accept only terminal screening outcomes.
export const screeningResultStatusValues = [
  JobApplicationStatus.screening_passed,
  JobApplicationStatus.screening_rejected,
] as const satisfies readonly JobApplicationStatus[];

export function parseUserRole(value: FormDataEntryValue | null) {
  return parseRequiredEnum(value, userRoleValues, "登録内容を確認してください。");
}

export function parseResumeDocumentType(value: FormDataEntryValue | null) {
  return parseRequiredEnum(value, resumeDocumentTypeValues, "PDFファイルを選択してください。");
}

export function parseJobPostStatus(value: FormDataEntryValue | null) {
  return parseRequiredEnum(value, jobPostStatusValues, "公開状態を確認してください。");
}

export function parseApplicationStatus(value: FormDataEntryValue | null) {
  return parseRequiredEnum(value, applicationStatusValues, "応募受付状態を確認してください。");
}

export function parseCompanyVerificationKind(value: FormDataEntryValue | null) {
  return parseRequiredEnum(value, companyVerificationKindValues, "確認リクエストの種類を確認してください。");
}

export function parseScreeningResultStatus(value: FormDataEntryValue | null) {
  return parseRequiredEnum(value, screeningResultStatusValues, "選考結果が不正です。");
}

export function parseInterviewMessageType(value: FormDataEntryValue | null) {
  return parseRequiredEnum(value, interviewMessageTypeValues, "メッセージ種別が不正です。");
}

export function parseWorkPreferenceStatus(value: FormDataEntryValue | null) {
  return parseRequiredEnum(value, workPreferenceStatusValues, "仕事探しステータスを確認してください。");
}

export function parseWorkLocationMode(value: FormDataEntryValue | null) {
  return parseRequiredEnum(value, workLocationModeValues, "希望する働き方を確認してください。");
}

export function parseRecommendationFeedbackReason(value: FormDataEntryValue | null) {
  return parseRequiredEnum(value, recommendationFeedbackReasonValues, "推薦フィードバックの理由を確認してください。");
}

export function parseJobApplicationStatusFilter(
  value: string | null | undefined,
  allowedValues: readonly JobApplicationStatus[],
) {
  return parseEnumValue(value, allowedValues) ?? "all";
}
