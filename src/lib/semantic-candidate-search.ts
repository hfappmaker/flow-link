export const SEMANTIC_SEARCH_CANDIDATE_PAGE_SIZE = 500;
export const SEMANTIC_SEARCH_MAX_CANDIDATE_PAGES = 5;
export const SEMANTIC_SEARCH_MATCH_LIMIT = 500;
export const SEMANTIC_SEARCH_MAX_CANDIDATES =
  SEMANTIC_SEARCH_CANDIDATE_PAGE_SIZE * SEMANTIC_SEARCH_MAX_CANDIDATE_PAGES;

export type SemanticCandidateSearchResult<T> = {
  matches: T[];
  inspectedCandidateCount: number;
  hasMoreCandidateMatches: boolean;
  maxCandidateCount: number;
  matchLimit: number;
  pagesFetched: number;
};

export function emptySemanticCandidateSearchResult<T>(): SemanticCandidateSearchResult<T> {
  return {
    matches: [],
    inspectedCandidateCount: 0,
    hasMoreCandidateMatches: false,
    maxCandidateCount: SEMANTIC_SEARCH_MAX_CANDIDATES,
    matchLimit: SEMANTIC_SEARCH_MATCH_LIMIT,
    pagesFetched: 0,
  };
}

export async function collectSemanticCandidateMatches<T>({
  fetchCandidates,
  matchesCandidate,
  pageSize = SEMANTIC_SEARCH_CANDIDATE_PAGE_SIZE,
  maxPages = SEMANTIC_SEARCH_MAX_CANDIDATE_PAGES,
  matchLimit = SEMANTIC_SEARCH_MATCH_LIMIT,
}: {
  fetchCandidates: (args: { skip: number; take: number }) => Promise<T[]>;
  matchesCandidate: (candidate: T) => boolean;
  pageSize?: number;
  maxPages?: number;
  matchLimit?: number;
}): Promise<SemanticCandidateSearchResult<T>> {
  const matches: T[] = [];
  let inspectedCandidateCount = 0;
  let pagesFetched = 0;
  let lastPageWasFull = false;

  for (let page = 0; page < maxPages && matches.length < matchLimit; page += 1) {
    const candidates = await fetchCandidates({ skip: page * pageSize, take: pageSize });
    pagesFetched += 1;
    inspectedCandidateCount += candidates.length;
    lastPageWasFull = candidates.length === pageSize;

    for (const candidate of candidates) {
      if (matchesCandidate(candidate)) matches.push(candidate);
      if (matches.length >= matchLimit) break;
    }

    if (!lastPageWasFull) break;
  }

  return {
    matches,
    inspectedCandidateCount,
    hasMoreCandidateMatches: matches.length >= matchLimit || (pagesFetched >= maxPages && lastPageWasFull),
    maxCandidateCount: pageSize * maxPages,
    matchLimit,
    pagesFetched,
  };
}
