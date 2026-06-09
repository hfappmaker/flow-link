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

export function daysSince(value: Date | string | null | undefined, now = new Date()) {
  if (!value) return 0;
  const startedAt = new Date(value).getTime();
  if (Number.isNaN(startedAt)) return 0;
  return Math.max(0, Math.floor((now.getTime() - startedAt) / (1000 * 60 * 60 * 24)));
}

export function buildApplicationResponseState({
  appliedAt,
  status,
}: {
  appliedAt: Date | string | null | undefined;
  status?: string | null;
}) {
  if (status && status !== "applied") {
    return {
      daysWaiting: 0,
      label: "対応済み",
      detail: "選考結果は更新済みです。",
      tone: "good" as const,
      priorityBoost: 0,
    };
  }

  const daysWaiting = daysSince(appliedAt);
  if (daysWaiting >= 5) {
    return {
      daysWaiting,
      label: "至急対応",
      detail: `応募から${daysWaiting}日経過しています。今日中に面談判断または見送りを更新してください。`,
      tone: "bad" as const,
      priorityBoost: 25,
    };
  }
  if (daysWaiting >= 3) {
    return {
      daysWaiting,
      label: "対応期限",
      detail: `応募から${daysWaiting}日経過しています。面談へ進めるか確認してください。`,
      tone: "warn" as const,
      priorityBoost: 15,
    };
  }
  return {
    daysWaiting,
    label: daysWaiting === 0 ? "本日応募" : `${daysWaiting}日経過`,
    detail: "応募内容と確認点を見て、早めに次の連絡へ進めてください。",
    tone: "neutral" as const,
    priorityBoost: daysWaiting * 3,
  };
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

type ApplicationReviewInput = {
  status?: string | null;
  proposalMessage?: string | null;
  proposedStart?: string | null;
  freelancerProfile: {
    skills?: string | null;
    availableFrom?: string | null;
    availability?: string | null;
    careerHistory?: unknown | null;
    documents?: unknown[] | null;
  };
  jobPost: {
    requiredSkills?: string | null;
  };
};

export function buildApplicationReview(application: ApplicationReviewInput) {
  const requiredSkills = parseSkills(application.jobPost.requiredSkills);
  const requiredSkillMatches = matchedSkills(application.jobPost.requiredSkills, application.freelancerProfile.skills);
  const matchPercent = skillMatchPercent(application.jobPost.requiredSkills, application.freelancerProfile.skills);
  const missingSkillCount = Math.max(0, requiredSkills.length - requiredSkillMatches.length);
  const reviewSignals = [
    { done: requiredSkills.length === 0 || requiredSkillMatches.length > 0, nextCheck: "必須スキルの補足" },
    { done: (application.freelancerProfile.documents?.length ?? 0) >= 2, nextCheck: "PDF書類" },
    { done: Boolean(application.freelancerProfile.careerHistory), nextCheck: "職務経歴" },
    { done: Boolean(application.proposalMessage), nextCheck: "応募時の提案" },
    {
      done: Boolean(
        application.proposedStart ||
          application.freelancerProfile.availableFrom ||
          application.freelancerProfile.availability,
      ),
      nextCheck: "開始条件",
    },
  ];
  const interviewReadinessPercent = Math.round((reviewSignals.filter((signal) => signal.done).length / reviewSignals.length) * 100);

  return {
    requiredSkillMatches,
    matchPercent,
    interviewReadinessPercent,
    isInterviewReady: interviewReadinessPercent >= 80 && application.status === "applied",
    nextChecks: reviewSignals.filter((signal) => !signal.done).map((signal) => signal.nextCheck),
    reviewQuestions: [
      ...(missingSkillCount > 0
        ? [`必須スキルの未一致 ${missingSkillCount}件について、近い実務経験や補完できる進め方を確認する`]
        : []),
      ...(!application.proposedStart && !application.freelancerProfile.availableFrom && !application.freelancerProfile.availability
        ? ["稼働開始時期と週あたりの稼働量を確認する"]
        : []),
      ...(!application.proposalMessage
        ? ["この案件で最初に任せたい業務への貢献イメージを確認する"]
        : []),
      ...((application.freelancerProfile.documents?.length ?? 0) < 2
        ? ["履歴書・職務経歴書の不足分を面談前に共有できるか確認する"]
        : []),
      ...(!application.freelancerProfile.careerHistory
        ? ["直近プロジェクトの役割、担当範囲、成果を確認する"]
        : []),
      ...(application.proposedStart || application.freelancerProfile.availableFrom || application.freelancerProfile.availability
        ? ["開始条件、契約・支払い条件、面談候補日時をすり合わせる"]
        : []),
    ].slice(0, 4),
  };
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
