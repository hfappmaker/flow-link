import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { missingPaymentPolicyEvidence, paymentPolicyEvidenceFields } from "../src/lib/company-verification.ts";

test("payment-policy verification requires all payment-specific evidence fields", () => {
  assert.deepEqual(
    missingPaymentPolicyEvidence("payment_policy", {
      contractEvidence: "",
      paymentEvidence: "月末締め翌月末払い",
      offPlatformPolicy: "Flow Link外の前払い依頼は行いません",
    }).map((field) => field.label),
    ["契約条件の根拠"],
  );

  assert.deepEqual(
    missingPaymentPolicyEvidence("payment_policy", {
      contractEvidence: "契約主体と契約書ひな型を提示できます",
      paymentEvidence: "月末締め翌月末払い",
      offPlatformPolicy: "Flow Link外の前払い依頼は行いません",
    }),
    [],
  );
});

test("company identity verification keeps the lighter required evidence boundary", () => {
  assert.deepEqual(
    missingPaymentPolicyEvidence("company_identity", {
      contractEvidence: "",
      paymentEvidence: "",
      offPlatformPolicy: "",
    }),
    [],
  );
});

test("company profile payment verification guidance names the gated action and freelancer risk reason", async () => {
  const [formSource, pageSource, actionsSource] = await Promise.all([
    readFile("src/app/company/profile/verification-form.tsx", "utf8"),
    readFile("src/app/company/profile/page.tsx", "utf8"),
    readFile("src/lib/actions.ts", "utf8"),
  ]);

  assert.deepEqual(paymentPolicyEvidenceFields.map((field) => field.label), [
    "契約条件の根拠",
    "請求・支払い方針の根拠",
    "外部支払い・不審依頼への対応方針",
  ]);
  assert.match(formSource, /支払い・契約方針確認リクエストを送信するには/);
  assert.match(formSource, /フリーランスが契約・支払い期待値とFlow Link外の支払いリスクを応募前に判断/);
  assert.match(formSource, /required=\{isPaymentPolicy\}/);
  assert.match(pageSource, /missing-payment-policy-evidence/);
  assert.match(actionsSource, /redirect\("\/company\/profile\?verification=missing-payment-policy-evidence"\)/);
});
