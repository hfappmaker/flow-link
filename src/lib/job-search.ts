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
  rate?: string | null;
  workload?: string | null;
  contractPeriod?: string | null;
  selectionFlow?: string | null;
  contractTerms?: string | null;
  location?: string | null;
  remotePolicy?: string | null;
  openings?: number | null;
  companyProfile?: { name?: string | null } | null;
};

export function jobKeywordText(job: SearchableJobText) {
  return [
    job.title,
    job.description,
    job.requiredSkills,
    job.preferredSkills,
    job.rate,
    job.workload,
    job.contractPeriod,
    job.selectionFlow,
    job.contractTerms,
    job.location,
    job.remotePolicy,
    openingSearchText(job.openings),
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
      { rate: { contains: term, mode: "insensitive" as const } },
      { workload: { contains: term, mode: "insensitive" as const } },
      { contractPeriod: { contains: term, mode: "insensitive" as const } },
      { selectionFlow: { contains: term, mode: "insensitive" as const } },
      { contractTerms: { contains: term, mode: "insensitive" as const } },
      { location: { contains: term, mode: "insensitive" as const } },
      { remotePolicy: { contains: term, mode: "insensitive" as const } },
      { companyProfile: { name: { contains: term, mode: "insensitive" as const } } },
      ...openingCandidateWhere(term),
    ]),
  };
}

export function jobKeywordCandidateTerms(query: string | null | undefined) {
  const keyword = query?.trim();
  if (!keyword) return [];

  const skillTerms = [...canonicalSkillIdsFromSearchQuery(keyword)].flatMap(canonicalSkillSearchTerms);
  return uniqueSearchTerms([keyword, ...tokenCandidateTerms(keyword), ...numericCandidateTerms(keyword), ...skillTerms]);
}

function tokenCandidateTerms(query: string) {
  return query
    .normalize("NFKC")
    .match(/[a-z0-9+#]+|[一-龯ぁ-んァ-ヶー]+/gi)?.filter((token) => token.length >= 2) ?? [];
}

function numericCandidateTerms(query: string) {
  return query.normalize("NFKC").match(/\d+/g) ?? [];
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

function openingSearchText(openings: number | null | undefined) {
  if (!Number.isInteger(openings) || !openings || openings <= 0) return null;
  return `${openings} ${openings}名`;
}

function openingCandidateWhere(term: string): Prisma.JobPostWhereInput[] {
  const normalized = term.normalize("NFKC").trim();
  if (!/^\d+$/.test(normalized)) return [];
  const openings = Number(normalized);
  if (!Number.isSafeInteger(openings) || openings <= 0) return [];
  return [{ openings }];
}
