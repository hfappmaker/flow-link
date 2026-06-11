import {
  PostInterviewDeclineReason,
  PostInterviewOutcomeStatus,
  type PostInterviewOutcome,
} from "@prisma/client";

export const postInterviewOutcomeLabels: Record<PostInterviewOutcomeStatus, string> = {
  waiting_company_decision: "企業判断待ち",
  offer_sent: "オファー提示",
  freelancer_considering: "フリーランス検討中",
  clarification_requested: "条件確認中",
  accepted: "承諾済み",
  declined_by_company: "企業見送り",
  declined_by_freelancer: "辞退",
  contract_preparing: "契約準備中",
  contract_agreed: "契約合意",
  work_started: "稼働開始",
  closed_no_hire: "採用なしで終了",
};

export const postInterviewDeclineReasonLabels: Record<PostInterviewDeclineReason, string> = {
  rate_mismatch: "単価が合わない",
  workload_mismatch: "稼働量が合わない",
  timing: "開始時期が合わない",
  company_trust_concern: "企業信頼面の懸念",
  contract_payment_concern: "契約・支払い条件の懸念",
  role_mismatch: "役割が合わない",
  accepted_elsewhere: "他案件を承諾済み",
  other: "その他",
};

export type PostInterviewOutcomeRole = "company" | "freelancer";

type PostInterviewOutcomePolicyEntry = {
  status: PostInterviewOutcomeStatus;
  mode: "author" | "acknowledge";
  requiredFields?: readonly ("startDateEvidence" | "declineReason")[];
};

const agreementRequiredFields = ["startDateEvidence"] as const;
const declineRequiredFields = ["declineReason"] as const;

export const postInterviewOutcomePolicy = {
  company: [
    { status: PostInterviewOutcomeStatus.waiting_company_decision, mode: "author" },
    { status: PostInterviewOutcomeStatus.offer_sent, mode: "author" },
    { status: PostInterviewOutcomeStatus.freelancer_considering, mode: "acknowledge" },
    { status: PostInterviewOutcomeStatus.clarification_requested, mode: "acknowledge" },
    { status: PostInterviewOutcomeStatus.accepted, mode: "acknowledge", requiredFields: agreementRequiredFields },
    { status: PostInterviewOutcomeStatus.declined_by_company, mode: "author", requiredFields: declineRequiredFields },
    { status: PostInterviewOutcomeStatus.contract_preparing, mode: "author" },
    { status: PostInterviewOutcomeStatus.contract_agreed, mode: "author", requiredFields: agreementRequiredFields },
    { status: PostInterviewOutcomeStatus.work_started, mode: "author", requiredFields: agreementRequiredFields },
    { status: PostInterviewOutcomeStatus.closed_no_hire, mode: "author" },
  ],
  freelancer: [
    { status: PostInterviewOutcomeStatus.freelancer_considering, mode: "author" },
    { status: PostInterviewOutcomeStatus.clarification_requested, mode: "author" },
    { status: PostInterviewOutcomeStatus.accepted, mode: "author", requiredFields: agreementRequiredFields },
    { status: PostInterviewOutcomeStatus.declined_by_freelancer, mode: "author", requiredFields: declineRequiredFields },
    { status: PostInterviewOutcomeStatus.contract_agreed, mode: "acknowledge", requiredFields: agreementRequiredFields },
    { status: PostInterviewOutcomeStatus.work_started, mode: "acknowledge", requiredFields: agreementRequiredFields },
  ],
} as const satisfies Record<PostInterviewOutcomeRole, readonly PostInterviewOutcomePolicyEntry[]>;

export const companyOutcomeStatusValues = postInterviewOutcomePolicy.company.map((entry) => entry.status);

export const freelancerOutcomeStatusValues = postInterviewOutcomePolicy.freelancer.map((entry) => entry.status);

export function getPostInterviewOutcomePolicyEntry(
  role: PostInterviewOutcomeRole,
  status: PostInterviewOutcomeStatus,
): PostInterviewOutcomePolicyEntry | undefined {
  return postInterviewOutcomePolicy[role].find((entry) => entry.status === status);
}

export function validatePostInterviewOutcomePolicy(
  role: PostInterviewOutcomeRole,
  input: {
    status: PostInterviewOutcomeStatus;
    proposedStartDate?: string | null;
    agreedStartDate?: string | null;
    declineReason?: PostInterviewDeclineReason | null;
  },
) {
  const entry = getPostInterviewOutcomePolicyEntry(role, input.status);
  if (!entry) {
    throw new Error("この面談後ステータスは現在の権限では更新できません。");
  }
  if (entry.requiredFields?.includes("startDateEvidence") && !input.agreedStartDate && !input.proposedStartDate) {
    throw new Error("承諾以降のステータスでは開始日または開始予定を入力してください。");
  }
  if (entry.requiredFields?.includes("declineReason") && !input.declineReason) {
    throw new Error(role === "freelancer" ? "辞退理由を選択してください。" : "見送り理由を選択してください。");
  }
}

export function outcomeTone(status?: PostInterviewOutcomeStatus | null) {
  if (!status || status === PostInterviewOutcomeStatus.waiting_company_decision) return "neutral";
  if (
    status === PostInterviewOutcomeStatus.accepted ||
    status === PostInterviewOutcomeStatus.contract_preparing ||
    status === PostInterviewOutcomeStatus.contract_agreed ||
    status === PostInterviewOutcomeStatus.work_started
  ) {
    return "good";
  }
  if (
    status === PostInterviewOutcomeStatus.declined_by_company ||
    status === PostInterviewOutcomeStatus.declined_by_freelancer ||
    status === PostInterviewOutcomeStatus.closed_no_hire
  ) {
    return "bad";
  }
  return "warn";
}

export function outcomeNextAction({
  isCompany,
  outcome,
}: {
  isCompany: boolean;
  outcome?: Pick<PostInterviewOutcome, "status" | "responseDeadline" | "externalConfirmationNeeded"> | null;
}) {
  const status = outcome?.status ?? PostInterviewOutcomeStatus.waiting_company_decision;
  if (status === PostInterviewOutcomeStatus.waiting_company_decision) {
    return isCompany
      ? "面談結果、次回判断、またはオファー条件を記録してください。"
      : "企業判断待ちです。必要な確認事項があればチャットで整理してください。";
  }
  if (status === PostInterviewOutcomeStatus.offer_sent) {
    return isCompany
      ? `回答待ちです${outcome?.responseDeadline ? `。期限: ${outcome.responseDeadline}` : "。"}`
      : "条件を確認し、承諾・辞退・確認依頼のいずれかを記録してください。";
  }
  if (status === PostInterviewOutcomeStatus.freelancer_considering) return "フリーランスが条件を検討中です。";
  if (status === PostInterviewOutcomeStatus.clarification_requested) return "未確認条件をチャットまたは外部契約手続きで確認してください。";
  if (status === PostInterviewOutcomeStatus.accepted) return "承諾済みです。契約準備と募集継続の判断を進めてください。";
  if (status === PostInterviewOutcomeStatus.contract_preparing) return "外部契約または支払い条件の最終確認中です。";
  if (status === PostInterviewOutcomeStatus.contract_agreed) {
    return outcome?.externalConfirmationNeeded
      ? `合意済みです。残確認: ${outcome.externalConfirmationNeeded}`
      : "合意済みです。稼働開始日を確認してください。";
  }
  if (status === PostInterviewOutcomeStatus.work_started) return "稼働開始済みです。募集を継続するか企業側で確認してください。";
  return "この応募は採用なしで終了しています。理由は非公開の選考履歴として扱います。";
}

export function outcomeSnapshotItems(
  outcome?: Pick<
    PostInterviewOutcome,
    "agreedRate" | "agreedWorkload" | "agreedStartDate" | "proposedStartDate" | "contractPaymentNotes" | "externalConfirmationNeeded"
  > | null,
) {
  return [
    { label: "合意単価", value: outcome?.agreedRate || "未確定" },
    { label: "合意稼働量", value: outcome?.agreedWorkload || "未確定" },
    { label: "開始日", value: outcome?.agreedStartDate || outcome?.proposedStartDate || "未確定" },
    { label: "契約・支払いメモ", value: outcome?.contractPaymentNotes || "未記録" },
    { label: "外部確認", value: outcome?.externalConfirmationNeeded || "未記録" },
  ];
}
