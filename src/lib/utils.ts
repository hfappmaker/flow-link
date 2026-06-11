import type { Prisma } from "@prisma/client";
import { clsx, type ClassValue } from "clsx";
import { rateFitTone } from "./rates.ts";
import { normalizeWorkLocation } from "./work-location.ts";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function toText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function toOptionalText(value: FormDataEntryValue | null) {
  const text = toText(value);
  return text.length ? text : null;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function daysSince(value: Date | string | null | undefined, now = new Date()) {
  if (!value) return 0;
  const startedAt = new Date(value).getTime();
  if (Number.isNaN(startedAt)) return 0;
  return Math.max(0, Math.floor((now.getTime() - startedAt) / (1000 * 60 * 60 * 24)));
}

export function buildApplicationResponseState({
  appliedAt,
  status,
}: {
  appliedAt: Date | string | null | undefined;
  status?: string | null;
}) {
  if (status && status !== "applied") {
    return {
      daysWaiting: 0,
      label: "対応済み",
      detail: "選考結果は更新済みです。",
      tone: "good" as const,
      priorityBoost: 0,
    };
  }

  const daysWaiting = daysSince(appliedAt);
  if (daysWaiting >= 5) {
    return {
      daysWaiting,
      label: "至急対応",
      detail: `応募から${daysWaiting}日経過しています。今日中に面談判断または見送りを更新してください。`,
      tone: "bad" as const,
      priorityBoost: 25,
    };
  }
  if (daysWaiting >= 3) {
    return {
      daysWaiting,
      label: "対応期限",
      detail: `応募から${daysWaiting}日経過しています。面談へ進めるか確認してください。`,
      tone: "warn" as const,
      priorityBoost: 15,
    };
  }
  return {
    daysWaiting,
    label: daysWaiting === 0 ? "本日応募" : `${daysWaiting}日経過`,
    detail: "応募内容と確認点を見て、早めに次の連絡へ進めてください。",
    tone: "neutral" as const,
    priorityBoost: daysWaiting * 3,
  };
}

export function skillPreview(value: string | null | undefined, limit = 3) {
  return parseSkills(value).slice(0, limit);
}

const SKILL_ALIAS_TO_CANONICAL_ID: Record<string, string> = {
  aws: "aws",
  awslambda: "aws-lambda",
  ec2: "aws-ec2",
  javascript: "javascript",
  js: "javascript",
  nextjs: "nextjs",
  node: "nodejs",
  nodejs: "nodejs",
  react: "react",
  reactnative: "react-native",
  ts: "typescript",
  typescript: "typescript",
  vue: "vue",
  vuejs: "vue",
};

// Skill fit is exact by canonical id: aliases match, but parent/child skills do not.
export function parseSkills(value: string | null | undefined) {
  if (!value) return [];
  return Array.from(new Set(value
    .split(/[\n,、／/]+/)
    .map((skill) => skill.trim())
    .filter(Boolean)));
}

export function canonicalSkillId(skill: string | null | undefined) {
  const key = normalizeSkillAliasKey(skill);
  return key ? SKILL_ALIAS_TO_CANONICAL_ID[key] ?? key : "";
}

export function canonicalSkillIds(value: string | null | undefined) {
  return new Set(parseSkills(value).map(canonicalSkillId).filter(Boolean));
}

export function matchedSkills(requiredSkills: string | null | undefined, freelancerSkills: string | null | undefined) {
  const freelancerSkillSet = canonicalSkillIds(freelancerSkills);
  return parseSkills(requiredSkills).filter((skill) => freelancerSkillSet.has(canonicalSkillId(skill)));
}

export function unmatchedSkills(requiredSkills: string | null | undefined, freelancerSkills: string | null | undefined) {
  const freelancerSkillSet = canonicalSkillIds(freelancerSkills);
  return parseSkills(requiredSkills).filter((skill) => !freelancerSkillSet.has(canonicalSkillId(skill)));
}

export function skillMatchPercent(requiredSkills: string | null | undefined, freelancerSkills: string | null | undefined) {
  const requiredSkillCount = parseSkills(requiredSkills).length;
  if (requiredSkillCount === 0) return null;
  return Math.round((matchedSkills(requiredSkills, freelancerSkills).length / requiredSkillCount) * 100);
}

export function normalizedTextMatchesQuery(query: string | null | undefined, text: string | null | undefined) {
  const queryTokens = normalizedSearchTokens(query);
  if (queryTokens.length === 0) return true;

  const textTokens = new Set(normalizedSearchTokens(text));
  if (queryTokens.every((token) => textTokens.has(token))) return true;

  const querySkills = canonicalSkillIdsFromAliasTokens(queryTokens);
  if (!querySkills || querySkills.size === 0) return false;

  const textSkills = canonicalSkillIdsFromText(text);
  return [...querySkills].every((skillId) => textSkills.has(skillId));
}

function normalizeSkillAliasKey(skill: string | null | undefined) {
  return normalizeSearchText(skill).replace(/[^a-z0-9+#]/g, "");
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/([a-z0-9])\.([a-z0-9])/g, "$1$2");
}

function normalizedSearchTokens(value: string | null | undefined) {
  return normalizeSearchText(value).match(/[a-z0-9+#]+|[一-龯ぁ-んァ-ヶー]+/g) ?? [];
}

function canonicalSkillIdsFromText(value: string | null | undefined) {
  const tokens = normalizedSearchTokens(value);
  const ids = new Set<string>();
  for (let index = 0; index < tokens.length; index += 1) {
    for (const length of [1, 2, 3]) {
      const phraseKey = tokens.slice(index, index + length).join("");
      const canonical = SKILL_ALIAS_TO_CANONICAL_ID[phraseKey];
      if (canonical) ids.add(canonical);
    }
  }
  return ids;
}

function canonicalSkillIdsFromAliasTokens(tokens: string[]) {
  const ids = new Set<string>();
  for (let index = 0; index < tokens.length;) {
    let matched: string | null = null;
    let matchedLength = 0;
    for (let length = Math.min(3, tokens.length - index); length >= 1; length -= 1) {
      const phraseKey = tokens.slice(index, index + length).join("");
      const canonical = SKILL_ALIAS_TO_CANONICAL_ID[phraseKey];
      if (canonical) {
        matched = canonical;
        matchedLength = length;
        break;
      }
    }
    if (!matched) return null;
    ids.add(matched);
    index += matchedLength;
  }
  return ids;
}

type ApplicationReviewInput = {
  status?: string | null;
  proposalMessage?: string | null;
  proposedStart?: string | null;
  freelancerProfile: {
    skills?: string | null;
    availableFrom?: string | null;
    availability?: string | null;
    careerHistory?: unknown | null;
    documents?: unknown[] | null;
  };
  jobPost: {
    requiredSkills?: string | null;
  };
};

export function buildApplicationReview(application: ApplicationReviewInput) {
  const requiredSkills = parseSkills(application.jobPost.requiredSkills);
  const requiredSkillMatches = matchedSkills(application.jobPost.requiredSkills, application.freelancerProfile.skills);
  const matchPercent = skillMatchPercent(application.jobPost.requiredSkills, application.freelancerProfile.skills);
  const missingSkillCount = Math.max(0, requiredSkills.length - requiredSkillMatches.length);
  const reviewSignals = [
    { done: requiredSkills.length === 0 || requiredSkillMatches.length > 0, nextCheck: "必須スキルの補足" },
    { done: (application.freelancerProfile.documents?.length ?? 0) >= 2, nextCheck: "PDF書類" },
    { done: Boolean(application.freelancerProfile.careerHistory), nextCheck: "職務経歴" },
    { done: Boolean(application.proposalMessage), nextCheck: "応募時の提案" },
    {
      done: Boolean(
        application.proposedStart ||
          application.freelancerProfile.availableFrom ||
          application.freelancerProfile.availability,
      ),
      nextCheck: "開始条件",
    },
  ];
  const interviewReadinessPercent = Math.round((reviewSignals.filter((signal) => signal.done).length / reviewSignals.length) * 100);

  return {
    requiredSkillMatches,
    matchPercent,
    interviewReadinessPercent,
    isInterviewReady: interviewReadinessPercent >= 80 && application.status === "applied",
    nextChecks: reviewSignals.filter((signal) => !signal.done).map((signal) => signal.nextCheck),
    reviewQuestions: [
      ...(missingSkillCount > 0
        ? [`必須スキルの未一致 ${missingSkillCount}件について、近い実務経験や補完できる進め方を確認する`]
        : []),
      ...(!application.proposedStart && !application.freelancerProfile.availableFrom && !application.freelancerProfile.availability
        ? ["稼働開始時期と週あたりの稼働量を確認する"]
        : []),
      ...(!application.proposalMessage
        ? ["この案件で最初に任せたい業務への貢献イメージを確認する"]
        : []),
      ...((application.freelancerProfile.documents?.length ?? 0) < 2
        ? ["履歴書・職務経歴書の不足分を面談前に共有できるか確認する"]
        : []),
      ...(!application.freelancerProfile.careerHistory
        ? ["直近プロジェクトの役割、担当範囲、成果を確認する"]
        : []),
      ...(application.proposedStart || application.freelancerProfile.availableFrom || application.freelancerProfile.availability
        ? ["開始条件、契約・支払い条件、面談候補日時をすり合わせる"]
        : []),
    ].slice(0, 4),
  };
}

export function formatOpenings(value: number | null | undefined) {
  return value ? `${value}名` : "未設定";
}

type DirectContractChecklistInput = {
  description?: string | null;
  requiredSkills?: string | null;
  rate?: string | null;
  workload?: string | null;
  contractPeriod?: string | null;
  selectionFlow?: string | null;
  contractTerms?: string | null;
  location?: string | null;
  remotePolicy?: string | null;
};

type DirectContractChecklistField = keyof DirectContractChecklistInput;

function directContractFieldPresentWhere(field: DirectContractChecklistField): Prisma.JobPostWhereInput {
  if (field === "description") {
    return { [field]: { not: "" } };
  }

  return {
    AND: [{ [field]: { not: null } }, { [field]: { not: "" } }],
  };
}

export function directContractReadyJobWhere() {
  return {
    AND: [
      directContractFieldPresentWhere("description"),
      directContractFieldPresentWhere("requiredSkills"),
      directContractFieldPresentWhere("rate"),
      directContractFieldPresentWhere("workload"),
      directContractFieldPresentWhere("contractPeriod"),
      directContractFieldPresentWhere("selectionFlow"),
      directContractFieldPresentWhere("contractTerms"),
      {
        OR: [directContractFieldPresentWhere("location"), directContractFieldPresentWhere("remotePolicy")],
      },
    ],
  } satisfies Prisma.JobPostWhereInput;
}

export function directContractChecklist(job: DirectContractChecklistInput) {
  const items = [
    {
      key: "scope",
      label: "業務範囲",
      detail: "業務内容と必須スキルで、任せたい役割が判断できる",
      done: Boolean(job.description && job.requiredSkills),
    },
    {
      key: "compensation",
      label: "報酬・支払い",
      detail: "単価と契約・支払い条件が提示されている",
      done: Boolean(job.rate && job.contractTerms),
    },
    {
      key: "workload",
      label: "稼働条件",
      detail: "稼働率と契約期間が応募前に確認できる",
      done: Boolean(job.workload && job.contractPeriod),
    },
    {
      key: "process",
      label: "選考フロー",
      detail: "面談回数や判断までの流れが明記されている",
      done: Boolean(job.selectionFlow),
    },
    {
      key: "place",
      label: "働き方",
      detail: "勤務地またはリモート条件が明記されている",
      done: Boolean(job.location || job.remotePolicy),
    },
  ];
  const completed = items.filter((item) => item.done).length;

  return {
    items,
    completed,
    total: items.length,
    percent: Math.round((completed / items.length) * 100),
    isReady: completed === items.length,
  };
}

export const COMPANY_VERIFICATION_RENEWAL_DAYS = 180;

export type CompanyVerificationKindText = "company_identity" | "payment_policy";
export type CompanyVerificationStatusText = "submitted" | "confirmed" | "rejected" | "needs_renewal";

export type CompanyVerificationRequestInput = {
  kind: CompanyVerificationKindText;
  status: CompanyVerificationStatusText;
  evidenceSummary?: string | null;
  confirmedScope?: string | null;
  reviewerNotes?: string | null;
  reasonCode?: string | null;
  reviewedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type CompanyTrustInput = {
  description?: string | null;
  websiteUrl?: string | null;
  contactTeam?: string | null;
  operatingArea?: string | null;
  paymentPolicy?: string | null;
  flowLinkReviewedCompanyAt?: Date | string | null;
  flowLinkReviewedCompanyScope?: string | null;
  flowLinkReviewedPaymentAt?: Date | string | null;
  flowLinkReviewedPaymentScope?: string | null;
  updatedAt?: Date | string | null;
  verificationRequests?: CompanyVerificationRequestInput[] | null;
};

export type JobTrustInput = {
  rate?: string | null;
  workload?: string | null;
  contractPeriod?: string | null;
  selectionFlow?: string | null;
  contractTerms?: string | null;
  location?: string | null;
  remotePolicy?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

export type TrustConfidenceStatus = "confirmed" | "pending" | "selfReported" | "missing" | "stale" | "rejected";
export type TrustConfidenceTone = "neutral" | "good" | "warn" | "bad";

export function latestVerificationRequest(
  requests: CompanyVerificationRequestInput[] | null | undefined,
  kind: CompanyVerificationKindText,
) {
  return [...(requests ?? [])]
    .filter((request) => request.kind === kind)
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0] ?? null;
}

export function buildTrustConfidence({
  company,
  job,
  now = new Date(),
}: {
  company: CompanyTrustInput;
  job: JobTrustInput;
  now?: Date;
}) {
  const companyRequest = latestVerificationRequest(company.verificationRequests, "company_identity");
  const paymentRequest = latestVerificationRequest(company.verificationRequests, "payment_policy");
  const companyReviewed = Boolean(company.flowLinkReviewedCompanyAt);
  const paymentReviewed = Boolean(company.flowLinkReviewedPaymentAt);
  const companyStale = companyReviewed && isTrustEvidenceStale(company.flowLinkReviewedCompanyAt, companyRequest?.expiresAt, now);
  const paymentStale = paymentReviewed && isTrustEvidenceStale(company.flowLinkReviewedPaymentAt, paymentRequest?.expiresAt, now);
  const companySelfReported = Boolean(company.description || company.websiteUrl || company.contactTeam || company.operatingArea);
  const paymentSelfReported = Boolean(company.paymentPolicy || job.contractTerms);
  const conditionCount = [job.rate, job.workload, job.contractPeriod, job.location || job.remotePolicy].filter(Boolean).length;
  const companyStatus = trustStatusForEvidence({
    hasReviewedAt: companyReviewed,
    now,
    stale: companyStale,
    selfReported: companySelfReported,
    request: companyRequest,
  });
  const paymentStatus = trustStatusForEvidence({
    hasReviewedAt: paymentReviewed,
    now,
    stale: paymentStale,
    selfReported: paymentSelfReported,
    request: paymentRequest,
  });
  const conditionStatus: TrustConfidenceStatus = conditionCount >= 3 ? "selfReported" : "missing";
  const statusScore = trustStatusScore(companyStatus) + trustStatusScore(paymentStatus) + (conditionCount >= 3 ? 15 : 0);
  const label =
    companyStatus === "confirmed" && paymentStatus === "confirmed"
      ? "Flow Link確認済み"
      : [companyStatus, paymentStatus].includes("pending")
        ? "確認リクエスト中"
        : [companyStatus, paymentStatus].includes("rejected")
          ? "再提出が必要"
          : [companyStatus, paymentStatus].includes("stale")
            ? "更新確認が必要"
            : [companyStatus, paymentStatus, conditionStatus].includes("missing")
              ? "要確認あり"
              : [companyStatus, paymentStatus].includes("confirmed")
                ? "一部確認済み"
                : "自己申告のみ";
  const tone: TrustConfidenceTone =
    companyStatus === "confirmed" && paymentStatus === "confirmed"
      ? "good"
      : [companyStatus, paymentStatus].includes("rejected")
        ? "bad"
        : [companyStatus, paymentStatus, conditionStatus].includes("missing") || [companyStatus, paymentStatus].includes("stale")
          ? "warn"
          : "neutral";

  const items: Array<{ label: string; detail: string; status: TrustConfidenceStatus }> = [
    {
      label: "会社・Web公開情報",
      detail: trustDetail({
        confirmedFallback: "会社概要、公開Webサイト、連絡窓口の整合性をFlow Linkが確認しました。",
        missingText: "会社概要、公開Webサイト、担当窓口、所在地・稼働エリアが未記載です。応募前に外部で確認できる材料が不足しています。",
        request: companyRequest,
        reviewedAt: company.flowLinkReviewedCompanyAt,
        scope: company.flowLinkReviewedCompanyScope,
        selfReportedText: [company.description, company.websiteUrl, company.contactTeam, company.operatingArea].filter(Boolean).join(" / "),
        status: companyStatus,
      }),
      status: companyStatus,
    },
    {
      label: "支払い・契約条件",
      detail: trustDetail({
        confirmedFallback: "請求締め、支払い時期、契約条件の説明をFlow Linkが確認しました。",
        missingText: "契約・支払い条件、請求方針が未記載です。支払い時期、請求方法、契約主体を応募前または面談で確認してください。",
        request: paymentRequest,
        reviewedAt: company.flowLinkReviewedPaymentAt,
        scope: company.flowLinkReviewedPaymentScope,
        selfReportedText: [job.contractTerms && `案件条件: ${job.contractTerms}`, company.paymentPolicy && `企業方針: ${company.paymentPolicy}`].filter(Boolean).join(" / "),
        status: paymentStatus,
      }),
      status: paymentStatus,
    },
    {
      label: "案件条件の具体性",
      detail:
        conditionCount >= 3
          ? `単価・稼働率・期間・働き方のうち${conditionCount}/4項目が記載されています。`
          : `単価・稼働率・期間・働き方の記載は${conditionCount}/4項目です。不足条件は応募前または面談で確認してください。`,
      status: conditionStatus,
    },
    {
      label: "掲載・更新日",
      detail: `掲載: ${formatDateTime(job.createdAt)} / 更新: ${formatDateTime(job.updatedAt)} / 会社情報更新: ${formatDateTime(company.updatedAt)}`,
      status: "selfReported",
    },
  ];

  return {
    items,
    label,
    tone,
    score: Math.max(0, Math.min(100, statusScore)),
    companyStatus,
    paymentStatus,
  };
}

export function trustRecommendationAdjustment(confidence: Pick<ReturnType<typeof buildTrustConfidence>, "companyStatus" | "paymentStatus">) {
  const statuses = [confidence.companyStatus, confidence.paymentStatus];
  if (statuses.every((status) => status === "confirmed")) return 10;
  if (statuses.includes("rejected")) return -18;
  if (statuses.includes("stale")) return -10;
  if (statuses.includes("missing")) return -8;
  if (statuses.includes("pending")) return 0;
  return -4;
}

function isTrustEvidenceStale(reviewedAt: Date | string | null | undefined, expiresAt: Date | string | null | undefined, now: Date) {
  if (expiresAt) return new Date(expiresAt).getTime() <= now.getTime();
  return daysSince(reviewedAt, now) >= COMPANY_VERIFICATION_RENEWAL_DAYS;
}

function trustStatusForEvidence({
  hasReviewedAt,
  now,
  request,
  selfReported,
  stale,
}: {
  hasReviewedAt: boolean;
  now: Date;
  request?: CompanyVerificationRequestInput | null;
  selfReported: boolean;
  stale: boolean;
}): TrustConfidenceStatus {
  if (hasReviewedAt && !stale) return "confirmed";
  if (hasReviewedAt && stale) return "stale";
  if (request?.status === "submitted") return "pending";
  if (request?.status === "confirmed") return request.expiresAt && isTrustEvidenceStale(request.reviewedAt, request.expiresAt, now) ? "stale" : "confirmed";
  if (request?.status === "needs_renewal") return "stale";
  if (request?.status === "rejected") return "rejected";
  return selfReported ? "selfReported" : "missing";
}

function trustStatusScore(status: TrustConfidenceStatus) {
  const scores: Record<TrustConfidenceStatus, number> = {
    confirmed: 40,
    pending: 24,
    selfReported: 18,
    stale: 12,
    missing: 0,
    rejected: 0,
  };
  return scores[status];
}

function trustDetail({
  confirmedFallback,
  missingText,
  request,
  reviewedAt,
  scope,
  selfReportedText,
  status,
}: {
  confirmedFallback: string;
  missingText: string;
  request?: CompanyVerificationRequestInput | null;
  reviewedAt?: Date | string | null;
  scope?: string | null;
  selfReportedText: string;
  status: TrustConfidenceStatus;
}) {
  if (status === "confirmed") {
    return `${scope || request?.confirmedScope || confirmedFallback} 確認日: ${formatDateTime(reviewedAt ?? request?.reviewedAt)}`;
  }
  if (status === "pending") {
    return `Flow Linkへ確認リクエストが提出されています。提出内容: ${request?.evidenceSummary || "確認待ち"}。確認中も支払い保証や法務確認を示すものではありません。`;
  }
  if (status === "stale") {
    return `過去の確認から${COMPANY_VERIFICATION_RENEWAL_DAYS}日以上、または有効期限を過ぎています。最新の契約・支払い条件を面談で確認してください。`;
  }
  if (status === "rejected") {
    return `提出内容は再確認が必要です。理由: ${request?.reasonCode || request?.reviewerNotes || "根拠不足"}。応募前に追加説明を確認してください。`;
  }
  if (status === "selfReported") return selfReportedText;
  return missingText;
}

type DirectMatchScoreInput = DirectContractChecklistInput & {
  applicationStatus?: string | null;
  freelancerReadinessPercent?: number | null;
  freelancerSkills?: string | null;
};

export function directMatchScore(job: DirectMatchScoreInput) {
  const skillPercent = skillMatchPercent(job.requiredSkills, job.freelancerSkills);
  const contractPercent = directContractChecklist(job).percent;
  const readinessPercent = job.freelancerReadinessPercent ?? 0;
  const applicationOpenBonus = job.applicationStatus === "open" ? 5 : 0;
  const weightedSkill = skillPercent === null ? 20 : skillPercent * 0.45;
  const weightedContract = contractPercent * 0.35;
  const weightedReadiness = readinessPercent * 0.15;

  return Math.min(100, Math.round(weightedSkill + weightedContract + weightedReadiness + applicationOpenBonus));
}

export type WorkPreferenceInput = {
  status?: string | null;
  targetRole?: string | null;
  preferredSkills?: string | null;
  targetRate?: string | null;
  workload?: string | null;
  locationMode?: string | null;
  preferredLocation?: string | null;
  availableFrom?: string | null;
  excludedConditions?: string | null;
  notificationCadence?: string | null;
  privateNotes?: string | null;
  lastConfirmedAt?: Date | string | null;
  updatedAt?: Date | string | null;
} | null | undefined;

type PreferenceAwareMatchInput = DirectMatchScoreInput & {
  title?: string | null;
  preferredSkills?: string | null;
  location?: string | null;
  remotePolicy?: string | null;
  workPreference?: WorkPreferenceInput;
};

type PreferenceReason = {
  label: string;
  detail: string;
  tone: "good" | "neutral" | "warn";
};

export function workPreferenceCompleteness(preference: WorkPreferenceInput, now = new Date()) {
  const checks = [
    Boolean(preference?.status),
    Boolean(preference?.targetRole),
    parseSkills(preference?.preferredSkills).length > 0,
    Boolean(preference?.targetRate),
    Boolean(preference?.workload),
    Boolean(preference?.locationMode && preference.locationMode !== "flexible") || Boolean(preference?.preferredLocation),
    Boolean(preference?.availableFrom),
  ];
  const completed = checks.filter(Boolean).length;
  const referenceDate = preference?.lastConfirmedAt ?? preference?.updatedAt;
  const stale = !referenceDate || daysSince(referenceDate, now) >= 30;

  return {
    completed,
    total: checks.length,
    percent: Math.round((completed / checks.length) * 100),
    missing: checks.length - completed,
    stale,
    usable: Boolean(preference) && completed >= 3 && !stale && preference?.status !== "inactive",
  };
}

export function preferenceAwareMatchScore(job: PreferenceAwareMatchInput) {
  const baseScore = directMatchScore(job);
  const preferenceFit = buildPreferenceFit(job);
  const adjustment = preferenceFit.reasons.reduce((score, reason) => {
    if (reason.tone === "good") return score + 4;
    if (reason.tone === "warn") return score - 8;
    return score;
  }, job.workPreference?.status === "inactive" ? -20 : 0);

  return Math.max(0, Math.min(100, baseScore + adjustment));
}

export function buildPreferenceFit(job: PreferenceAwareMatchInput) {
  const preference = job.workPreference;
  const completeness = workPreferenceCompleteness(preference);
  if (!preference || completeness.completed === 0) {
    return {
      completeness,
      status: "missing" as const,
      reasons: [
        {
          label: "希望条件未設定",
          detail: "仕事探しの希望条件を保存すると、単価・稼働量・勤務地も含めて候補を並べ替えます。",
          tone: "neutral" as const,
        },
      ],
    };
  }

  const text = [
    job.title,
    job.description,
    job.requiredSkills,
    job.preferredSkills,
    job.rate,
    job.workload,
    job.location,
    job.remotePolicy,
  ].filter(Boolean).join(" ").toLowerCase();
  const reasons: PreferenceReason[] = [];
  const preferredSkills = parseSkills(preference.preferredSkills);
  const matchedPreferredSkills = matchedSkills([job.requiredSkills, job.preferredSkills].filter(Boolean).join(","), preference.preferredSkills);

  if (preference.status === "inactive") {
    reasons.push({
      label: "現在は積極募集外",
      detail: "仕事探しステータスが停止中です。応募前に現在の募集状況を更新してください。",
      tone: "warn",
    });
  } else if (preference.status === "active") {
    reasons.push({
      label: "積極的に探している",
      detail: "現在の仕事探しステータスが有効です。",
      tone: "good",
    });
  }

  if (preference.targetRole) {
    reasons.push(
      includesAny(text, parseSkills(preference.targetRole))
        ? {
            label: "希望ロール一致",
            detail: `${preference.targetRole}に近い案件です。`,
            tone: "good",
          }
        : {
            label: "ロール要確認",
            detail: `希望ロール（${preference.targetRole}）との近さを詳細で確認してください。`,
            tone: "neutral",
          },
    );
  }

  if (preferredSkills.length > 0) {
    reasons.push(
      matchedPreferredSkills.length > 0
        ? {
            label: "希望スキル一致",
            detail: matchedPreferredSkills.slice(0, 4).join("、"),
            tone: "good",
          }
        : {
            label: "希望スキル不足",
            detail: `${preferredSkills.slice(0, 3).join("、")}の記載は見つかっていません。`,
            tone: "warn",
          },
    );
  }

  const rateTone = rateFitTone(preference.targetRate, job.rate);
  if (preference.targetRate) {
    reasons.push({
      label: rateTone === "good" ? "単価条件に近い" : rateTone === "warn" ? "単価ミスマッチ" : "単価要確認",
      detail: `希望: ${preference.targetRate} / 案件: ${job.rate || "未設定"}`,
      tone: rateTone,
    });
  }

  const workloadTone = textFitTone(preference.workload, job.workload);
  if (preference.workload) {
    reasons.push({
      label: workloadTone === "good" ? "稼働量に近い" : workloadTone === "warn" ? "稼働量ミスマッチ" : "稼働量要確認",
      detail: `希望: ${preference.workload} / 案件: ${job.workload || "未設定"}`,
      tone: workloadTone,
    });
  }

  if (preference.locationMode && preference.locationMode !== "flexible") {
    const locationTone = locationFitTone(preference, job);
    reasons.push({
      label: locationTone === "good" ? "働き方に近い" : locationTone === "warn" ? "働き方ミスマッチ" : "働き方要確認",
      detail: `希望: ${locationModeLabel(preference.locationMode)}${preference.preferredLocation ? ` / ${preference.preferredLocation}` : ""} / 案件: ${
        [job.location, job.remotePolicy].filter(Boolean).join(" / ") || "未設定"
      }`,
      tone: locationTone,
    });
  } else if (preference.preferredLocation) {
    const locationTone = textFitTone(preference.preferredLocation, [job.location, job.remotePolicy].filter(Boolean).join(" "));
    reasons.push({
      label: locationTone === "good" ? "勤務地に近い" : locationTone === "warn" ? "勤務地ミスマッチ" : "勤務地要確認",
      detail: `希望: ${preference.preferredLocation} / 案件: ${job.location || job.remotePolicy || "未設定"}`,
      tone: locationTone,
    });
  }

  if (preference.availableFrom) {
    reasons.push({
      label: job.contractPeriod || job.applicationStatus === "open" ? "開始時期を相談可" : "開始時期要確認",
      detail: `希望開始: ${preference.availableFrom} / 契約期間: ${job.contractPeriod || "未設定"}`,
      tone: job.contractPeriod || job.applicationStatus === "open" ? "neutral" : "warn",
    });
  }

  const exclusions = parseSkills(preference.excludedConditions);
  const matchedExclusions = exclusions.filter((condition) => text.includes(condition.toLowerCase()));
  if (matchedExclusions.length > 0) {
    reasons.push({
      label: "避けたい条件あり",
      detail: matchedExclusions.slice(0, 3).join("、"),
      tone: "warn",
    });
  }

  if (completeness.stale) {
    reasons.unshift({
      label: "希望条件が古い可能性",
      detail: "30日以上確認されていないため、候補の優先度は控えめに扱います。",
      tone: "warn",
    });
  }

  return {
    completeness,
    status: completeness.usable ? "usable" as const : "low-confidence" as const,
    reasons: reasons.length > 0 ? reasons.slice(0, 7) : [
      {
        label: "条件の手がかり不足",
        detail: "希望条件をもう少し保存すると、理由付きで候補を比較できます。",
        tone: "neutral" as const,
      },
    ],
  };
}

export function visiblePreferenceReasons(job: PreferenceAwareMatchInput, limit = 4) {
  return buildPreferenceFit(job).reasons.slice(0, limit);
}

export function locationModeLabel(mode?: string | null) {
  const labels: Record<string, string> = {
    remote: "リモート中心",
    hybrid: "一部出社可",
    onsite: "出社可",
    flexible: "柔軟",
  };
  return mode ? labels[mode] ?? mode : "未設定";
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => normalizedTextMatchesQuery(word, text));
}

function textFitTone(preference?: string | null, jobValue?: string | null): PreferenceReason["tone"] {
  if (!preference) return "neutral";
  if (!jobValue) return "neutral";
  const preferenceTokens = parseSkills(preference);
  if (preferenceTokens.length > 0 && preferenceTokens.some((token) => normalizedTextMatchesQuery(token, jobValue))) return "good";
  if (hasNumericOverlap(preference, jobValue)) return "good";
  return "warn";
}

function locationFitTone(preference: NonNullable<WorkPreferenceInput>, job: PreferenceAwareMatchInput): PreferenceReason["tone"] {
  const workLocation = normalizeWorkLocation(job);
  if (workLocation.kind === "unknown") return "neutral";
  if (preference.locationMode === "remote") {
    return workLocation.remoteCompatible ? "good" : "warn";
  }
  if (preference.locationMode === "onsite") {
    if (workLocation.kind === "onsite_required" || workLocation.kind === "hybrid" || workLocation.kind === "remote_not_allowed") return "good";
    if (workLocation.kind === "remote_required_or_primary") return "warn";
    return "neutral";
  }
  if (preference.locationMode === "hybrid") {
    if (workLocation.kind === "hybrid") return "good";
    if (workLocation.kind === "onsite_required" || workLocation.kind === "remote_not_allowed") return "warn";
    return "neutral";
  }
  return "neutral";
}

function hasNumericOverlap(left: string, right: string) {
  const leftNumbers: string[] = left.match(/\d+/g) ?? [];
  const rightNumbers: string[] = right.match(/\d+/g) ?? [];
  return leftNumbers.some((number) => rightNumbers.includes(number));
}

export function applicationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    applied: "応募済み",
    screening_passed: "書類選考OK",
    screening_rejected: "書類選考NG",
    withdrawn: "辞退",
  };
  return labels[status] ?? status;
}

export function jobStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "下書き",
    published: "公開中",
    private: "非公開",
    closed: "クローズ",
  };
  return labels[status] ?? status;
}

export function buildScreeningPassedHandoffMessage({
  companyName,
  freelancerName,
  jobTitle,
  proposedStart,
  contactPreference,
  selectionFlow,
  contractTerms,
}: {
  companyName: string;
  freelancerName: string;
  jobTitle: string;
  proposedStart?: string | null;
  contactPreference?: string | null;
  selectionFlow?: string | null;
  contractTerms?: string | null;
}) {
  return [
    `${freelancerName}さん`,
    "",
    `${jobTitle}へのご応募ありがとうございます。書類確認が完了しましたので、${companyName}と面談調整を進めさせてください。`,
    "",
    `応募時の開始目安: ${proposedStart || "面談で確認"}`,
    `応募時の連絡希望: ${contactPreference || "このチャットで調整"}`,
    `選考フロー: ${selectionFlow || "面談で確認"}`,
    `契約・支払い条件: ${contractTerms || "面談で確認"}`,
    "",
    "まずは候補日時と、面談前に確認したい条件があればこのチャットで共有してください。",
    companyName,
  ].join("\n");
}
