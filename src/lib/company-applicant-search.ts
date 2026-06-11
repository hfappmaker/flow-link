import type { Prisma } from "@prisma/client";
import {
  canonicalSkillIdsFromSearchQuery,
  canonicalSkillSearchTerms,
  normalizedTextMatchesQuery,
} from "./utils.ts";

export const COMPANY_APPLICANT_KEYWORD_CANDIDATE_LIMIT = 500;

type SearchableApplicant = {
  proposalMessage?: string | null;
  proposedStart?: string | null;
  rateExpectation?: string | null;
  workloadExpectation?: string | null;
  freelancerProfile: {
    fullName?: string | null;
    desiredOccupation?: string | null;
    skills?: string | null;
    preferredLocation?: string | null;
    careerHistory?: {
      summary?: string | null;
      workExperiences?: string | null;
      projects?: string | null;
      certifications?: string | null;
      education?: string | null;
    } | null;
  };
};

export function applicantKeywordText(application: SearchableApplicant) {
  return [
    application.freelancerProfile.fullName,
    application.freelancerProfile.desiredOccupation,
    application.freelancerProfile.skills,
    application.freelancerProfile.preferredLocation,
    application.freelancerProfile.careerHistory?.summary,
    application.freelancerProfile.careerHistory?.workExperiences,
    application.freelancerProfile.careerHistory?.projects,
    application.freelancerProfile.careerHistory?.certifications,
    application.freelancerProfile.careerHistory?.education,
    application.proposalMessage,
    application.proposedStart,
    application.rateExpectation,
    application.workloadExpectation,
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
      { freelancerProfile: { preferredLocation: { contains: term, mode: "insensitive" as const } } },
      { freelancerProfile: { careerHistory: { is: { summary: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { careerHistory: { is: { workExperiences: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { careerHistory: { is: { projects: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { careerHistory: { is: { certifications: { contains: term, mode: "insensitive" as const } } } } },
      { freelancerProfile: { careerHistory: { is: { education: { contains: term, mode: "insensitive" as const } } } } },
      { proposalMessage: { contains: term, mode: "insensitive" as const } },
      { proposedStart: { contains: term, mode: "insensitive" as const } },
      { rateExpectation: { contains: term, mode: "insensitive" as const } },
      { workloadExpectation: { contains: term, mode: "insensitive" as const } },
    ]),
  };
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
  const queryTokens = tokenCandidateTerms(query ?? "");
  if (!queryTokens.some((token) => /[一-龯ぁ-んァ-ヶー]/.test(token))) return false;

  const normalizedText = (text ?? "").normalize("NFKC").toLocaleLowerCase();
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
