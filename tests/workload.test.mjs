import assert from "node:assert/strict";
import test from "node:test";

const {
  LIGHT_WORKLOAD_FILTER_LABEL,
  filterLightWorkloadJobs,
  isLightWorkloadText,
  normalizeWorkloadText,
  workloadFitTone,
} = await import("../src/lib/workload.ts");
const { visiblePreferenceReasons } = await import("../src/lib/utils.ts");

const acceptedLightWorkloads = [
  "週2",
  "週2〜3日",
  "週1〜3日",
  "3人日",
  "週24時間",
  "月96時間",
  "0.4人月",
  "0.5人月",
  "0.6人月",
  "40%",
  "50%",
  "60%稼働",
  "副業可",
  "複業可",
];

const rejectedLightWorkloads = [
  "副業不可",
  "週3日以上の常駐相談",
  "週30時間以上",
  "週4日",
  "80%",
  "0.8人月",
];

test("workload parser classifies common light flexible formats", () => {
  for (const workload of acceptedLightWorkloads) {
    assert.equal(isLightWorkloadText(workload), true, `${workload} should be light`);
  }
});

test("workload parser rejects negative, open-ended, and too-heavy formats", () => {
  for (const workload of rejectedLightWorkloads) {
    assert.equal(isLightWorkloadText(workload), false, `${workload} should not be light`);
  }
});

test("public light workload filtering uses the normalized workload predicate", () => {
  const jobs = [...acceptedLightWorkloads, ...rejectedLightWorkloads, "稼働量は面談で相談"].map((workload, index) => ({
    id: `job-${index}`,
    workload,
  }));

  assert.deepEqual(
    filterLightWorkloadJobs(jobs).map((job) => job.workload),
    acceptedLightWorkloads,
  );
});

test("week four and eighty percent stay outside the week 2-3 boundary", () => {
  assert.equal(LIGHT_WORKLOAD_FILTER_LABEL, "週2-3日目安");
  assert.equal(normalizeWorkloadText("週4日").kind, "heavy");
  assert.equal(normalizeWorkloadText("80%").kind, "heavy");
});

test("workload preference reasons use normalized semantics and stay neutral when unparseable", () => {
  assert.equal(workloadFitTone("週3日", "週24時間"), "good");
  assert.equal(workloadFitTone("週2〜3日", "週30時間以上"), "warn");
  assert.equal(workloadFitTone("平日日中", "稼働量は面談で相談"), "neutral");

  const reasons = visiblePreferenceReasons({
    title: "Frontend engineer",
    workload: "稼働量は面談で相談",
    workPreference: {
      status: "active",
      workload: "平日日中",
      lastConfirmedAt: new Date(),
    },
  }, 6);
  assert.equal(reasons.find((reason) => reason.label === "稼働量要確認")?.tone, "neutral");
});
