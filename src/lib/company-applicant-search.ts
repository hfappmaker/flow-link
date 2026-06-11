import type { Prisma, WorkLocationMode, WorkPreferenceStatus } from "@prisma/client";
import {
  canonicalSkillIdsFromSearchQuery,
  canonicalSkillSearchTerms,
  normalizedTextMatchesQuery,
} from "./utils.ts";

export const COMPANY_APPLICANT_KEYWORD_CANDIDATE_LIMIT = 500;

const WORK_PREFERENCE_STATUS_SEARCH_LABELS: Array<{ value: WorkPreferenceStatus; labels: string[] }> = [
  { value: "active", labels: ["active", "積極的に探している", "募集中", "有効"] },
  { value: "passive", labels: ["passive", "よい案件があれば", "情報収集"] },
  { value: "inactive", labels: ["inactive", "停止中", "積極募集外"] },
];

const WORK_LOCATION_MODE_SEARCH_LABELS: Array<{ value: WorkLocationMode; labels: string[] }> = [
  { value: "remote", labels: ["remote", "リモート中心", "リモート", "フルリモート"] },
  { value: "hybrid", labels: ["hybrid", "一部出社可", "一部出社", "ハイブリッド"] },
  { value: "onsite", labels: ["onsite", "出社可", "出社"] },
  { value: "flexible", labels: ["flexible", "柔軟"] },
];

type SearchableApplicant = {
  proposalMessage?: string | null;
  proposedStart?: string | null;
  rateExpectation?: string | null;
  workloadExpectation?: string | null;
  contactPreference?: string | null;
  freelancerProfile: {
    fullName?: string | null;
    desiredOccupation?: string | null;
    skills?: string | null;
    desiredRate?: string | null;
    availability?: string | null;
    availableFrom?: string | null;
    preferredLocation?: string | null;
    remotePreference?: string | null;
    careerHistory?: {
      summary?: string | null;
      workExperiences?: string | null;
      projects?: string | null;
      certifications?: string | null;
      education?: string | null;
    } | null;
    workPreference?: {
      status?: string | null;
      targetRole?: string | null;
      preferredSkills?: string | null;
      targetRate?: string | null;
      workload?: string | null;
      locationMode?: string | null;
      preferredLocation?: string | null;
      availableFrom?: string | null;
      excludedConditions?: string | null;
    } | null;
  };
};

export function applicantKeywordText(application: SearchableApplicant) {
  return [
    application.freelancerProfile.fullName,
    application.freelancerProfile.desiredOccupation,
    application.freelancerProfile.skills,
    application.freelancerProfile.desiredRate,
    application.freelancerProfile.availability,
    application.freelancerProfile.availableFrom,
    application.freelancerProfile.preferredLocation,
    application.freelancerProfile.remotePreference,
    application.freelancerProfile.careerHistory?.summary,
    application.freelancerProfile.careerHistory?.workExperiences,
    application.freelancerProfile.careerHistory?.projects,
    application.freelancerProfile.careerHistory?.certifications,
    application.freelancerProfile.careerHistory?.education,
    application.freelancerProfile.workPreference?.status,
    application.freelancerProfile.workPreference?.targetRole,
    application.freelancerProfile.workPreference?.preferredSkills,
    application.freelancerProfile.workPreference?.targetRate,
    application.freelancerProfile.workPreference?.workload,
    application.freelancerProfile.workPreference?.locationMode,
    ...workLocationModeKeywordText(application.freelancerProfile.workPreference?.locationMode),
    application.freelancerProfile.workPreference?.preferredLocation,
    application.freelancerProfile.workPreference?.availableFrom,
    application.proposalMessage,
    application.proposedStart,
    application.rateExpectation,
    application.workloadExpectation,
    application.contactPreference,
  ].filter(Boolean).join(" ");
}

export function applicantMatchesSearchQuery(query: string | null | undefined, application: SearchableApplicant) {
  const text = applicantKeywordText(application);
  return normalizedTextMatchesQuery(query, text) || cjkSubstringMatchesQuery(query, text);
}

export function filterApplicantsBySearchQuery<T extends SearchableApplicant>(applications: T[], query: string | null | undefined) {
  const keyword = query?.trim();
  if (!keyword) return applications;
  return applications.filter((application) => applicantMatchesSearchQuery(keyword, application));
}

export function applicantKeywordCandidateWhere(query: string | null | undefined): Prisma.JobApplicationWhereInput | null {
  const terms = applicantKeywordCandidateTerms(query);
  if (terms.length === 0) return null;
  return {
    OR: terms.flatMap((term) => [
      { freelancerProfile: { fullName: { contains: term, mode: "insensitive" as const } } },
      { freelancerProfile: { desiredOccupation: { contains: term, mode: "insensitive" as const } } },
      { freelancerProfile: { skills: { contains: term, mode: "insensitive" as const } } },
      { freelancerProfile: { desiredRate: { contains: term, mode: "insensitive" as const } } },
      { freelancerProfile: { availability: { contains: term, mode: "insensitive" as const } } },
      { freelancerProfile: { availableFrom: { contains: term, mode: "insensitive" as const } } },
      { freelancerProfile: { preferredLocation: { contains: term, mode: "insensitive" as const } } },
      { freelancerProfile: { remotePreference: { contains: term, mode: "insensitive" as const } } },
      { freelancerProfile: { careerHistory: { is: { summary: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { careerHistory: { is: { workExperiences: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { careerHistory: { is: { projects: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { careerHistory: { is: { certifications: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { careerHistory: { is: { education: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { workPreference: { is: { targetRole: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { workPreference: { is: { preferredSkills: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { workPreference: { is: { targetRate: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { workPreference: { is: { workload: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { workPreference: { is: { preferredLocation: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { workPreference: { is: { availableFrom: { contains: term, mode: "insensitive" as const } } } } },
      ...workPreferenceStatusCandidateWhere(term),
      ...workLocationModeCandidateWhere(term),
      { proposalMessage: { contains: term, mode: "insensitive" as const } },
      { proposedStart: { contains: term, mode: "insensitive" as const } },
      { rateExpectation: { contains: term, mode: "insensitive" as const } },
      { workloadExpectation: { contains: term, mode: "insensitive" as const } },
      { contactPreference: { contains: term, mode: "insensitive" as const } },
    ]),
  };
}

function workPreferenceStatusCandidateWhere(term: string): Prisma.JobApplicationWhereInput[] {
  return WORK_PREFERENCE_STATUS_SEARCH_LABELS
    .filter(({ value, labels }) => searchableLabelMatchesTerm(term, [value, ...labels]))
    .map(({ value }) => ({
      freelancerProfile: { workPreference: { is: { status: { equals: value } } } },
    }));
}

function workLocationModeKeywordText(mode: string | null | undefined) {
  return WORK_LOCATION_MODE_SEARCH_LABELS.find(({ value }) => value === mode)?.labels ?? [];
}

function workLocationModeCandidateWhere(term: string): Prisma.JobApplicationWhereInput[] {
  return WORK_LOCATION_MODE_SEARCH_LABELS
    .filter(({ value, labels }) => searchableLabelMatchesTerm(term, [value, ...labels]))
    .map(({ value }) => ({
      freelancerProfile: { workPreference: { is: { locationMode: { equals: value } } } },
    }));
}

function searchableLabelMatchesTerm(term: string, labels: string[]) {
  const normalizedTerm = term.normalize("NFKC").toLocaleLowerCase();
  return labels.some((label) => {
    const normalizedLabel = label.normalize("NFKC").toLocaleLowerCase();
    return normalizedLabel.includes(normalizedTerm) || normalizedTerm.includes(normalizedLabel);
  });
}

export function applicantKeywordCandidateTerms(query: string | null | undefined) {
  const keyword = query?.trim();
  if (!keyword) return [];

  const skillTerms = [...canonicalSkillIdsFromSearchQuery(keyword)].flatMap(canonicalSkillSearchTerms);
  return uniqueSearchTerms([keyword, ...tokenCandidateTerms(keyword), ...skillTerms]);
}

function tokenCandidateTerms(query: string) {
  return query
    .normalize("NFKC")
    .match(/[a-z0-9+#]+|[一-龯ぁ-んァ-ヶー]+/gi)?.filter((token) => token.length >= 2) ?? [];
}

function cjkSubstringMatchesQuery(query: string | null | undefined, text: string | null | undefined) {
  const normalizedQuery = (query ?? "").normalize("NFKC").toLocaleLowerCase().trim();
  const normalizedText = (text ?? "").normalize("NFKC").toLocaleLowerCase();
  if (/[一-龯ぁ-んァ-ヶー]/.test(normalizedQuery) && normalizedText.includes(normalizedQuery)) {
    return true;
  }

  const queryTokens = tokenCandidateTerms(query ?? "");
  if (!queryTokens.some((token) => /[一-龯ぁ-んァ-ヶー]/.test(token))) return false;

  const textTokens = new Set(normalizedText.match(/[a-z0-9+#]+|[一-龯ぁ-んァ-ヶー]+/g) ?? []);
  return queryTokens.every((token) => {
    const normalizedToken = token.toLocaleLowerCase();
    return /[一-龯ぁ-んァ-ヶー]/.test(normalizedToken)
      ? normalizedText.includes(normalizedToken)
      : textTokens.has(normalizedToken);
  });
}

function uniqueSearchTerms(terms: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const term of terms) {
    const normalized = term.trim();
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }
  return unique;
}
