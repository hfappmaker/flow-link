import assert from "node:assert/strict";
import test from "node:test";

const {
  filterRemoteCompatibleJobs,
  isRemoteCompatibleWorkLocation,
  normalizeWorkLocation,
} = await import("../src/lib/work-location.ts");

test("work location normalization classifies remote aliases and negative phrases", () => {
  const cases = [
    [{ remotePolicy: "リモート可" }, "remote_allowed", true],
    [{ remotePolicy: "フルリモート" }, "remote_required_or_primary", true],
    [{ remotePolicy: "在宅可" }, "remote_allowed", true],
    [{ remotePolicy: "オンライン" }, "remote_required_or_primary", true],
    [{ remotePolicy: "remote OK" }, "remote_allowed", true],
    [{ location: "全国リモート" }, "remote_required_or_primary", true],
    [{ remotePolicy: "週1出社" }, "hybrid", true],
    [{ remotePolicy: "ハイブリッド" }, "hybrid", true],
    [{ remotePolicy: "常駐必須" }, "onsite_required", false],
    [{ remotePolicy: "リモート不可" }, "remote_not_allowed", false],
    [{ remotePolicy: "remote not allowed" }, "remote_not_allowed", false],
    [{ location: "東京都渋谷区" }, "unknown", false],
  ];

  for (const [input, expectedKind, expectedRemoteCompatible] of cases) {
    const semantics = normalizeWorkLocation(input);
    assert.equal(semantics.kind, expectedKind, JSON.stringify(input));
    assert.equal(semantics.remoteCompatible, expectedRemoteCompatible, JSON.stringify(input));
    assert.equal(isRemoteCompatibleWorkLocation(input), expectedRemoteCompatible, JSON.stringify(input));
  }
});

test("remote discovery filtering includes compatible aliases and excludes onsite or negative text", () => {
  const jobs = [
    { id: "remote", remotePolicy: "リモート可" },
    { id: "full-remote", remotePolicy: "フルリモート" },
    { id: "wfh", remotePolicy: "在宅可" },
    { id: "hybrid", remotePolicy: "週1出社" },
    { id: "onsite", remotePolicy: "常駐必須" },
    { id: "negative", remotePolicy: "リモート不可" },
    { id: "unknown", location: "東京都" },
  ];

  assert.deepEqual(filterRemoteCompatibleJobs(jobs).map((job) => job.id), ["remote", "full-remote", "wfh", "hybrid"]);
});
