export const APPLICATION_EXPECTATION_SOURCES = ["candidate", "job_default", "confirmed_job"] as const;

export type ApplicationExpectationSource = (typeof APPLICATION_EXPECTATION_SOURCES)[number];

const applicationExpectationSourceSet = new Set<string>(APPLICATION_EXPECTATION_SOURCES);

export function parseApplicationExpectationSource(
  value: string | null | undefined,
): ApplicationExpectationSource | null {
  const source = value?.trim();
  if (!source) return null;
  return applicationExpectationSourceSet.has(source) ? (source as ApplicationExpectationSource) : null;
}

export function hasConfirmedApplicationExpectation(value: string | null | undefined, source: string | null | undefined) {
  if (!value?.trim()) return false;

  const parsedSource = parseApplicationExpectationSource(source);
  if (!parsedSource) return !source?.trim();
  return parsedSource === "candidate" || parsedSource === "confirmed_job";
}

export function normalizeApplicationExpectationSourceForCreate(
  value: string | null | undefined,
  source: string | null | undefined,
): ApplicationExpectationSource | null {
  const parsedSource = parseApplicationExpectationSource(source);
  if (parsedSource) return parsedSource;
  if (!source?.trim() && value?.trim()) return "candidate";
  return null;
}
