import type { Prisma } from "@prisma/client";

export const LIGHT_WORKLOAD_FILTER_VALUE = "light";
export const LIGHT_WORKLOAD_FILTER_LABEL = "週2-3日目安";

const LIGHT_MAX_WEEKLY_DAYS = 3;
const LIGHT_MAX_WEEKLY_HOURS = 24;
const LIGHT_MAX_MONTHLY_HOURS = 96;
const LIGHT_MAX_PERSON_MONTH = 0.6;
const LIGHT_MAX_PERCENT = 60;

export type WorkloadKind = "light" | "heavy" | "unknown";

export type NormalizedWorkload = {
  kind: WorkloadKind;
  policy:
    | "explicit-side-work-allowed"
    | "weekly-days"
    | "weekly-hours"
    | "monthly-hours"
    | "person-days"
    | "person-month"
    | "percent"
    | "negative-or-too-broad"
    | "unparseable";
  lower: number | null;
  upper: number | null;
  unit: "weekly-days" | "weekly-hours" | "monthly-hours" | "person-days" | "person-month" | "percent" | null;
};

type WorkloadJob = {
  workload?: string | null;
};

export function normalizeWorkloadText(value: string | null | undefined): NormalizedWorkload {
  const text = normalizeWorkloadSearchText(value);
  if (!text) return unknownWorkload("unparseable");

  const candidates: NormalizedWorkload[] = [];

  if (/(副業|複業)(可|可能|ok|歓迎|相談可|相談可能|対応)/i.test(text) && !/(副業|複業)(不可|禁止|ng|非対応|できない|できません)/i.test(text)) {
    candidates.push({
      kind: "light",
      policy: "explicit-side-work-allowed",
      lower: null,
      upper: null,
      unit: null,
    });
  }

  candidates.push(...parseDayWorkloads(text));
  candidates.push(...parseHourWorkloads(text));
  candidates.push(...parsePersonMonthWorkloads(text));
  candidates.push(...parsePercentWorkloads(text));

  const parseable = candidates.filter((candidate) => candidate.kind !== "unknown");
  return parseable.find((candidate) => candidate.kind === "light") ?? parseable[0] ?? unknownWorkload("unparseable");
}

export function isLightWorkloadText(value: string | null | undefined) {
  return normalizeWorkloadText(value).kind === "light";
}

export function workloadFitTone(
  preferredWorkload: string | null | undefined,
  jobWorkload: string | null | undefined,
): "good" | "neutral" | "warn" {
  const preference = normalizeWorkloadText(preferredWorkload);
  const job = normalizeWorkloadText(jobWorkload);
  if (preference.kind === "unknown" || job.kind === "unknown") return "neutral";
  if (preference.kind === "light") return job.kind === "light" ? "good" : "warn";
  if (job.kind === "heavy") return "good";
  return "neutral";
}

export function filterLightWorkloadJobs<J extends WorkloadJob>(jobs: J[]) {
  return jobs.filter((job) => isLightWorkloadText(job.workload));
}

export function lightWorkloadCandidateWhere(): Prisma.JobPostWhereInput {
  return {
    OR: [
      { workload: { contains: "週", mode: "insensitive" } },
      { workload: { contains: "月", mode: "insensitive" } },
      { workload: { contains: "人日", mode: "insensitive" } },
      { workload: { contains: "人月", mode: "insensitive" } },
      { workload: { contains: "%", mode: "insensitive" } },
      { workload: { contains: "副業", mode: "insensitive" } },
      { workload: { contains: "複業", mode: "insensitive" } },
      { workload: { contains: "稼働", mode: "insensitive" } },
    ],
  };
}

function parseDayWorkloads(text: string): NormalizedWorkload[] {
  const results: NormalizedWorkload[] = [];
  for (const match of text.matchAll(/週([0-9]+(?:\.[0-9]+)?)(?:(?:〜|～|~|-|ー|から)([0-9]+(?:\.[0-9]+)?))?\s*(?:日|days?)?/gi)) {
    const [lower, upper] = orderedRange(match[1], match[2]);
    if (lower === null || upper === null || lower > 7 || upper > 7) continue;
    results.push(classifyNumericWorkload(text, match, lower, upper, LIGHT_MAX_WEEKLY_DAYS, "weekly-days", "weekly-days"));
  }
  for (const match of text.matchAll(/([0-9]+(?:\.[0-9]+)?)(?:(?:〜|～|~|-|ー|から)([0-9]+(?:\.[0-9]+)?))?\s*人日/gi)) {
    const [lower, upper] = orderedRange(match[1], match[2]);
    if (lower === null || upper === null) continue;
    results.push(classifyNumericWorkload(text, match, lower, upper, LIGHT_MAX_WEEKLY_DAYS, "person-days", "person-days"));
  }
  return results;
}

function parseHourWorkloads(text: string): NormalizedWorkload[] {
  const results: NormalizedWorkload[] = [];
  for (const match of text.matchAll(/週([0-9]+(?:\.[0-9]+)?)(?:(?:〜|～|~|-|ー|から)([0-9]+(?:\.[0-9]+)?))?\s*(?:時間|h|hours?)/gi)) {
    const [lower, upper] = orderedRange(match[1], match[2]);
    if (lower === null || upper === null) continue;
    results.push(classifyNumericWorkload(text, match, lower, upper, LIGHT_MAX_WEEKLY_HOURS, "weekly-hours", "weekly-hours"));
  }
  for (const match of text.matchAll(/月([0-9]+(?:\.[0-9]+)?)(?:(?:〜|～|~|-|ー|から)([0-9]+(?:\.[0-9]+)?))?\s*(?:時間|h|hours?)/gi)) {
    const [lower, upper] = orderedRange(match[1], match[2]);
    if (lower === null || upper === null) continue;
    results.push(classifyNumericWorkload(text, match, lower, upper, LIGHT_MAX_MONTHLY_HOURS, "monthly-hours", "monthly-hours"));
  }
  return results;
}

function parsePersonMonthWorkloads(text: string): NormalizedWorkload[] {
  const results: NormalizedWorkload[] = [];
  for (const match of text.matchAll(/([0-9]+(?:\.[0-9]+)?)(?:(?:〜|～|~|-|ー|から)([0-9]+(?:\.[0-9]+)?))?\s*人月/gi)) {
    const [lower, upper] = orderedRange(match[1], match[2]);
    if (lower === null || upper === null) continue;
    results.push(classifyNumericWorkload(text, match, lower, upper, LIGHT_MAX_PERSON_MONTH, "person-month", "person-month"));
  }
  return results;
}

function parsePercentWorkloads(text: string): NormalizedWorkload[] {
  const results: NormalizedWorkload[] = [];
  for (const match of text.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*%/g)) {
    const [lower, upper] = orderedRange(match[1]);
    if (lower === null || upper === null) continue;
    results.push(classifyNumericWorkload(text, match, lower, upper, LIGHT_MAX_PERCENT, "percent", "percent"));
  }
  return results;
}

function classifyNumericWorkload(
  text: string,
  match: RegExpMatchArray,
  lower: number,
  upper: number,
  lightMax: number,
  unit: NonNullable<NormalizedWorkload["unit"]>,
  policy: NormalizedWorkload["policy"],
): NormalizedWorkload {
  if (hasOpenEndedModifier(text, match)) {
    return { kind: "heavy", policy: "negative-or-too-broad", lower, upper: null, unit };
  }
  return {
    kind: upper <= lightMax ? "light" : "heavy",
    policy,
    lower,
    upper,
    unit,
  };
}

function hasOpenEndedModifier(text: string, match: RegExpMatchArray) {
  const start = match.index ?? 0;
  const end = start + match[0].length;
  const after = text.slice(end, end + 8);
  const around = text.slice(Math.max(0, start - 4), Math.min(text.length, end + 8));
  return /(以上|超|より多|over|morethan|minimum|最低|下限)/i.test(after) || /(常駐|必須)/.test(around);
}

function orderedRange(rawLower: string | undefined, rawUpper?: string | undefined): [number | null, number | null] {
  const lower = rawNumber(rawLower);
  const upper = rawNumber(rawUpper) ?? lower;
  if (lower === null || upper === null) return [null, null];
  return lower <= upper ? [lower, upper] : [upper, lower];
}

function rawNumber(value: string | undefined) {
  if (!value) return null;
  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeWorkloadSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[,，、]/g, ",")
    .replace(/\s+/g, "")
    .trim();
}

function unknownWorkload(policy: "negative-or-too-broad" | "unparseable"): NormalizedWorkload {
  return {
    kind: "unknown",
    policy,
    lower: null,
    upper: null,
    unit: null,
  };
}
