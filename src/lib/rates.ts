export const HIGH_MONTHLY_RATE_THRESHOLD_MAN_YEN = 80;
export const MONTHLY_RATE_BAND_THRESHOLDS_MAN_YEN = [60, 80, 100, 120] as const;

export type NormalizedRate = {
  kind: "monthly" | "hourly" | "daily" | "unknown";
  lowerMonthlyManYen: number | null;
  upperMonthlyManYen: number | null;
  lowerHourlyYen: number | null;
  upperHourlyYen: number | null;
  policy: "monthly-lower-bound" | "non-monthly-excluded" | "unparseable";
};

const RANGE_SEPARATOR = "(?:〜|～|~|-|ー|–|—|から)";

export function normalizeRateText(value: string | null | undefined): NormalizedRate {
  const text = normalizeText(value);
  if (!text) return unknownRate("unparseable");

  const kind = rateKind(text);
  if (kind !== "monthly") {
    const hourlyRange = kind === "hourly" ? parseHourlyRange(text) : null;
    return {
      kind,
      lowerMonthlyManYen: null,
      upperMonthlyManYen: null,
      lowerHourlyYen: hourlyRange?.lower ?? null,
      upperHourlyYen: hourlyRange?.upper ?? null,
      policy: "non-monthly-excluded",
    };
  }

  const range = parseRange(text);
  if (range) {
    return {
      kind: "monthly",
      lowerMonthlyManYen: range.lower,
      upperMonthlyManYen: range.upper,
      lowerHourlyYen: null,
      upperHourlyYen: null,
      policy: "monthly-lower-bound",
    };
  }

  const amount = parseSingleAmount(text);
  if (amount !== null) {
    return {
      kind: "monthly",
      lowerMonthlyManYen: amount,
      upperMonthlyManYen: amount,
      lowerHourlyYen: null,
      upperHourlyYen: null,
      policy: "monthly-lower-bound",
    };
  }

  return unknownRate("unparseable");
}

export function isHighMonthlyRateText(value: string | null | undefined, thresholdManYen = HIGH_MONTHLY_RATE_THRESHOLD_MAN_YEN) {
  return isMonthlyRateAtLeastText(value, thresholdManYen);
}

export function isMonthlyRateAtLeastText(value: string | null | undefined, thresholdManYen: number) {
  const rate = normalizeRateText(value);
  return rate.kind === "monthly" && rate.lowerMonthlyManYen !== null && rate.lowerMonthlyManYen >= thresholdManYen;
}

export function monthlyRateBandFromFilter(value: string | null | undefined) {
  if (value === "high") return HIGH_MONTHLY_RATE_THRESHOLD_MAN_YEN;
  const threshold = Number(value);
  return MONTHLY_RATE_BAND_THRESHOLDS_MAN_YEN.includes(threshold as (typeof MONTHLY_RATE_BAND_THRESHOLDS_MAN_YEN)[number])
    ? threshold
    : null;
}

export function monthlyRateBandFilterValue(value: string | null | undefined) {
  const threshold = monthlyRateBandFromFilter(value);
  return threshold === null ? null : String(threshold);
}

export function monthlyRateBandLabel(thresholdManYen: number) {
  return `月${thresholdManYen}万円以上`;
}

export function rateFitTone(
  targetRate: string | null | undefined,
  jobRate: string | null | undefined,
): "good" | "neutral" | "warn" {
  const target = normalizeRateText(targetRate);
  const job = normalizeRateText(jobRate);
  if (target.kind === "hourly" && job.kind === "hourly" && target.lowerHourlyYen !== null && job.lowerHourlyYen !== null) {
    if (job.lowerHourlyYen >= target.lowerHourlyYen) return "good";
    if (job.upperHourlyYen !== null && job.upperHourlyYen < target.lowerHourlyYen) return "warn";
    return "neutral";
  }
  if (target.kind !== "monthly" || job.kind !== "monthly" || target.lowerMonthlyManYen === null || job.lowerMonthlyManYen === null) {
    return "neutral";
  }
  if (job.lowerMonthlyManYen >= target.lowerMonthlyManYen) return "good";
  if (job.upperMonthlyManYen !== null && job.upperMonthlyManYen < target.lowerMonthlyManYen) return "warn";
  return "neutral";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[，、]/g, ",")
    .replace(/\s+/g, "")
    .trim();
}

function rateKind(text: string): NormalizedRate["kind"] {
  const hasMonthly = /(月額|月単価|月給|月[\/あたり]?|\/月|毎月)/i.test(text);
  if (!hasMonthly && /(時給|時間単価|時間あたり|\/(?:1)?h|\/hour|hourly)/i.test(text)) return "hourly";
  if (!hasMonthly && /(日給|日額|日単価|日あたり|\/日|daily)/i.test(text)) return "daily";
  if (/(万円|円|¥|￥)/.test(text) || hasMonthly) return "monthly";
  return "unknown";
}

function parseRange(text: string) {
  const rangePattern = new RegExp(
    `(¥|￥)?(\\d[\\d,]*(?:\\.\\d+)?)(万)?(?:円)?${RANGE_SEPARATOR}(¥|￥)?(\\d[\\d,]*(?:\\.\\d+)?)(万)?(?:円|万円)?`,
    "i",
  );
  const match = text.match(rangePattern);
  if (!match) return null;

  const lower = amountToManYen(match[2], { hasManUnit: Boolean(match[3] || match[6] || match[0].includes("万")), hasYenUnit: Boolean(match[1] || match[4] || match[0].includes("円") || match[0].includes("¥") || match[0].includes("￥")) });
  const upper = amountToManYen(match[5], { hasManUnit: Boolean(match[6] || match[3] || match[0].includes("万")), hasYenUnit: Boolean(match[4] || match[1] || match[0].includes("円") || match[0].includes("¥") || match[0].includes("￥")) });
  if (lower === null || upper === null) return null;
  return lower <= upper ? { lower, upper } : { lower: upper, upper: lower };
}

function parseHourlyRange(text: string) {
  const range = parseYenRange(text);
  if (range) return range;
  const amount = parseHourlySingleAmount(text);
  return amount === null ? null : { lower: amount, upper: amount };
}

function parseYenRange(text: string) {
  const rangePattern = new RegExp(
    `(¥|￥)?(\\d[\\d,]*(?:\\.\\d+)?)(?:円|yen)?${RANGE_SEPARATOR}(¥|￥)?(\\d[\\d,]*(?:\\.\\d+)?)(?:円|yen)?`,
    "i",
  );
  const match = text.match(rangePattern);
  if (!match) return null;

  const lower = amountToYen(match[2]);
  const upper = amountToYen(match[4]);
  if (lower === null || upper === null) return null;
  return lower <= upper ? { lower, upper } : { lower: upper, upper: lower };
}

function parseHourlySingleAmount(text: string) {
  const tokenPattern = /(¥|￥)?(\d[\d,]*(?:\.\d+)?)(?:円|yen)?/gi;
  for (const match of text.matchAll(tokenPattern)) {
    const amount = amountToYen(match[2]);
    if (amount !== null) return amount;
  }
  return null;
}

function parseSingleAmount(text: string) {
  const tokenPattern = /(¥|￥)?(\d[\d,]*(?:\.\d+)?)(万)?(円|yen)?/gi;
  for (const match of text.matchAll(tokenPattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const context = text.slice(Math.max(0, start - 3), Math.min(text.length, end + 3));
    const amount = amountToManYen(match[2], {
      hasManUnit: Boolean(match[3] || context.includes("万")),
      hasYenUnit: Boolean(match[1] || match[4] || context.includes("円") || context.includes("¥") || context.includes("￥")),
      monthlyContext: context.includes("月"),
    });
    if (amount !== null) return amount;
  }
  return null;
}

function amountToYen(rawValue: string | undefined) {
  if (!rawValue) return null;
  const value = Number(rawValue.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function amountToManYen(
  rawValue: string | undefined,
  {
    hasManUnit = false,
    hasYenUnit = false,
    monthlyContext = false,
  }: { hasManUnit?: boolean; hasYenUnit?: boolean; monthlyContext?: boolean },
) {
  if (!rawValue) return null;
  const value = Number(rawValue.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (hasManUnit) return value;
  if (hasYenUnit) return value / 10000;
  if (monthlyContext) return value;
  return null;
}

function unknownRate(policy: "non-monthly-excluded" | "unparseable"): NormalizedRate {
  return {
    kind: "unknown",
    lowerMonthlyManYen: null,
    upperMonthlyManYen: null,
    lowerHourlyYen: null,
    upperHourlyYen: null,
    policy,
  };
}
