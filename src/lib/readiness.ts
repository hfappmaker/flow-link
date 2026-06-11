import type { ResumeDocumentType } from "@prisma/client";

export type ReadinessSeverity = "required" | "recommended";

export type ReadinessBoundary = {
  key: "registration" | "freelancer_apply" | "company_publish" | "company_trust" | "post_application";
  action: string;
  policy: string;
  hardBlock: string;
  guidance: string;
};

export const VALIDATION_READINESS_BOUNDARIES: ReadinessBoundary[] = [
  {
    key: "registration",
    action: "アカウント作成",
    policy: "メール、パスワード、ロール、表示名だけで登録できる。プロフィールや案件条件の詳細は登録後に案内する。",
    hardBlock: "認証に必要なメール、8文字以上のパスワード、ロールが欠けている場合だけ登録を止める。",
    guidance: "登録後のダッシュボードで応募・公開に必要な次アクションを表示する。",
  },
  {
    key: "freelancer_apply",
    action: "フリーランスの応募",
    policy: "企業が初回選考で職種、スキル、職務経歴、PDF書類、稼働開始、連絡希望を確認できる状態を必須にする。",
    hardBlock: "評価不能な応募を作らないため、必須プロフィール、職務経歴、履歴書PDF、職務経歴書PDF、応募文、開始目安、連絡希望が欠けている応募を止める。",
    guidance: "閲覧、保存、推薦フィードバックは許可し、不足項目へのリンクを表示する。",
  },
  {
    key: "company_publish",
    action: "企業の案件公開",
    policy: "フリーランスが役割、必須スキル、稼働量、単価、支払い条件、働き方、選考フロー、企業名を応募前に確認できる状態を必須にする。",
    hardBlock: "条件不足の公開案件を出さないため、公開要求は下書き保存と応募停止に切り替える。下書き、非公開、クローズ保存は止めない。",
    guidance: "作成・編集中は不足項目と記入例を表示し、公開前に埋める項目を具体的に示す。",
  },
  {
    key: "company_trust",
    action: "会社・支払い信頼判断",
    policy: "会社概要、公開URL、連絡窓口、支払い方針、Flow Link確認リクエストを信頼材料として分けて扱う。",
    hardBlock: "有料確認や外部本人確認は必須化しない。公開案件自体には自己申告の契約・支払い条件を必須にする。",
    guidance: "未確認、確認中、確認済み、期限切れを区別して、応募前の判断材料として表示する。",
  },
  {
    key: "post_application",
    action: "応募後の次アクション",
    policy: "企業は提案、開始目安、連絡希望、応募準備、職務経歴、PDF書類を見て面談判断できる。通過時は面談チャットを作る。",
    hardBlock: "面談日時や会議URLなど、次工程の成立に必要な入力だけを送信時に止める。",
    guidance: "不足情報は選考画面の確認項目として表示し、見送り・面談への判断を早める。",
  },
];

type ReadinessItem = {
  key: string;
  label: string;
  href?: string;
  detail?: string;
  severity: ReadinessSeverity;
  done: boolean;
};

export type FreelancerReadinessProfile = {
  fullName?: string | null;
  desiredOccupation?: string | null;
  skills?: string | null;
  availability?: string | null;
  availableFrom?: string | null;
  careerHistory?: {
    summary?: string | null;
    workExperiences?: string | null;
  } | null;
  workPreference?: {
    workload?: string | null;
    availableFrom?: string | null;
  } | null;
  documents?: Array<{
    documentType: ResumeDocumentType | string;
  }>;
};

export type ApplicationReadinessInput = {
  proposalMessage?: string | null;
  proposedStart?: string | null;
  rateExpectation?: string | null;
  workloadExpectation?: string | null;
  contactPreference?: string | null;
};

export type JobPublishingReadinessInput = {
  title?: string | null;
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

export type CompanyPublishingReadinessInput = {
  name?: string | null;
};

export function getFreelancerReadiness(profile: FreelancerReadinessProfile | null | undefined) {
  const documentTypes = new Set(profile?.documents?.map((document) => document.documentType) ?? []);
  const items: ReadinessItem[] = [
    {
      key: "profile-name",
      label: "氏名",
      href: "/freelancer/profile",
      severity: "required",
      done: Boolean(profile?.fullName?.trim()),
    },
    {
      key: "profile-role",
      label: "希望職種",
      href: "/freelancer/profile",
      severity: "required",
      done: Boolean(profile?.desiredOccupation?.trim()),
    },
    {
      key: "profile-skills",
      label: "スキル",
      href: "/freelancer/profile",
      severity: "required",
      done: Boolean(profile?.skills?.trim()),
    },
    {
      key: "availability",
      label: "稼働条件・開始時期",
      href: "/freelancer/preferences",
      severity: "required",
      done: Boolean(
        profile?.availability?.trim() ||
          profile?.availableFrom?.trim() ||
          profile?.workPreference?.workload?.trim() ||
          profile?.workPreference?.availableFrom?.trim(),
      ),
    },
    {
      key: "career-history",
      label: "職務経歴フォーム",
      href: "/freelancer/career",
      severity: "required",
      done: Boolean(profile?.careerHistory?.summary?.trim() || profile?.careerHistory?.workExperiences?.trim()),
    },
    {
      key: "resume-pdf",
      label: "履歴書PDF",
      href: "/freelancer/documents",
      severity: "required",
      done: documentTypes.has("resume"),
    },
    {
      key: "career-pdf",
      label: "職務経歴書PDF",
      href: "/freelancer/documents",
      severity: "required",
      done: documentTypes.has("career_history"),
    },
  ];
  return summarizeReadiness(items);
}

export function getApplicationReadiness(
  profile: FreelancerReadinessProfile | null | undefined,
  input: ApplicationReadinessInput,
) {
  const freelancerReadiness = getFreelancerReadiness(profile);
  const items: ReadinessItem[] = [
    ...freelancerReadiness.items,
    {
      key: "proposal-message",
      label: "応募メッセージ",
      detail: "企業が経験、貢献範囲、案件との合い方を最初に確認できる提案文",
      severity: "required",
      done: textLength(input.proposalMessage) >= 40 && textLength(input.proposalMessage) <= 1200,
    },
    {
      key: "proposed-start",
      label: "稼働開始目安",
      detail: "企業が面談前に開始時期を判断できる応募時点の見込み",
      severity: "required",
      done: Boolean(input.proposedStart?.trim()),
    },
    {
      key: "rate-expectation",
      label: "応募時の希望単価",
      detail: "企業が面談前にこの案件での単価期待を判断できる応募時点の見込み",
      severity: "required",
      done: Boolean(input.rateExpectation?.trim()),
    },
    {
      key: "workload-expectation",
      label: "応募時の希望稼働量",
      detail: "企業が面談前にこの案件での週あたり稼働量を判断できる応募時点の見込み",
      severity: "required",
      done: Boolean(input.workloadExpectation?.trim()),
    },
    {
      key: "contact-preference",
      label: "連絡希望",
      detail: "企業が次アクションを取りやすい面談・連絡の希望",
      severity: "required",
      done: Boolean(input.contactPreference?.trim()),
    },
  ];
  return summarizeReadiness(items);
}

export function getJobPublishingReadiness(
  job: JobPublishingReadinessInput,
  company?: CompanyPublishingReadinessInput | null,
) {
  const items: ReadinessItem[] = [
    {
      key: "company-name",
      label: "企業名",
      detail: "応募者が募集企業を識別できる",
      severity: "required",
      done: isPublicCompanyName(company?.name),
    },
    {
      key: "title",
      label: "案件名",
      detail: "応募者が役割と領域を一覧で判断できる",
      severity: "required",
      done: Boolean(job.title?.trim()),
    },
    {
      key: "scope",
      label: "業務範囲",
      detail: "業務内容と必須スキルで、任せたい役割が判断できる",
      severity: "required",
      done: Boolean(job.description?.trim() && job.requiredSkills?.trim()),
    },
    {
      key: "compensation",
      label: "報酬・支払い",
      detail: "単価と契約・支払い条件が提示されている",
      severity: "required",
      done: Boolean(job.rate?.trim() && job.contractTerms?.trim()),
    },
    {
      key: "workload",
      label: "稼働条件",
      detail: "稼働率と契約期間が応募前に確認できる",
      severity: "required",
      done: Boolean(job.workload?.trim() && job.contractPeriod?.trim()),
    },
    {
      key: "process",
      label: "選考フロー",
      detail: "面談回数や判断までの流れが明記されている",
      severity: "required",
      done: Boolean(job.selectionFlow?.trim()),
    },
    {
      key: "place",
      label: "働き方",
      detail: "勤務地またはリモート条件が明記されている",
      severity: "required",
      done: Boolean(job.location?.trim() || job.remotePolicy?.trim()),
    },
  ];
  return summarizeReadiness(items);
}

export function shouldHoldJobAsDraftForPublishing(requestedStatus: string, readiness: { isReady: boolean }) {
  return requestedStatus === "published" && !readiness.isReady;
}

function summarizeReadiness(items: ReadinessItem[]) {
  const completed = items.filter((item) => item.done).length;
  const requiredItems = items.filter((item) => item.severity === "required");

  return {
    items,
    completed,
    total: items.length,
    percent: Math.round((completed / items.length) * 100),
    missingRequired: requiredItems.filter((item) => !item.done),
    isReady: requiredItems.every((item) => item.done),
  };
}

function textLength(value: string | null | undefined) {
  return value?.trim().length ?? 0;
}

function isPublicCompanyName(value: string | null | undefined) {
  const name = value?.trim();
  return Boolean(name && name !== "未設定の企業");
}
