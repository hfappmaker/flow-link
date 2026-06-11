import assert from "node:assert/strict";
import test from "node:test";

const {
  VALIDATION_READINESS_BOUNDARIES,
  getApplicationReadiness,
  getFreelancerReadiness,
  getJobPublishingReadiness,
  shouldHoldJobAsDraftForPublishing,
} = await import("../src/lib/readiness.ts");

const readyProfile = {
  fullName: "山田 太郎",
  desiredOccupation: "PM",
  skills: "Next.js, Prisma",
  availability: "週4日",
  careerHistory: { summary: "SaaS projects" },
  documents: [{ documentType: "resume" }, { documentType: "career_history" }],
};

const readyJob = {
  title: "React platform engineer",
  description: "React and TypeScript product work.",
  requiredSkills: "React, TypeScript",
  rate: "80万円",
  workload: "週3日",
  contractPeriod: "3ヶ月",
  selectionFlow: "面談1回",
  contractTerms: "月末締め翌月末払い",
  remotePolicy: "フルリモート",
};

test("validation readiness boundaries document the action gates", () => {
  assert.deepEqual(
    VALIDATION_READINESS_BOUNDARIES.map((boundary) => boundary.key),
    ["registration", "freelancer_apply", "company_publish", "company_trust", "post_application"],
  );
  assert.match(VALIDATION_READINESS_BOUNDARIES[0].policy, /登録できる/);
  assert.match(VALIDATION_READINESS_BOUNDARIES[2].hardBlock, /下書き保存/);
});

test("freelancer can browse before apply readiness is complete", () => {
  const readiness = getFreelancerReadiness({ fullName: "山田 太郎" });

  assert.equal(readiness.isReady, false);
  assert.equal(readiness.items.some((item) => item.href === "/freelancer/profile"), true);
  assert.deepEqual(
    readiness.missingRequired.map((item) => item.label),
    ["希望職種", "スキル", "稼働条件・開始時期", "職務経歴フォーム", "履歴書PDF", "職務経歴書PDF"],
  );
});

test("application readiness requires profile evidence and next-action fields", () => {
  const missing = getApplicationReadiness(readyProfile, {
    proposalMessage: "応募メッセージ".repeat(10),
    proposedStart: null,
    rateExpectation: "",
    workloadExpectation: null,
    contactPreference: "",
  });
  assert.equal(missing.isReady, false);
  assert.deepEqual(
    missing.missingRequired.map((item) => item.label),
    ["稼働開始目安", "応募時の希望単価", "応募時の希望稼働量", "連絡希望"],
  );

  const ready = getApplicationReadiness(readyProfile, {
    proposalMessage: "応募メッセージ".repeat(10),
    proposedStart: "7月第1週",
    rateExpectation: "月100万円以上",
    workloadExpectation: "週4日",
    contactPreference: "平日18時以降",
  });
  assert.equal(ready.isReady, true);
});

test("job publishing readiness separates draft guidance from publish eligibility", () => {
  const draft = getJobPublishingReadiness(
    { ...readyJob, rate: "", contractTerms: "", selectionFlow: "" },
    { name: "Flow Link株式会社" },
  );

  assert.equal(draft.isReady, false);
  assert.deepEqual(
    draft.missingRequired.map((item) => item.label),
    ["報酬・支払い", "選考フロー"],
  );
  assert.equal(shouldHoldJobAsDraftForPublishing("draft", draft), false);
  assert.equal(shouldHoldJobAsDraftForPublishing("published", draft), true);

  const ready = getJobPublishingReadiness(readyJob, { name: "Flow Link株式会社" });
  assert.equal(ready.isReady, true);
  assert.equal(shouldHoldJobAsDraftForPublishing("published", ready), false);
});

test("job publishing readiness requires a real company name", () => {
  const readiness = getJobPublishingReadiness(readyJob, { name: "未設定の企業" });

  assert.equal(readiness.isReady, false);
  assert.deepEqual(
    readiness.missingRequired.map((item) => item.label),
    ["企業名"],
  );
});
