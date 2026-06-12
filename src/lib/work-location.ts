export type WorkLocationKind =
  | "remote_allowed"
  | "remote_required_or_primary"
  | "hybrid"
  | "onsite_required"
  | "unknown"
  | "remote_not_allowed";

export type RemoteWorkIntent = "remote" | "full_remote" | "hybrid";

export type WorkLocationInput = {
  location?: string | null;
  remotePolicy?: string | null;
};

export type WorkLocationSemantics = {
  kind: WorkLocationKind;
  remoteCompatible: boolean;
};

export function normalizeWorkLocation(input: WorkLocationInput): WorkLocationSemantics {
  const text = normalizeLocationText([input.remotePolicy, input.location].filter(Boolean).join(" "));
  if (!text) return { kind: "unknown", remoteCompatible: false };

  if (hasAny(text, remoteNegativePatterns)) return { kind: "remote_not_allowed", remoteCompatible: false };

  const remotePrimary = hasAny(text, remotePrimaryPatterns);
  const remoteAllowed = remotePrimary || hasAny(text, remoteAllowedPatterns);
  const onsiteSignal = hasAny(text, onsitePatterns);
  const hybrid = hasAny(text, hybridPatterns) || (remoteAllowed && onsiteSignal);

  if (remotePrimary && !hybrid) return { kind: "remote_required_or_primary", remoteCompatible: true };
  if (hybrid) return { kind: "hybrid", remoteCompatible: true };
  if (remoteAllowed) return { kind: "remote_allowed", remoteCompatible: true };
  if (onsiteSignal) return { kind: "onsite_required", remoteCompatible: false };
  return { kind: "unknown", remoteCompatible: false };
}

export function isRemoteCompatibleWorkLocation(input: WorkLocationInput) {
  return normalizeWorkLocation(input).remoteCompatible;
}

export function normalizeRemoteWorkIntent(value?: string | null): RemoteWorkIntent | "" {
  if (value === "full_remote" || value === "hybrid" || value === "remote") return value;
  return "";
}

export function remoteWorkIntentFromSavedFeed(input: { remote?: boolean | null; remoteIntent?: string | null }): RemoteWorkIntent | "" {
  return normalizeRemoteWorkIntent(input.remoteIntent) || (input.remote ? "remote" : "");
}

export function remoteWorkIntentLabel(intent?: RemoteWorkIntent | "" | null) {
  const labels: Record<RemoteWorkIntent, string> = {
    remote: "リモート可",
    full_remote: "フルリモート中心",
    hybrid: "一部リモート/ハイブリッド",
  };
  return intent ? labels[intent] : "";
}

export function matchesRemoteWorkIntent(input: WorkLocationInput, intent?: RemoteWorkIntent | "" | null) {
  const normalizedIntent = normalizeRemoteWorkIntent(intent);
  if (!normalizedIntent) return true;
  const workLocation = normalizeWorkLocation(input);
  if (normalizedIntent === "remote") return workLocation.remoteCompatible;
  if (normalizedIntent === "full_remote") return workLocation.kind === "remote_required_or_primary";
  return workLocation.kind === "hybrid";
}

export function filterRemoteCompatibleJobs<J extends WorkLocationInput>(jobs: J[]) {
  return jobs.filter((job) => isRemoteCompatibleWorkLocation(job));
}

export function filterJobsByRemoteWorkIntent<J extends WorkLocationInput>(jobs: J[], intent?: RemoteWorkIntent | "" | null) {
  return jobs.filter((job) => matchesRemoteWorkIntent(job, intent));
}

function normalizeLocationText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

const remoteNegativePatterns = [
  /リモート\s*(不可|なし|無し|ng|禁止|非対応|できない|できません)/,
  /在宅\s*(不可|なし|無し|ng|禁止|非対応|できない|できません)/,
  /(remote|work from home|wfh)\s*(not allowed|unavailable|ng|no|不可|なし|無し)/,
  /(no|not)\s*(remote|work from home|wfh)/,
  /(onsite|on-site|office)\s*only/,
];

const remotePrimaryPatterns = [
  /フルリモート/,
  /完全リモート/,
  /全国リモート/,
  /原則リモート/,
  /リモート中心/,
  /在宅勤務/,
  /オンライン/,
  /(full|fully)\s*remote/,
  /remote\s*(first|primary|only)/,
];

const remoteAllowedPatterns = [
  /リモート\s*(可|ok|可能|対応|あり|有|歓迎)/,
  /一部リモート/,
  /在宅\s*(可|ok|可能|対応|あり|有)/,
  /全国\s*(可|対応|から)/,
  /remote\s*(ok|allowed|available|possible|friendly)/,
  /(work from home|wfh)\s*(ok|allowed|available|possible)/,
];

const hybridPatterns = [
  /ハイブリッド/,
  /hybrid/,
  /一部リモート/,
  /リモート併用/,
  /一部出社/,
  /出社.{0,8}(あり|有|併用|相談)/,
  /週\s*[0-5一二三四五１２３４５]\s*(日|回)?.{0,8}出社/,
  /出社.{0,8}週\s*[0-5一二三四五１２３４５]/,
];

const onsitePatterns = [
  /常駐/,
  /出社\s*(必須|前提|のみ|限定)/,
  /オンサイト/,
  /onsite/,
  /on-site/,
  /office\s*(required|only)/,
];
