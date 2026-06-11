export const paymentPolicyEvidenceFields = [
  { name: "contractEvidence", label: "契約条件の根拠" },
  { name: "paymentEvidence", label: "請求・支払い方針の根拠" },
  { name: "offPlatformPolicy", label: "外部支払い・不審依頼への対応方針" },
] as const;

export type PaymentPolicyEvidenceFieldName = (typeof paymentPolicyEvidenceFields)[number]["name"];

export function missingPaymentPolicyEvidence(
  kind: string,
  fields: Record<PaymentPolicyEvidenceFieldName, string | null | undefined>,
) {
  if (kind !== "payment_policy") return [];

  return paymentPolicyEvidenceFields.filter((field) => !fields[field.name]?.trim());
}
