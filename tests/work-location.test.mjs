import assert from "node:assert/strict";
import test from "node:test";

const {
  filterJobsByRemoteWorkIntent,
  filterRemoteCompatibleJobs,
  isRemoteCompatibleWorkLocation,
  matchesRemoteWorkIntent,
  normalizeWorkLocation,
  remoteWorkIntentFromSavedFeed,
  remoteWorkIntentLabel,
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
    [{ remotePolicy: "一部リモート" }, "hybrid", true],
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

test("remote intent filtering separates full remote, hybrid, and broad remote semantics", () => {
  const jobs = [
    { id: "remote", remotePolicy: "リモート可" },
    { id: "full-remote", remotePolicy: "フルリモート" },
    { id: "online", location: "全国リモート" },
    { id: "hybrid", remotePolicy: "週1出社" },
    { id: "partial", remotePolicy: "一部リモート" },
    { id: "onsite", remotePolicy: "常駐必須" },
  ];

  assert.deepEqual(filterJobsByRemoteWorkIntent(jobs, "full_remote").map((job) => job.id), ["full-remote", "online"]);
  assert.deepEqual(filterJobsByRemoteWorkIntent(jobs, "hybrid").map((job) => job.id), ["hybrid", "partial"]);
  assert.deepEqual(filterJobsByRemoteWorkIntent(jobs, "remote").map((job) => job.id), ["remote", "full-remote", "online", "hybrid", "partial"]);
  assert.equal(matchesRemoteWorkIntent({ remotePolicy: "週1出社" }, "full_remote"), false);
});

test("saved feed remote intent preserves legacy broad remote defaults", () => {
  assert.equal(remoteWorkIntentFromSavedFeed({ remote: true, remoteIntent: null }), "remote");
  assert.equal(remoteWorkIntentFromSavedFeed({ remote: true, remoteIntent: "full_remote" }), "full_remote");
  assert.equal(remoteWorkIntentFromSavedFeed({ remote: false, remoteIntent: null }), "");
  assert.equal(remoteWorkIntentLabel("hybrid"), "一部リモート/ハイブリッド");
});
