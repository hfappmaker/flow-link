"use client";

import { useMemo, useState, type FormEvent } from "react";
import { paymentPolicyEvidenceFields } from "@/lib/company-verification";

type VerificationFormValues = {
  kind: "company_identity" | "payment_policy";
  publicEvidenceUrl: string;
  contactEvidence: string;
  contractEvidence: string;
  paymentEvidence: string;
  offPlatformPolicy: string;
  evidenceSummary: string;
};

export function CompanyVerificationForm({
  action,
  defaultContactEvidence,
  defaultKind = "company_identity",
  defaultPaymentEvidence,
  defaultPublicEvidenceUrl,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultContactEvidence?: string | null;
  defaultKind?: VerificationFormValues["kind"];
  defaultPaymentEvidence?: string | null;
  defaultPublicEvidenceUrl?: string | null;
}) {
  const [values, setValues] = useState<VerificationFormValues>({
    kind: defaultKind,
    publicEvidenceUrl: defaultPublicEvidenceUrl ?? "",
    contactEvidence: defaultContactEvidence ?? "",
    contractEvidence: "",
    paymentEvidence: defaultPaymentEvidence ?? "",
    offPlatformPolicy: "",
    evidenceSummary: "",
  });
  const [showPaymentGuidance, setShowPaymentGuidance] = useState(false);
  const missingPaymentFields = useMemo(
    () => paymentPolicyEvidenceFields.filter((field) => !values[field.name].trim()),
    [values],
  );
  const isPaymentPolicy = values.kind === "payment_policy";
  const paymentGuidanceId = "payment-policy-verification-guidance";

  function updateField(name: keyof VerificationFormValues, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!isPaymentPolicy || missingPaymentFields.length === 0) {
      return;
    }

    event.preventDefault();
    setShowPaymentGuidance(true);
  }

  return (
    <form action={action} className="mt-4 grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-1.5 text-sm font-medium text-stone-700">
        確認したい項目
        <select
          className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
          name="kind"
          value={values.kind}
          onChange={(event) => {
            updateField("kind", event.target.value as VerificationFormValues["kind"]);
            setShowPaymentGuidance(false);
          }}
        >
          <option value="company_identity">会社情報・公開Web確認</option>
          <option value="payment_policy">支払い・契約方針確認</option>
        </select>
      </label>
      <VerificationTextField
        name="publicEvidenceUrl"
        label="公開根拠URL"
        value={values.publicEvidenceUrl}
        onChange={updateField}
        required
        placeholder="会社サイト、採用ページ、公開プロフィールなど"
      />
      <VerificationTextArea
        name="contactEvidence"
        label="連絡窓口の根拠"
        value={values.contactEvidence}
        onChange={updateField}
        required
        maxLength={1000}
        placeholder="業務用メール、部署名、契約や面談条件を確認できる担当範囲"
      />
      <VerificationTextArea
        name="contractEvidence"
        label="契約条件の根拠"
        value={values.contractEvidence}
        onChange={updateField}
        onInvalid={() => setShowPaymentGuidance(true)}
        required={isPaymentPolicy}
        ariaDescribedBy={isPaymentPolicy ? paymentGuidanceId : undefined}
        maxLength={1000}
        placeholder="契約主体、契約書ひな型の確認範囲、面談後に確定する条件"
      />
      <VerificationTextArea
        name="paymentEvidence"
        label="請求・支払い方針の根拠"
        value={values.paymentEvidence}
        onChange={updateField}
        onInvalid={() => setShowPaymentGuidance(true)}
        required={isPaymentPolicy}
        ariaDescribedBy={isPaymentPolicy ? paymentGuidanceId : undefined}
        maxLength={1000}
        placeholder="締め日、支払い時期、検収、請求書の宛先、問い合わせ窓口"
      />
      <VerificationTextArea
        name="offPlatformPolicy"
        label="外部支払い・不審依頼への対応方針"
        value={values.offPlatformPolicy}
        onChange={updateField}
        onInvalid={() => setShowPaymentGuidance(true)}
        required={isPaymentPolicy}
        ariaDescribedBy={isPaymentPolicy ? paymentGuidanceId : undefined}
        maxLength={1000}
        placeholder="Flow Link外での前払い、立替、暗号資産、個人口座への誘導をしない方針など"
      />
      <VerificationTextArea
        name="evidenceSummary"
        label="提出内容の要約"
        value={values.evidenceSummary}
        onChange={updateField}
        required
        maxLength={1000}
        placeholder="Flow Linkに確認してほしい範囲と、フリーランスへ表示してよい説明"
      />
      {isPaymentPolicy && (
        <div
          id={paymentGuidanceId}
          className={`rounded border p-3 text-sm leading-6 ${
            showPaymentGuidance && missingPaymentFields.length > 0
              ? "border-amber-300 bg-amber-50 text-amber-950"
              : "border-stone-200 bg-stone-50 text-stone-600"
          }`}
          role={showPaymentGuidance && missingPaymentFields.length > 0 ? "alert" : undefined}
        >
          支払い・契約方針確認リクエストを送信するには、契約条件の根拠、請求・支払い方針の根拠、外部支払い・不審依頼への対応方針が必要です。
          フリーランスが契約・支払い期待値とFlow Link外の支払いリスクを応募前に判断できるようにするためです。
          {showPaymentGuidance && missingPaymentFields.length > 0 && (
            <span className="mt-1 block font-medium">
              未入力: {missingPaymentFields.map((field) => field.label).join("、")}
            </span>
          )}
        </div>
      )}
      <div className="rounded border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-600">
        未入力の必須根拠がある場合は送信されません。確認結果は、確認範囲、理由コード、確認日、有効期限、更新要否として記録されます。
      </div>
      <button className="btn btn-primary" type="submit">確認リクエストを送信</button>
    </form>
  );
}

function VerificationTextField({
  name,
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  name: keyof VerificationFormValues;
  label: string;
  value: string;
  onChange: (name: keyof VerificationFormValues, value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
      {label}
      <input
        className="rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
        name={name}
        type="text"
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        required={required}
        placeholder={placeholder}
      />
    </label>
  );
}

function VerificationTextArea({
  name,
  label,
  value,
  onChange,
  onInvalid,
  ariaDescribedBy,
  required,
  maxLength,
  placeholder,
}: {
  name: keyof VerificationFormValues;
  label: string;
  value: string;
  onChange: (name: keyof VerificationFormValues, value: string) => void;
  onInvalid?: () => void;
  ariaDescribedBy?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  const fieldId = `${name}-${label.replace(/\s+/g, "-")}`;

  return (
    <div className="grid gap-1.5 text-sm font-medium text-stone-700">
      <label htmlFor={fieldId}>{label}</label>
      <textarea
        id={fieldId}
        className="min-h-28 rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
        name={name}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        onInvalid={onInvalid}
        aria-describedby={ariaDescribedBy}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
      />
    </div>
  );
}
