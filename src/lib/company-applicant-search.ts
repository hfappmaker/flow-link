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
  freelancerProfile: {
    fullName?: string | null;
    desiredOccupation?: string | null;
    skills?: string | null;
    preferredLocation?: string | null;
  };
};

export function applicantKeywordText(application: SearchableApplicant) {
  return [
    application.freelancerProfile.fullName,
    application.freelancerProfile.desiredOccupation,
    application.freelancerProfile.skills,
    application.freelancerProfile.preferredLocation,
    application.proposalMessage,
    application.proposedStart,
  ].filter(Boolean).join(" ");
}

export function applicantMatchesSearchQuery(query: string | null | undefined, application: SearchableApplicant) {
  return normalizedTextMatchesQuery(query, applicantKeywordText(application));
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
      { proposalMessage: { contains: term, mode: "insensitive" as const } },
      { proposedStart: { contains: term, mode: "insensitive" as const } },
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
