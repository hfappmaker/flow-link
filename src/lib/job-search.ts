import type { Prisma } from "@prisma/client";
import {
  canonicalSkillIdsFromSearchQuery,
  canonicalSkillSearchTerms,
  normalizedTextMatchesQuery,
} from "./utils.ts";

export const JOBS_KEYWORD_CANDIDATE_LIMIT = 500;

type SearchableJobText = {
  title?: string | null;
  description?: string | null;
  requiredSkills?: string | null;
  preferredSkills?: string | null;
  location?: string | null;
  companyProfile?: { name?: string | null } | null;
};

export function jobKeywordText(job: SearchableJobText) {
  return [
    job.title,
    job.description,
    job.requiredSkills,
    job.preferredSkills,
    job.location,
    job.companyProfile?.name,
  ].filter(Boolean).join(" ");
}

export function jobMatchesSearchQuery(query: string | null | undefined, job: SearchableJobText) {
  return normalizedTextMatchesQuery(query, jobKeywordText(job));
}

export function filterJobsBySearchQuery<T extends SearchableJobText>(jobs: T[], query: string | null | undefined) {
  const keyword = query?.trim();
  if (!keyword) return jobs;
  return jobs.filter((job) => jobMatchesSearchQuery(keyword, job));
}

export function jobKeywordCandidateWhere(query: string | null | undefined): Prisma.JobPostWhereInput | null {
  const terms = jobKeywordCandidateTerms(query);
  if (terms.length === 0) return null;
  return {
    OR: terms.flatMap((term) => [
      { title: { contains: term, mode: "insensitive" as const } },
      { description: { contains: term, mode: "insensitive" as const } },
      { requiredSkills: { contains: term, mode: "insensitive" as const } },
      { preferredSkills: { contains: term, mode: "insensitive" as const } },
      { location: { contains: term, mode: "insensitive" as const } },
      { companyProfile: { name: { contains: term, mode: "insensitive" as const } } },
    ]),
  };
}

export function jobKeywordCandidateTerms(query: string | null | undefined) {
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
