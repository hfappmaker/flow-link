import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function toText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function toOptionalText(value: FormDataEntryValue | null) {
  const text = toText(value);
  return text.length ? text : null;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function skillPreview(value: string | null | undefined, limit = 3) {
  return parseSkills(value).slice(0, limit);
}

export function parseSkills(value: string | null | undefined) {
  if (!value) return [];
  return Array.from(new Set(value
    .split(/[\n,、／/]+/)
    .map((skill) => skill.trim())
    .filter(Boolean)));
}

export function matchedSkills(requiredSkills: string | null | undefined, freelancerSkills: string | null | undefined) {
  const freelancerSkillSet = new Set(parseSkills(freelancerSkills).map((skill) => skill.toLowerCase()));
  return parseSkills(requiredSkills).filter((skill) => freelancerSkillSet.has(skill.toLowerCase()));
}

export function skillMatchPercent(requiredSkills: string | null | undefined, freelancerSkills: string | null | undefined) {
  const requiredSkillCount = parseSkills(requiredSkills).length;
  if (requiredSkillCount === 0) return null;
  return Math.round((matchedSkills(requiredSkills, freelancerSkills).length / requiredSkillCount) * 100);
}

export function formatOpenings(value: number | null | undefined) {
  return value ? `${value}名` : "未設定";
}

type DirectContractChecklistInput = {
  description?: string | null;
  requiredSkills?: string | null;
  rate?: string | null;
  workload?: string | null;
  contractPeriod?: string | null;
  selectionFlow?: string | null;
  contractTerms?: string | null;
  location?: string | null;
  remotePolicy?: string | null;
};

export function directContractChecklist(job: DirectContractChecklistInput) {
  const items = [
    {
      key: "scope",
      label: "業務範囲",
      detail: "業務内容と必須スキルで、任せたい役割が判断できる",
      done: Boolean(job.description && job.requiredSkills),
    },
    {
      key: "compensation",
      label: "報酬・支払い",
      detail: "単価と契約・支払い条件が提示されている",
      done: Boolean(job.rate && job.contractTerms),
    },
    {
      key: "workload",
      label: "稼働条件",
      detail: "稼働率と契約期間が応募前に確認できる",
      done: Boolean(job.workload && job.contractPeriod),
    },
    {
      key: "process",
      label: "選考フロー",
      detail: "面談回数や判断までの流れが明記されている",
      done: Boolean(job.selectionFlow),
    },
    {
      key: "place",
      label: "働き方",
      detail: "勤務地またはリモート条件が明記されている",
      done: Boolean(job.location || job.remotePolicy),
    },
  ];
  const completed = items.filter((item) => item.done).length;

  return {
    items,
    completed,
    total: items.length,
    percent: Math.round((completed / items.length) * 100),
    isReady: completed === items.length,
  };
}

type DirectMatchScoreInput = DirectContractChecklistInput & {
  applicationStatus?: string | null;
  freelancerReadinessPercent?: number | null;
  freelancerSkills?: string | null;
};

export function directMatchScore(job: DirectMatchScoreInput) {
  const skillPercent = skillMatchPercent(job.requiredSkills, job.freelancerSkills);
  const contractPercent = directContractChecklist(job).percent;
  const readinessPercent = job.freelancerReadinessPercent ?? 0;
  const applicationOpenBonus = job.applicationStatus === "open" ? 5 : 0;
  const weightedSkill = skillPercent === null ? 20 : skillPercent * 0.45;
  const weightedContract = contractPercent * 0.35;
  const weightedReadiness = readinessPercent * 0.15;

  return Math.min(100, Math.round(weightedSkill + weightedContract + weightedReadiness + applicationOpenBonus));
}

export function applicationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    applied: "応募済み",
    screening_passed: "書類選考OK",
    screening_rejected: "書類選考NG",
    withdrawn: "辞退",
  };
  return labels[status] ?? status;
}

export function jobStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "下書き",
    published: "公開中",
    private: "非公開",
    closed: "クローズ",
  };
  return labels[status] ?? status;
}

export function buildScreeningPassedHandoffMessage({
  companyName,
  freelancerName,
  jobTitle,
  proposedStart,
  contactPreference,
  selectionFlow,
  contractTerms,
}: {
  companyName: string;
  freelancerName: string;
  jobTitle: string;
  proposedStart?: string | null;
  contactPreference?: string | null;
  selectionFlow?: string | null;
  contractTerms?: string | null;
}) {
  return [
    `${freelancerName}さん`,
    "",
    `${jobTitle}へのご応募ありがとうございます。書類確認が完了しましたので、${companyName}と面談調整を進めさせてください。`,
    "",
    `応募時の開始目安: ${proposedStart || "面談で確認"}`,
    `応募時の連絡希望: ${contactPreference || "このチャットで調整"}`,
    `選考フロー: ${selectionFlow || "面談で確認"}`,
    `契約・支払い条件: ${contractTerms || "面談で確認"}`,
    "",
    "まずは候補日時と、面談前に確認したい条件があればこのチャットで共有してください。",
    companyName,
  ].join("\n");
}
